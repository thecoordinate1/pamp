-- Core: enums, profiles, private account data, shared helpers.
-- Convention: every SECURITY DEFINER function pins search_path to '' and fully qualifies names.

create type public.event_category as enum ('party', 'tech_business', 'creative_arts', 'vip_lounge');
create type public.event_status as enum ('draft', 'published', 'cancelled');
create type public.host_status as enum ('none', 'pending', 'verified', 'rejected');
create type public.request_status as enum ('pending', 'approved', 'declined', 'withdrawn');
create type public.order_status as enum ('pending', 'paid', 'failed', 'expired', 'refunded');
create type public.ticket_status as enum ('valid', 'checked_in', 'void');
create type public.payment_method as enum ('free', 'mtn', 'airtel', 'zamtel', 'card');
create type public.connection_status as enum ('pending', 'accepted', 'declined');
create type public.report_status as enum ('open', 'actioned', 'dismissed');
create type public.application_status as enum ('pending', 'approved', 'rejected');

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Public-facing profile fields only. Anything sensitive lives in account_private.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  avatar_path text,
  headline text not null default '' check (char_length(headline) <= 80),
  looking_for text not null default '' check (char_length(looking_for) <= 120),
  instagram text not null default '' check (instagram ~ '^[A-Za-z0-9._]{0,30}$'),
  host_status public.host_status not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text,
  email text,
  birth_date date check (birth_date > date '1900-01-01'),
  is_admin boolean not null default false,
  is_suspended boolean not null default false,
  terms_accepted_at timestamptz,
  share_phone_with_connections boolean not null default false,
  payout_method text check (payout_method in ('mtn', 'airtel', 'zamtel', 'bank')),
  payout_account text check (char_length(payout_account) <= 60),
  payout_account_name text check (char_length(payout_account_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger account_private_updated_at before update on public.account_private
  for each row execute function public.set_updated_at();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select a.is_admin from public.account_private a where a.user_id = auth.uid()),
    false
  )
$$;

-- Signed-in and not suspended.
create function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and not coalesce(
    (select a.is_suspended from public.account_private a where a.user_id = auth.uid()),
    false
  )
$$;

-- Deliberately NOT security definer: current_user is the calling role, so API callers
-- (anon/authenticated) are unprivileged, while service_role, migrations and our own
-- SECURITY DEFINER RPCs (which run as the owner) are privileged.
create function public.is_privileged() returns boolean
language sql stable as $$
  select current_user not in ('anon', 'authenticated') or public.is_admin()
$$;

create function public.is_verified_host(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = p_user and p.host_status = 'verified'
  )
$$;

-- Normalises Zambian mobile numbers to 260XXXXXXXXX; null when invalid.
create function public.normalize_msisdn(p_input text) returns text
language plpgsql immutable as $$
declare
  v text := regexp_replace(coalesce(p_input, ''), '[^0-9]', '', 'g');
begin
  if v like '0%' and length(v) = 10 then
    v := '260' || substr(v, 2);
  elsif length(v) = 9 then
    v := '260' || v;
  end if;
  if v ~ '^260[79][5-7][0-9]{7}$' then
    return v;
  end if;
  return null;
end $$;
