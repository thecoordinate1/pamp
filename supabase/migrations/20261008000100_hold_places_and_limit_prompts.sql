-- Pending orders hold their places, and payment prompts are limited.
--
-- B1 (security review 2026-10-04): create_order counted only issued passes
-- against capacity, and paying never checked again. On a capped paid event,
-- every buyer passed the check while no passes existed yet, so a hundred-place
-- event could take three hundred payments. Now:
--   - an order still being paid for (pending, hold not run out) holds its
--     places, so the check counts those too. One with no expiry at all holds
--     them until it is settled. Places come free by the clock, so this does
--     not depend on expire_stale_orders having run;
--   - when a payment lands, mark_order_paid checks again under the event lock.
--     If the order's places have gone, typically because it was paid after its
--     hold ran out, no passes are issued: the order is marked failed, which
--     gives back any points, and it goes on the admin's "Payments to check"
--     list to be refunded. Nothing is issued or dropped silently.
--
-- B3: create_order stored any text as the payer's number and let one person
-- open unlimited payment prompts, each one buzzing the number's phone. Now a
-- mobile money order needs a valid Zambian number, stored normalised
-- (260XXXXXXXXX), with at most three prompts waiting per number and five per
-- buyer.

-- Places taken at an event: passes not cancelled, plus places held by orders
-- still waiting to be paid. p_except leaves one order out, for checking
-- whether that order still fits.
create function public.places_taken(p_event uuid, p_except uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select (
    select count(*)::integer from public.tickets t
     where t.event_id = p_event and t.status <> 'void'
       and (p_except is null or t.order_id <> p_except)
  ) + (
    select coalesce(sum(o.quantity), 0)::integer from public.orders o
     where o.event_id = p_event and o.status = 'pending' and coalesce(o.expires_at, 'infinity') > now()
       and (p_except is null or o.id <> p_except)
  )
$$;

revoke execute on function public.places_taken(uuid, uuid) from public, anon, authenticated;

create or replace function public.create_order(
  p_event_id uuid,
  p_quantity integer,
  p_method public.payment_method default 'free',
  p_msisdn text default null,
  p_points integer default 0
) returns public.orders
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_event public.events;
  v_unit integer;
  v_subtotal integer;
  v_fee integer;
  v_hold integer;
  v_sold integer;
  v_value integer;
  v_points integer := 0;
  v_discount integer := 0;
  v_total integer;
  v_msisdn text;
  v_order public.orders;
begin
  if v_user is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Choose between 1 and 10 passes' using errcode = '22023';
  end if;
  if coalesce(p_points, 0) < 0 then
    raise exception 'Points cannot be negative' using errcode = '22023';
  end if;

  -- Locked so two people buying the last places at once are served one after
  -- the other, and the capacity check below sees the first one's passes.
  select * into v_event from public.events e where e.id = p_event_id for no key update;
  if v_event.id is null or v_event.status <> 'published' then
    raise exception 'That event is not open for passes' using errcode = '22023';
  end if;

  -- Someone who already holds a free pass gets it back. This runs before the
  -- capacity check so a holder is never told the event is full. The lock makes
  -- a double tap wait for the first claim and then find its order, and it
  -- works whatever duplicates the table held before this change.
  if v_event.ticket_price_ngwee = 0 then
    perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_event_id::text, 0));

    select * into v_order
      from public.orders o
     where o.event_id = p_event_id and o.user_id = v_user
       and o.method = 'free' and o.status = 'paid'
     order by o.created_at
     limit 1;

    if v_order.id is not null then
      perform public.issue_tickets_for_order(v_order.id);
      return v_order;
    end if;
  end if;

  -- Places already taken: passes issued and orders still being paid for. A
  -- pending order holds its places until it is paid or expires, so a capped
  -- event cannot take more payments than it has room for.
  if v_event.capacity is not null then
    v_sold := public.places_taken(p_event_id, null);
    if v_sold + p_quantity > v_event.capacity then
      raise exception 'Not enough passes left' using errcode = '22023';
    end if;
  end if;

  -- A paid order sends a payment prompt to a phone, so it needs a real
  -- Zambian mobile number, and nobody may keep many prompts open: at most
  -- three per number, whoever asks, and five per buyer.
  if v_event.ticket_price_ngwee > 0 and p_method in ('mtn', 'airtel', 'zamtel') then
    v_msisdn := public.normalize_msisdn(p_msisdn);
    if v_msisdn is null then
      raise exception 'Enter a valid Zambian mobile money number' using errcode = '22023';
    end if;
    if (select count(*) from public.orders o
         where o.msisdn = v_msisdn and o.status = 'pending' and coalesce(o.expires_at, 'infinity') > now()) >= 3 then
      raise exception 'That number already has payments waiting. Approve or let them expire first.'
        using errcode = '22023';
    end if;
  end if;
  if v_event.ticket_price_ngwee > 0
     and (select count(*) from public.orders o
           where o.user_id = v_user and o.status = 'pending' and coalesce(o.expires_at, 'infinity') > now()) >= 5 then
    raise exception 'You have several orders waiting for payment. Finish or let them expire first.'
      using errcode = '22023';
  end if;

  v_unit := v_event.ticket_price_ngwee;
  v_subtotal := v_unit * p_quantity;
  v_fee := case when v_subtotal = 0 then 0 else public.compute_fee(v_subtotal) end;
  select s.order_hold_minutes, s.point_value_ngwee into v_hold, v_value
    from public.platform_settings s where s.id = 1;

  if coalesce(p_points, 0) > 0 then
    if v_subtotal = 0 then
      raise exception 'Points can only be used on paid passes' using errcode = '22023';
    end if;
    -- Earning is open to everyone; spending is not, so an account made up to
    -- collect points cannot cash them in.
    if not exists (
      select 1 from public.profiles p
       where p.id = v_user and p.identity_verified_at is not null
    ) then
      raise exception 'Get your profile verified to spend points' using errcode = '42501';
    end if;

    -- Unpaid orders past their hold give their points back first.
    update public.orders
       set status = 'expired'
     where user_id = v_user and status = 'pending'
       and expires_at is not null and expires_at < now();

    v_value := coalesce(v_value, 10);
    -- Never more points than the order needs.
    v_points := least(p_points, ceil((v_subtotal + v_fee)::numeric / v_value)::integer);
    v_discount := least(v_subtotal + v_fee, v_points * v_value);
    if public.lock_point_wallet(v_user) < v_points then
      raise exception 'You do not have that many points' using errcode = '22023';
    end if;
  end if;

  v_total := v_subtotal + v_fee - v_discount;

  insert into public.orders (
    event_id, user_id, quantity, unit_price_ngwee, subtotal_ngwee,
    fee_ngwee, total_ngwee, status, method, msisdn, expires_at, paid_at,
    points_used, points_discount_ngwee
  ) values (
    p_event_id, v_user, p_quantity, v_unit, v_subtotal,
    v_fee, v_total,
    case when v_total = 0 then 'paid'::public.order_status else 'pending'::public.order_status end,
    case
      when v_subtotal = 0 then 'free'::public.payment_method
      when v_total = 0 then 'points'::public.payment_method
      else p_method
    end,
    coalesce(v_msisdn, nullif(p_msisdn, '')),
    case when v_total = 0 then null else now() + make_interval(mins => coalesce(v_hold, 15)) end,
    case when v_total = 0 then now() else null end,
    v_points, v_discount
  )
  returning * into v_order;

  if v_points > 0 then
    perform public.add_points(v_user, -v_points, 'pass_discount', p_event_id, v_order.id);
  end if;

  -- Free events, and passes points paid for in full, complete immediately;
  -- the rest wait for the provider webhook.
  if v_order.status = 'paid' then
    perform public.issue_tickets_for_order(v_order.id);
  end if;

  return v_order;
