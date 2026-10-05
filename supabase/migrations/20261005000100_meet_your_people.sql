-- Meet your people: swipe through people going to the same event, and when two
-- people like each other, each gets the other's social handle.
--
-- 1. Settings. Meet is off until someone turns it on. What they are open to
--    (friendship, romance...) lives in its own table that only they can read;
--    anyone else only ever sees it on their card.
-- 2. Swipes and matches are written only by record_swipe, which checks who may
--    swipe on whom. People can read their own and nobody else's.
-- 3. Who sees a card: two people who both have Meet on and hold a live pass to
--    the same event, or who have matched. Never across a block. A card shows a
--    name, headline, what they are open to, the profile picture, and an age
--    worked out from account_private.birth_date (the date itself never leaves
--    the database). The social handle is not on the card: a match gives it.

-- 1. Settings -------------------------------------------------------------------

create table public.meet_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  visible boolean not null default false,
  intents text[] not null default '{}'
    check (intents <@ array['friendship', 'collab', 'mentorship', 'romance']::text[])
);

alter table public.meet_settings enable row level security;
revoke all on public.meet_settings from anon, authenticated;
grant select, insert, update on public.meet_settings to authenticated;

create policy "people see their own meet settings" on public.meet_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "people turn meet on for themselves" on public.meet_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "people change their own meet settings" on public.meet_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 2. Swipes and matches ---------------------------------------------------------

create table public.swipes (
  swiper_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  direction text not null check (direction in ('like', 'pass')),
  created_at timestamptz not null default now(),
  primary key (swiper_id, target_id, event_id),
  check (swiper_id <> target_id)
);

-- One row per pair, stored in a fixed order so a pair can only match once.
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  -- Where they matched. The match outlives the event.
  event_id uuid references public.events (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);
create index matches_user_b_idx on public.matches (user_b);

alter table public.swipes enable row level security;
alter table public.matches enable row level security;
revoke all on public.swipes, public.matches from anon, authenticated;
grant select on public.swipes, public.matches to authenticated;

create policy "people see their own swipes" on public.swipes
  for select to authenticated using (swiper_id = (select auth.uid()));
create policy "people see their own matches" on public.matches
  for select to authenticated using ((select auth.uid()) in (user_a, user_b));

-- 3. Who sees whom --------------------------------------------------------------

create function public.meet_is_on(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.meet_settings s where s.user_id = p_user and s.visible
  )
$$;

create function public.meet_has_pass(p_user uuid, p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tickets t
     where t.user_id = p_user and t.event_id = p_event and t.status <> 'void'
  )
$$;

