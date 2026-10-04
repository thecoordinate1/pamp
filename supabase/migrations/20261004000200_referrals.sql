-- Referral codes and attribution.
--
-- Every account gets one code for life. A person's invite links and QR code
-- carry it, and it never changes, so a link shared months ago still credits
-- them. Who brought whom in is recorded once, at sign-up, by the database, so
-- the record can back rewards later without trusting anything a browser says
-- after the fact.
--
-- Rewards are not built yet. When they are, count only referred people who
-- have confirmed their email and attended an event: the code arrives as sign-up
-- metadata the browser controls, so a throwaway account can cite any code.

-- Easy to read off a phone and say aloud: no 0/O or 1/I.
create function public.generate_referral_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_tries integer := 0;
begin
  loop
    v_code := '';
    for i in 1 .. 8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::integer, 1);
    end loop;
    exit when not exists (select 1 from public.account_private a where a.referral_code = v_code);
    v_tries := v_tries + 1;
    if v_tries > 20 then
      raise exception 'Could not allocate a referral code';
    end if;
  end loop;
  return v_code;
end $$;

revoke execute on function public.generate_referral_code() from public, anon, authenticated;

-- Created first: this takes its locks on profiles and events before
-- account_private is locked below, the same order sign-ups and event edits
-- take them, so the deploy cannot deadlock with live traffic.
-- One row per referred account: a person is brought in once.
create table public.referrals (
  referred_id uuid primary key references public.profiles (id) on delete cascade,
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  -- The shared event that brought them, when they came through one.
  event_id uuid references public.events (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint referrals_not_self check (referred_id <> referrer_id)
);
create index referrals_referrer_idx on public.referrals (referrer_id, created_at desc);

alter table public.referrals enable row level security;
revoke all on public.referrals from anon, authenticated;
-- Written only by handle_new_user below. Clients may read, never write.
grant select on public.referrals to authenticated;

create policy "referrers see who joined through them" on public.referrals
  for select to authenticated using (referrer_id = (select auth.uid()));

alter table public.account_private add column referral_code text;
-- Indexed before the backfill, so each uniqueness check is a lookup rather than
-- a scan of every account. NULLs do not collide while codes are handed out.
create unique index account_private_referral_code_key on public.account_private (referral_code);

-- One row at a time, so each new code is checked against the ones already issued.
do $$
declare
  r record;
begin
  for r in select a.user_id from public.account_private a where a.referral_code is null loop
    update public.account_private
       set referral_code = public.generate_referral_code()
     where user_id = r.user_id;
  end loop;
end $$;

alter table public.account_private
  alter column referral_code set default public.generate_referral_code(),
  alter column referral_code set not null,
  add constraint account_private_referral_code_key unique using index account_private_referral_code_key,
  add constraint account_private_referral_code_format check (referral_code ~ '^[A-HJ-NP-Z2-9]{8}$');

-- Same guard as before, now also pinning the referral code.
create or replace function public.protect_account_private_columns() returns trigger
language plpgsql as $$
begin
  if public.is_privileged() then
    return new;
  end if;
  new.user_id := old.user_id;
  new.phone := old.phone;
  new.email := old.email;
  new.is_admin := old.is_admin;
  new.is_suspended := old.is_suspended;
  new.created_at := old.created_at;
  -- Every link a person has shared carries this code, so it cannot change.
  new.referral_code := old.referral_code;
  -- Date of birth gates age-restricted events, so it can only be set once.
  if old.birth_date is not null then
    new.birth_date := old.birth_date;
  elsif new.birth_date is not null and new.birth_date > current_date - interval '13 years' then
    raise exception 'You must be at least 13 to use PAMP' using errcode = '22023';
  end if;
  -- Terms acceptance can be recorded but not withdrawn through the API.
  if old.terms_accepted_at is not null then
    new.terms_accepted_at := old.terms_accepted_at;
  elsif new.terms_accepted_at is not null then
    new.terms_accepted_at := now();
  end if;
  return new;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_event_text text;
  v_referrer uuid;
  v_event uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60));
  insert into public.account_private (user_id, phone, email)
  values (new.id, nullif(new.phone, ''), nullif(new.email, ''));

  -- Attribution from an invite link. The code is only trusted to name an
  -- existing account, and nothing about it may stop the sign-up succeeding.
  v_code := upper(btrim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));
  if v_code ~ '^[A-HJ-NP-Z2-9]{8}$' then
    begin
      select a.user_id into v_referrer
        from public.account_private a
       where a.referral_code = v_code;

      if v_referrer is not null and v_referrer <> new.id then
        v_event_text := new.raw_user_meta_data ->> 'referral_event';
        if v_event_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          select e.id into v_event from public.events e where e.id = v_event_text::uuid;
        end if;

        insert into public.referrals (referred_id, referrer_id, code, event_id)
        values (new.id, v_referrer, v_code, v_event)
        on conflict (referred_id) do nothing;
      end if;
    exception when others then
      raise warning 'Referral not recorded for %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end $$;
