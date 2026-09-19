-- Profiles were world-readable ("profiles are public" in 20260914000120), so a
-- signed-out stranger could enumerate every user's name, headline and social
-- handle. Narrow that to: your own profile, people at the same event as you, and
-- attendees who are publicly featured.
--
-- Also replaces the instagram-only field with a platform + handle pair, since
-- attendees choose which social account to show.

alter table public.profiles
  add column social_platform text
    check (social_platform in ('instagram', 'tiktok', 'x', 'snapchat', 'facebook', 'whatsapp')),
  add column social_handle text
    check (social_handle is null or social_handle ~ '^[A-Za-z0-9._+-]{1,40}$');

update public.profiles
   set social_platform = 'instagram', social_handle = nullif(instagram, '')
 where nullif(instagram, '') is not null;

alter table public.profiles drop column instagram;

-- Opted in AND featured by the host, on any event.
create function public.is_publicly_featured(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.event_rsvps r
    where r.user_id = p_user and r.show_publicly and r.featured_by_host
  )
$$;

-- True when the caller and p_user are at the same event, in either direction,
-- including the host of an event the other attends.
create function public.shares_event_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.event_rsvps mine
      join public.event_rsvps theirs on theirs.event_id = mine.event_id
     where mine.user_id = (select auth.uid())
       and theirs.user_id = p_user
  ) or exists (
    select 1 from public.events e
     where e.host_id = (select auth.uid())
       and exists (
         select 1 from public.event_rsvps r
          where r.event_id = e.id and r.user_id = p_user
       )
  ) or exists (
    select 1 from public.events e
     where e.host_id = p_user
       and exists (
         select 1 from public.event_rsvps r
          where r.event_id = e.id and r.user_id = (select auth.uid())
       )
  )
$$;

drop policy "profiles are public" on public.profiles;

create policy "users read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "attendees read each other" on public.profiles
  for select to authenticated using (public.shares_event_with(id));
create policy "featured attendees are public" on public.profiles
  for select to anon, authenticated using (public.is_publicly_featured(id));

-- A featured attendee's facecard selfie is shown publicly with their row; every
-- other selfie stays private to the person who uploaded it. Paths are
-- <user-id>/<file>, so the first segment identifies the owner.
create policy "featured selfies are public" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'selfies'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.is_publicly_featured(((storage.foldername(name))[1])::uuid)
  );
