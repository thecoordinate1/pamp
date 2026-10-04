-- Attendance, one pass per person, and two guards that were not doing their job.
--
-- 1. events.attended_count: how many people the host let in at the door. The
--    database keeps it from ticket check-ins, so anyone can be shown it.
-- 2. The counters on events belong to the database. Hosts hold a table-wide
--    UPDATE grant on their own events, which until now let a host set
--    rsvp_count to any number; attended_count would have inherited that.
-- 3. A free event gives each person one order. Claiming again returns the pass
--    they already hold instead of minting new ones on every tap.
-- 4. protect_rsvp_visibility() was SECURITY DEFINER. Inside a definer function
--    current_user is the owner, so is_privileged() was always true and the
--    guard returned before checking anything: attendees could feature
--    themselves, and hosts could make public anyone who had never opted in.
-- 5. An attendee can always leave public view, including after being featured.
-- 6. What the broken guards let through is not trusted: RSVP totals are
--    recounted, and every public listing is withdrawn so attendees opt back in.

-- 1. Attendance ---------------------------------------------------------------

alter table public.events
  add column attended_count integer not null default 0 check (attended_count >= 0);

update public.events e
   set attended_count = c.n
  from (select t.event_id, count(*)::integer as n
          from public.tickets t
         where t.status = 'checked_in'
         group by t.event_id) c
 where c.event_id = e.id;

-- 6. Before the guards below existed, a host could set rsvp_count to anything
-- and RSVP rows could be rewritten freely. Recount every total from its rows,
-- and withdraw every public listing: nothing records which were real opt-ins
-- and which a host forced, and being listed publicly is the attendee's call.
update public.events e
   set rsvp_count = c.n
  from (select ev.id,
               (select count(*)::integer from public.event_rsvps r where r.event_id = ev.id) as n
          from public.events ev) c
 where c.id = e.id
   and e.rsvp_count is distinct from c.n;

update public.event_rsvps
   set show_publicly = false, featured_by_host = false
 where show_publicly or featured_by_host;

-- Adjusts by one rather than recounting. When two door phones check people in
-- at the same moment, "attended_count + 1" re-reads the row the other update
-- just wrote, whereas a recount taken from the older snapshot would overwrite
-- it and lose a guest.
create function public.sync_attended_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_was boolean := false;
  v_is boolean := false;
begin
  if tg_op <> 'INSERT' then
    v_was := old.status = 'checked_in';
  end if;
  if tg_op <> 'DELETE' then
    v_is := new.status = 'checked_in';
  end if;

  -- A pass scanned again stays one person.
  if tg_op = 'UPDATE' and v_was and v_is and new.event_id = old.event_id then
    return null;
  end if;

  if v_was then
    update public.events set attended_count = greatest(0, attended_count - 1)
     where id = old.event_id;
  end if;
  if v_is then
    update public.events set attended_count = attended_count + 1
     where id = new.event_id;
  end if;
  return null;
end $$;

create trigger tickets_attended_count
  after insert or delete or update of status, event_id on public.tickets
  for each row execute function public.sync_attended_count();

-- 2. Counters are the database's ----------------------------------------------

-- SECURITY INVOKER on purpose: current_user has to be the real caller. A host's
-- own UPDATE arrives as authenticated and is held to the rules, while the sync
-- triggers, which run as the table owner, pass. Admins are held to them too:
-- nobody needs to set a count by hand through the app.
create function public.protect_event_counters() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.rsvp_count := 0;
    new.attended_count := 0;
  else
    new.rsvp_count := old.rsvp_count;
    new.attended_count := old.attended_count;
  end if;
  return new;
end $$;

create trigger events_protect_counters
  before insert or update on public.events
  for each row execute function public.protect_event_counters();

-- 3. One free order per person ------------------------------------------------

create or replace function public.create_order(
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

-- 4 and 5. Attendee visibility ------------------------------------------------

-- Now SECURITY INVOKER, for the same reason as protect_event_counters above.
-- Admins get no exception here: being listed publicly is the attendee's
-- consent to give, whoever is asking.
create or replace function public.protect_rsvp_visibility() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if (select auth.uid()) is distinct from old.user_id then
      new.show_publicly := old.show_publicly;
    end if;
    if not public.is_event_host(old.event_id) then
      new.featured_by_host := old.featured_by_host;
    end if;
    new.event_id := old.event_id;
    new.user_id := old.user_id;
  end if;
  -- Withdrawing the opt-in also withdraws the host's feature. Without this the
  -- featured_requires_opt_in check rejects the change, and someone the host
  -- featured could never take themselves back out of public view.
  if old.show_publicly and not new.show_publicly then
    new.featured_by_host := false;
  end if;
  return new;
end $$;
