-- Baseline: the tables that already exist in the hosted project (created by hand
-- in the dashboard on 2026-04-04, before migrations were tracked).
--
-- Every statement is guarded, so applying this against the live project is a
-- no-op; it exists so a fresh database can be rebuilt from migrations alone.

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  time text not null,
  location text not null,
  area text not null,
  vibe text not null,
  dress_code text,
  host_contact text,
  host_id uuid references auth.users (id),
  rsvp_count integer default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  party_id uuid not null references public.parties (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, party_id)
);

create table if not exists public.facecard_requests (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  user_name text not null,
  image_url text not null,
  status text default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default timezone('utc', now())
);