end $$;

alter table public.payment_reviews drop constraint payment_reviews_reason_check;
alter table public.payment_reviews add constraint payment_reviews_reason_check
  check (reason in ('order_not_payable', 'amount_mismatch', 'reference_mismatch', 'over_capacity'));

-- Called by the payment functions with the service role. The event row is
-- locked before the order, the same order create_order takes them in.
create or replace function public.mark_order_paid(p_order uuid, p_provider_reference text)
returns public.orders
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_capacity integer;
  v_order public.orders;
begin
  select o.event_id into v_event_id from public.orders o where o.id = p_order;
  if v_event_id is null then
    raise exception 'Order not found or not payable';
  end if;
  select e.capacity into v_capacity from public.events e where e.id = v_event_id for no key update;

  select * into v_order from public.orders o where o.id = p_order for update;
  if v_order.status not in ('pending', 'paid') then
    raise exception 'Order not found or not payable';
  end if;

  if v_order.status = 'pending' then
    if v_capacity is not null
       and public.places_taken(v_event_id, v_order.id) + v_order.quantity > v_capacity then
      -- Paid, but the places are gone. Failing the order returns its points;
      -- the money goes to an admin to refund.
      update public.orders
         set status = 'failed', provider_reference = coalesce(provider_reference, p_provider_reference)
       where id = v_order.id
      returning * into v_order;
      insert into public.payment_reviews (order_id, reason, provider_reference)
      values (v_order.id, 'over_capacity', p_provider_reference)
      on conflict (order_id, reason) do nothing;
      return v_order;
    end if;

    update public.orders
       set status = 'paid', paid_at = coalesce(paid_at, now()),
           provider_reference = coalesce(provider_reference, p_provider_reference)
     where id = v_order.id
    returning * into v_order;
  end if;

  perform public.issue_tickets_for_order(v_order.id);
  return v_order;
end $$;

revoke execute on function public.mark_order_paid(uuid, text) from public, anon, authenticated;
