-- Passes are single use, and can be handed to friends.
--
-- A pass admits one person, once: the door scan uses it up, and any later scan
-- of that code is refused as already used. That rule is what makes sharing
-- safe. Someone holding several passes can send any unused one to a friend as
-- a private link; the friend shows its QR at the door, and after the scan it is
-- spent for everyone, the sender included.
--
-- A link carries a long random token rather than the pass code. Codes are kept
-- short so they can be typed at the door, which also makes them guessable, so
-- only an event's host can ever look a pass up by code.

alter table public.tickets
  add column share_token text unique check (share_token ~ '^[0-9a-f]{64}$'),
  add column shared_at timestamptz;

-- Check-in now locks the pass before deciding. Without the lock, two door
-- phones scanning the same shared code at the same moment could each read it
-- as unused and both let someone in.
create or replace function public.check_in_ticket(p_code text)
returns table (
  ticket_id uuid,
  code text,
  holder_name text,
  event_name text,
  checked_in_at timestamptz,
  was_already_in boolean
)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ticket public.tickets;
  v_event public.events;
  v_holder text;
  v_already boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;

  select * into v_ticket
    from public.tickets t
   where t.code = upper(btrim(coalesce(p_code, '')))
     for update;

  if v_ticket.id is null then
    raise exception 'No pass with that code' using errcode = 'P0002';
  end if;

  select * into v_event from public.events e where e.id = v_ticket.event_id;
  if v_event.host_id is distinct from (select auth.uid()) then
    raise exception 'Only the host can check people in' using errcode = '42501';
  end if;

  if v_ticket.status = 'void' then
    raise exception 'That pass was cancelled' using errcode = '22023';
  end if;

  -- A used pass is reported, not re-admitted: was_already_in tells the door
  -- who used it and when, and nothing about the record changes.
  if v_ticket.status = 'checked_in' then
    v_already := true;
  else
    update public.tickets
       set status = 'checked_in',
           checked_in_at = now(),
           checked_in_by = (select auth.uid())
     where id = v_ticket.id
    returning * into v_ticket;
  end if;

  select p.display_name into v_holder from public.profiles p where p.id = v_ticket.user_id;

  return query
    select v_ticket.id, v_ticket.code, coalesce(nullif(v_holder, ''), 'Guest'),
           v_event.name, v_ticket.checked_in_at, v_already;
end $$;

-- The holder gets the private link for one of their unused passes. The same
-- pass always gives the same link until it is taken back.
create function public.share_pass(p_code text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_ticket public.tickets;
  v_token text;
begin
  if v_user is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;

  select * into v_ticket
    from public.tickets t
   where t.code = upper(btrim(coalesce(p_code, '')))
     for update;
  if v_ticket.id is null or v_ticket.user_id <> v_user then
    raise exception 'No pass with that code' using errcode = 'P0002';
  end if;
  if v_ticket.status <> 'valid' then
    raise exception 'This pass has already been used' using errcode = '22023';
  end if;
  if v_ticket.share_token is not null then
    return v_ticket.share_token;
  end if;

  -- Two random UUIDs: 244 random bits, as hex, safe in a URL.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  update public.tickets set share_token = v_token, shared_at = now() where id = v_ticket.id;
  return v_token;
end $$;

-- For a pass sent to the wrong person: it gets a new code and loses its link,
-- so neither the old QR nor the old link works any more. Returns the new code.
create function public.reclaim_pass(p_code text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_ticket public.tickets;
  v_code text;
begin
  if v_user is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;

  select * into v_ticket
    from public.tickets t
   where t.code = upper(btrim(coalesce(p_code, '')))
     for update;
  if v_ticket.id is null or v_ticket.user_id <> v_user then
    raise exception 'No pass with that code' using errcode = 'P0002';
  end if;
  if v_ticket.status <> 'valid' then
    raise exception 'This pass has already been used' using errcode = '22023';
  end if;

  v_code := public.generate_ticket_code();
  update public.tickets
     set code = v_code, share_token = null, shared_at = null
   where id = v_ticket.id;
  return v_code;
end $$;

-- What a friend opening a shared link sees, signed in or not: one pass, its
-- event, who sent it, and where to go. A pass holder is trusted with the exact
-- address, and sharing the pass extends that trust to the friend; taking the
-- pass back withdraws it. A used pass still shows, marked used, so the card
-- stays a record of the night.
create function public.view_shared_pass(p_token text)
returns table (
  code text,
  status public.ticket_status,
  checked_in_at timestamptz,
  event_id uuid,
  event_name text,
  starts_on date,
  start_time text,
  area text,
  image_url text,
  from_name text,
  full_address text,
  latitude double precision,
  longitude double precision
)
language sql stable security definer set search_path = '' as $$
  select t.code, t.status, t.checked_in_at,
         e.id, e.name, e.starts_on, e.start_time, e.area, e.image_url,
         coalesce(nullif(p.display_name, ''), 'A friend'),
         nullif(ep.full_address, ''), ep.latitude, ep.longitude
    from public.tickets t
    join public.events e on e.id = t.event_id
    join public.profiles p on p.id = t.user_id
    left join public.event_private ep on ep.event_id = e.id
   where p_token ~ '^[0-9a-f]{64}$'
     and t.share_token = p_token
     and t.status <> 'void'
$$;

revoke execute on function public.share_pass(text) from public, anon;
revoke execute on function public.reclaim_pass(text) from public, anon;
grant execute on function public.share_pass(text) to authenticated;
grant execute on function public.reclaim_pass(text) to authenticated;
grant execute on function public.view_shared_pass(text) to anon, authenticated;
