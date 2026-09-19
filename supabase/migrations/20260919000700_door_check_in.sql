-- Door check-in. Clients hold SELECT on tickets and nothing more, so the only
-- way a pass changes state is through these functions, which verify that the
-- caller actually hosts the event before touching anything.

create function public.check_in_ticket(p_code text)
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
   where t.code = upper(btrim(coalesce(p_code, '')));

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

  -- Scanning twice is normal at a busy door: report it rather than fail, and
  -- keep the original time so the record stays truthful.
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

-- For the inevitable mis-scan at the door.
create function public.undo_check_in(p_code text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ticket public.tickets;
begin
  select * into v_ticket
    from public.tickets t
   where t.code = upper(btrim(coalesce(p_code, '')));

  if v_ticket.id is null then
    raise exception 'No pass with that code' using errcode = 'P0002';
  end if;
  if not public.is_event_host(v_ticket.event_id) then
    raise exception 'Only the host can undo a check-in' using errcode = '42501';
  end if;

  update public.tickets
     set status = 'valid', checked_in_at = null, checked_in_by = null
   where id = v_ticket.id and status = 'checked_in';

  return found;
end $$;

revoke execute on function public.check_in_ticket(text) from public, anon;
revoke execute on function public.undo_check_in(text) from public, anon;
grant execute on function public.check_in_ticket(text) to authenticated;
grant execute on function public.undo_check_in(text) to authenticated;
