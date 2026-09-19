-- Server-side ordering. Clients may read orders and tickets but never write
-- them (see 20260919000100), so every state change goes through these functions.
-- That is what stops someone marking their own order paid.

create function public.generate_ticket_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_code text;
  v_tries integer := 0;
begin
  loop
    -- Readable on a phone screen and short enough to type at the door.
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.tickets t where t.code = v_code);
    v_tries := v_tries + 1;
    if v_tries > 20 then
      raise exception 'Could not allocate a ticket code';
    end if;
  end loop;
  return v_code;
end $$;

create function public.issue_tickets_for_order(p_order uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_existing integer;
  i integer;
begin
  select * into v_order from public.orders o where o.id = p_order;
  if v_order.id is null then
    raise exception 'Order not found';
  end if;
  if v_order.status <> 'paid' then
    raise exception 'Order is not paid';
  end if;

  -- Idempotent: a webhook that fires twice must not double-issue.
  select count(*) into v_existing from public.tickets t where t.order_id = p_order;
  if v_existing >= v_order.quantity then
    return 0;
  end if;

  for i in 1 .. (v_order.quantity - v_existing) loop
    insert into public.tickets (order_id, event_id, user_id, code)
    values (p_order, v_order.event_id, v_order.user_id, public.generate_ticket_code());
  end loop;

  -- A ticket holder is attending, so they belong on the guest list. Their
  -- visibility defaults to private until they opt in.
  insert into public.event_rsvps (event_id, user_id)
  values (v_order.event_id, v_order.user_id)
  on conflict (event_id, user_id) do nothing;

  return v_order.quantity - v_existing;
end $$;

-- The only entry point a signed-in buyer may call.
create function public.create_order(
  p_event_id uuid,
  p_quantity integer,
  p_method public.payment_method default 'free',
  p_msisdn text default null
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
  v_order public.orders;
begin
  if v_user is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Choose between 1 and 10 passes' using errcode = '22023';
  end if;

  select * into v_event from public.events e where e.id = p_event_id;
  if v_event.id is null or v_event.status <> 'published' then
    raise exception 'That event is not open for passes' using errcode = '22023';
  end if;

  if v_event.capacity is not null then
    select coalesce(count(*), 0) into v_sold
      from public.tickets t
     where t.event_id = p_event_id and t.status <> 'void';
    if v_sold + p_quantity > v_event.capacity then
      raise exception 'Not enough passes left' using errcode = '22023';
    end if;
  end if;

  v_unit := v_event.ticket_price_ngwee;
  v_subtotal := v_unit * p_quantity;
  v_fee := case when v_subtotal = 0 then 0 else public.compute_fee(v_subtotal) end;
  select s.order_hold_minutes into v_hold from public.platform_settings s where s.id = 1;

  insert into public.orders (
    event_id, user_id, quantity, unit_price_ngwee, subtotal_ngwee,
    fee_ngwee, total_ngwee, status, method, msisdn, expires_at, paid_at
  ) values (
    p_event_id, v_user, p_quantity, v_unit, v_subtotal,
    v_fee, v_subtotal + v_fee,
    case when v_subtotal = 0 then 'paid'::public.order_status else 'pending'::public.order_status end,
    case when v_subtotal = 0 then 'free'::public.payment_method else p_method end,
    nullif(p_msisdn, ''),
    case when v_subtotal = 0 then null else now() + make_interval(mins => coalesce(v_hold, 15)) end,
    case when v_subtotal = 0 then now() else null end
  )
  returning * into v_order;

  -- Free events complete immediately; paid ones wait for the provider webhook.
  if v_order.status = 'paid' then
    perform public.issue_tickets_for_order(v_order.id);
  end if;

  return v_order;
end $$;

-- Called by the payment webhook running as service_role, never by a browser.
create function public.mark_order_paid(p_order uuid, p_provider_reference text)
returns public.orders
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_order public.orders;
begin
  update public.orders
     set status = 'paid', paid_at = coalesce(paid_at, now()),
         provider_reference = coalesce(provider_reference, p_provider_reference)
   where id = p_order and status in ('pending', 'paid')
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Order not found or not payable';
  end if;

  perform public.issue_tickets_for_order(v_order.id);
  return v_order;
end $$;

create function public.expire_stale_orders() returns integer
language sql volatile security definer set search_path = '' as $$
  with done as (
    update public.orders set status = 'expired'
     where status = 'pending' and expires_at is not null and expires_at < now()
    returning 1
  )
  select count(*)::integer from done
$$;

revoke execute on function public.generate_ticket_code() from public, anon, authenticated;
revoke execute on function public.issue_tickets_for_order(uuid) from public, anon, authenticated;
revoke execute on function public.mark_order_paid(uuid, text) from public, anon, authenticated;
revoke execute on function public.expire_stale_orders() from public, anon, authenticated;

revoke execute on function public.create_order(uuid, integer, public.payment_method, text) from public, anon;
grant execute on function public.create_order(uuid, integer, public.payment_method, text) to authenticated;
