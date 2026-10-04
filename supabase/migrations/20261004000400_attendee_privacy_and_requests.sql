-- Attendee privacy, and what a host can see of people asking to join.
--
-- 1. Guests who have not opted in are no longer shown to other guests. The
--    "attendees see each other" policy returned every RSVP at an event to every
--    other attendee, and shares_event_with() opened their profiles too, so a
--    guest's name and social handle reached the whole guest list while the app
--    told them only the host could see them. Now another guest appears only
--    once they turn on "Show me in this list"; the host still sees everyone.
-- 2. A host can see who is asking to join their event: the requester's profile
--    and the selfie sent with the request. Before, requests showed as "Guest"
--    with no photo, so a host approved or declined blind.

-- 1 ---------------------------------------------------------------------------

drop policy "attendees see each other" on public.event_rsvps;
create policy "attendees see opted-in guests" on public.event_rsvps
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_event_host(event_id)
    or (show_publicly and public.attends_event(event_id))
  );

-- Who may read whose profile because of an event they have in common.
create or replace function public.shares_event_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    -- p_user has opted in at an event the caller is also attending.
    exists (
      select 1
        from public.event_rsvps mine
        join public.event_rsvps theirs on theirs.event_id = mine.event_id
       where mine.user_id = (select auth.uid())
         and theirs.user_id = p_user
         and theirs.show_publicly
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

-- 2 ---------------------------------------------------------------------------

-- A selfie path is chosen by the requester's browser, so it is only honoured
-- when it sits in the requester's own folder: nobody can point a request at
-- someone else's photo to get a host a look at it.
create function public.can_view_request_selfie(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.guest_requests g
      join public.events e on e.id = g.event_id
     where g.selfie_path = p_path
       and e.host_id = (select auth.uid())
       and split_part(p_path, '/', 1) = g.user_id::text
  )
$$;

create policy "hosts see selfies sent with requests to their events" on storage.objects
  for select to authenticated
  using (bucket_id = 'selfies' and public.can_view_request_selfie(name));