-- Whether the signed-in person may see p_user's card.
create function public.meet_can_see(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and p_user <> (select auth.uid())
     and not public.is_blocked_between((select auth.uid()), p_user)
     and (
       exists (
         select 1 from public.matches m
          where m.user_a = least((select auth.uid()), p_user)
            and m.user_b = greatest((select auth.uid()), p_user)
       )
       or (
         public.meet_is_on((select auth.uid()))
         and public.meet_is_on(p_user)
         and exists (
           select 1
             from public.tickets mine
             join public.tickets theirs on theirs.event_id = mine.event_id
            where mine.user_id = (select auth.uid()) and mine.status <> 'void'
              and theirs.user_id = p_user and theirs.status <> 'void'
         )
       )
     )
$$;

-- A card's picture is the person's profile picture, and only one kept in their
-- own folder: nobody can point their profile at someone else's selfie.
create function public.can_view_meet_avatar(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.avatar_path = p_path
       and split_part(p_path, '/', 1) = p.id::text
       and public.meet_can_see(p.id)
  )
$$;

create policy "meet cards show profile pictures" on storage.objects
  for select to authenticated
  using (bucket_id = 'selfies' and public.can_view_meet_avatar(name));

-- 4. The deck, swiping and matches ----------------------------------------------

-- Up to 20 people at this event the caller has not swiped on or matched with.
create function public.meet_deck(p_event_id uuid)
returns table (
  id uuid,
  display_name text,
  headline text,
  looking_for text,
  intents text[],
  age integer,
  avatar_path text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;
  if not public.meet_is_on(v_user) then
    raise exception 'Turn on Meet your people first' using errcode = '42501';
  end if;
  if not public.meet_has_pass(v_user, p_event_id) then
    raise exception 'You need a pass for this event' using errcode = '42501';
  end if;

  return query
    select p.id, p.display_name, p.headline, p.looking_for, s.intents,
           extract(year from age(current_date, a.birth_date))::integer,
           p.avatar_path
      from public.meet_settings s
      join public.profiles p on p.id = s.user_id
      left join public.account_private a on a.user_id = p.id
     where s.visible
       and p.id <> v_user
       and public.meet_has_pass(p.id, p_event_id)
       and not public.is_blocked_between(v_user, p.id)
       and not exists (
         select 1 from public.swipes sw
          where sw.swiper_id = v_user and sw.target_id = p.id and sw.event_id = p_event_id
       )
       and not exists (
         select 1 from public.matches m
          where m.user_a = least(v_user, p.id) and m.user_b = greatest(v_user, p.id)
       )
     order by p.id
     limit 20;
end $$;

-- A like or a pass on someone the deck could show the caller for this event.
-- Neither person learns how the other swiped until both have liked: then the
-- match is made and the caller gets the other person's handle.
create function public.record_swipe(p_target_id uuid, p_event_id uuid, p_direction text)
returns table (
  matched boolean,
  display_name text,
  avatar_path text,
  social_platform text,
  social_handle text
)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;
  if p_direction is null or p_direction not in ('like', 'pass') then
    raise exception 'A swipe is a like or a pass' using errcode = '22023';
  end if;
  if p_target_id is null or p_target_id = v_user
     or not public.meet_is_on(v_user)
     or not public.meet_is_on(p_target_id)
     or not public.meet_has_pass(v_user, p_event_id)
     or not public.meet_has_pass(p_target_id, p_event_id)
     or public.is_blocked_between(v_user, p_target_id)
  then
    raise exception 'That person is not in your deck for this event' using errcode = '42501';
  end if;

  -- Two people liking each other at the same moment are served one after the
  -- other, so the second always sees the first one's like.
  perform pg_advisory_xact_lock(hashtextextended(
    least(v_user, p_target_id)::text || ':' || greatest(v_user, p_target_id)::text, 0));

  insert into public.swipes (swiper_id, target_id, event_id, direction)
  values (v_user, p_target_id, p_event_id, p_direction)
  on conflict do nothing;

  -- Both swipes on record must be likes, so a later like never overturns an
  -- earlier pass.
  if exists (
       select 1 from public.swipes sw
        where sw.swiper_id = v_user and sw.target_id = p_target_id
          and sw.event_id = p_event_id and sw.direction = 'like'
     )
     and exists (
       select 1 from public.swipes sw
        where sw.swiper_id = p_target_id and sw.target_id = v_user
          and sw.event_id = p_event_id and sw.direction = 'like'
     )
  then
    insert into public.matches (user_a, user_b, event_id)
    values (least(v_user, p_target_id), greatest(v_user, p_target_id), p_event_id)
    on conflict (user_a, user_b) do nothing;

    return query
      select true, p.display_name, p.avatar_path, p.social_platform, p.social_handle
        from public.profiles p
       where p.id = p_target_id;
    return;
  end if;

  return query select false, null::text, null::text, null::text, null::text;
end $$;

-- Everyone the caller has matched with, newest first, with their handle.
create function public.my_matches()
returns table (
  match_id uuid,
  matched_at timestamptz,
  event_name text,
  user_id uuid,
  display_name text,
  headline text,
  intents text[],
  avatar_path text,
  social_platform text,
  social_handle text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;

  return query
    select m.id, m.created_at, e.name,
           p.id, p.display_name, p.headline, coalesce(s.intents, '{}'::text[]),
           p.avatar_path, p.social_platform, p.social_handle
      from public.matches m
      join public.profiles p
        on p.id = case when m.user_a = v_user then m.user_b else m.user_a end
      left join public.events e on e.id = m.event_id
      left join public.meet_settings s on s.user_id = p.id
     where v_user in (m.user_a, m.user_b)
       and not public.is_blocked_between(v_user, p.id)
     order by m.created_at desc
     limit 100;
end $$;

-- Helpers are only called from the functions above, which run as their owner.
revoke execute on function public.meet_is_on(uuid) from public, anon, authenticated;
revoke execute on function public.meet_has_pass(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.meet_can_see(uuid) from public, anon, authenticated;
revoke execute on function public.can_view_meet_avatar(text) from public, anon;
revoke execute on function public.meet_deck(uuid) from public, anon;
revoke execute on function public.record_swipe(uuid, uuid, text) from public, anon;
revoke execute on function public.my_matches() from public, anon;
-- can_view_meet_avatar is called by the storage policy, as the caller.
grant execute on function public.can_view_meet_avatar(text) to authenticated;
grant execute on function public.meet_deck(uuid) to authenticated;
grant execute on function public.record_swipe(uuid, uuid, text) to authenticated;
grant execute on function public.my_matches() to authenticated;
