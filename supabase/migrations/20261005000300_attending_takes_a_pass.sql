-- Being "at" an event now takes a pass, an approved request or a free RSVP.
--
-- attends_event() returned true for any RSVP, and anyone could RSVP to any
-- event, including paid ones they never bought a pass for and drafts. So
-- one RSVP per event unlocked every guest who had opted in to "Show me in
-- this list", with their profile and now their profile picture: opted-in
-- guests agreed to be seen by the other people at the event, which cost
-- nothing to claim to be. (Security review 2026-10-04, finding A2.)
--
-- Now someone attends an event when they host it, hold a pass that has not
-- been cancelled, were approved through a request, or RSVP'd to a published
-- free event, where an RSVP is how you go. An RSVP to a paid event still
-- records interest and still counts towards "going", but no longer lets
-- anyone see the guest list. RSVPs can only be made to published events.

create or replace function public.attends_event(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_event_host(p_event)
    or exists (
      select 1 from public.tickets t
       where t.event_id = p_event and t.user_id = (select auth.uid())
         and t.status <> 'void'
    )
    or exists (
      select 1 from public.guest_requests g
       where g.event_id = p_event and g.user_id = (select auth.uid())
         and g.status = 'approved'
    )
    or exists (
      select 1
        from public.event_rsvps r
        join public.events e on e.id = r.event_id
       where r.event_id = p_event and r.user_id = (select auth.uid())
         and e.status = 'published' and e.ticket_price_ngwee = 0
    )
$$;

-- As in 20261004000400, except the first clause now asks attends_event()
-- rather than accepting any RSVP of the caller's.
create or replace function public.shares_event_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    -- p_user has opted in at an event the caller is attending.
    exists (
      select 1
        from public.event_rsvps theirs
       where theirs.user_id = p_user
         and theirs.show_publicly
         and public.attends_event(theirs.event_id)
    )
    -- The caller hosts an event p_user is attending or has asked to join.
    or exists (
      select 1 from public.events e
       where e.host_id = (select auth.uid())
         and (
           exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = p_user)
           or exists (select 1 from public.guest_requests g where g.event_id = e.id and g.user_id = p_user)
         )
    )
    -- p_user hosts an event the caller is attending or has asked to join.
    or exists (
      select 1 from public.events e
       where e.host_id = p_user
         and (
           exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = (select auth.uid()))
           or exists (select 1 from public.guest_requests g where g.event_id = e.id and g.user_id = (select auth.uid()))
         )
    )
$$;

drop policy "guests rsvp for themselves" on public.event_rsvps;
create policy "guests rsvp for themselves" on public.event_rsvps
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not featured_by_host
    and exists (select 1 from public.events e where e.id = event_id and e.status = 'published')
  );
