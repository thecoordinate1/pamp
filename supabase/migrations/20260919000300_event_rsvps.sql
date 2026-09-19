-- Fixes an omission in 20260919000100: events, guest_requests, orders and
-- tickets were created, but no RSVP table. Retiring the legacy `rsvps` table in
-- 20260919000200 would otherwise leave the app's core action with nowhere to go.
--
-- Attendance has two visibility layers:
--   1. private  - people attending the same event can see each other
--   2. public   - shown in "Attending this event" to anyone, signed in or not
-- The public layer is double-gated: the attendee opts in (show_publicly) AND the
-- host features them (featured_by_host). Neither side can do it alone.

create table public.event_rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  show_publicly boolean not null default false,
  featured_by_host boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id),
  -- The double gate, enforced by the schema rather than by trust.
  constraint featured_requires_opt_in check (not featured_by_host or show_publicly)
);
create index event_rsvps_user_idx on public.event_rsvps (user_id);
create index event_rsvps_public_idx on public.event_rsvps (event_id)
  where show_publicly and featured_by_host;

-- Keeps events.rsvp_count honest without trusting the client to maintain it.
create function public.sync_rsvp_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.events set rsvp_count = rsvp_count + 1 where id = new.event_id;
    return new;
  else
    update public.events set rsvp_count = greatest(0, rsvp_count - 1) where id = old.event_id;
    return old;
  end if;
end $$;

create trigger event_rsvps_count after insert or delete on public.event_rsvps
  for each row execute function public.sync_rsvp_count();

-- Attendee owns show_publicly; host owns featured_by_host. Each is blocked from
-- writing the other's column, so a host cannot expose someone who never opted in
-- and an attendee cannot feature themselves.
create function public.protect_rsvp_visibility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_privileged() then
    return new;
  end if;
  if (select auth.uid()) <> old.user_id then
    new.show_publicly := old.show_publicly;
  end if;
  if not public.is_event_host(old.event_id) then
    new.featured_by_host := old.featured_by_host;
  end if;
  new.event_id := old.event_id;
  new.user_id := old.user_id;
  return new;
end $$;

create trigger event_rsvps_protect before update on public.event_rsvps
  for each row execute function public.protect_rsvp_visibility();

-- Host, ticket holder or someone who has RSVP'd. SECURITY DEFINER so the policies
-- below do not recurse back through this table's own RLS.
create function public.attends_event(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_event_host(p_event)
    or exists (
      select 1 from public.event_rsvps r
      where r.event_id = p_event and r.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.tickets t
      where t.event_id = p_event and t.user_id = (select auth.uid())
        and t.status <> 'void'
    )
$$;

-- Fields the UI already shows that had no column: the host's organisation on
-- business events, and the vibe score rendered by VibeRating.
alter table public.events
  add column organization text,
  add column vibe_score smallint check (vibe_score between 0 and 100);

alter table public.event_rsvps enable row level security;
revoke all on public.event_rsvps from anon, authenticated;
grant select on public.event_rsvps to anon;
grant select, insert, update, delete on public.event_rsvps to authenticated;

-- Layer 2: the public "Attending this event" list.
create policy "featured attendees are public" on public.event_rsvps
  for select to anon, authenticated
  using (show_publicly and featured_by_host);

-- Layer 1: people at the same event see each other.
create policy "attendees see each other" on public.event_rsvps
  for select to authenticated
  using (user_id = (select auth.uid()) or public.attends_event(event_id));

create policy "guests rsvp for themselves" on public.event_rsvps
  for insert to authenticated
  with check (user_id = (select auth.uid()) and not featured_by_host);
create policy "attendees set own visibility" on public.event_rsvps
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "hosts feature opted-in attendees" on public.event_rsvps
  for update to authenticated
  using (public.is_event_host(event_id)) with check (public.is_event_host(event_id));
create policy "guests cancel own rsvp" on public.event_rsvps
  for delete to authenticated using (user_id = (select auth.uid()));
