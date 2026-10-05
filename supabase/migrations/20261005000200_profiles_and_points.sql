-- Profiles people can recognise, and points for turning up.
--
-- 1. Profile pictures. The selfie someone sends with a join request becomes
--    their profile picture (profiles.avatar_path), and they can change it from
--    their profile. It is seen by whoever may see the profile: the person,
--    hosts of events they attend or asked to join, guests at an event where
--    they chose to be listed, everyone once a host features them, and admins.
-- 2. "featured selfies are public" is dropped. Once any host featured someone,
--    it made every selfie they had ever sent readable by anyone, though only
--    the one picture is ever shown. Other selfies stay with their requests.
-- 3. @usernames: unique, lower case, chosen by the person.
-- 4. A verified badge: an admin has checked that the person matches their
--    photo. A new photo needs a new check, so changing it removes the badge.
-- 5. Points. Earned for being checked in at an event, and by whoever invited
--    someone, the first time that friend attends. Spent as money off paid
--    passes, by verified profiles only. PAMP covers the discount, so the host
--    is still owed the full price. A point is worth K0.10, the same as on
--    UniHair, so the two apps can share one balance.

-- A pass paid for entirely with points.
alter type public.payment_method add value if not exists 'points';

-- 1. Profile pictures -----------------------------------------------------------

-- Nothing has set avatar_path until now, so this only clears values that could
-- never be shown: a picture lives in its owner's own selfies folder.
update public.profiles
   set avatar_path = null
 where avatar_path is not null
   and split_part(avatar_path, '/', 1) <> id::text;

alter table public.profiles
  add constraint profiles_avatar_in_own_folder check (
    avatar_path is null
    or (split_part(avatar_path, '/', 1) = id::text
        and avatar_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$')
  );

create index profiles_avatar_path_idx on public.profiles (avatar_path) where avatar_path is not null;

-- 2. Only the profile picture follows the profile -------------------------------

drop policy "featured selfies are public" on storage.objects;

create function public.can_view_avatar(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.avatar_path = p_path
       and (
         p.id = (select auth.uid())
         or public.shares_event_with(p.id)
         or public.is_publicly_featured(p.id)
         or public.is_admin()
       )
  )
$$;

create policy "profile pictures are seen with the profile" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'selfies' and public.can_view_avatar(name));

-- 3. Usernames ------------------------------------------------------------------

-- 3 to 20 of a-z, 0-9, _ and ., not starting or ending with a dot and with no
-- two dots together. Names that could pass for PAMP, UniHair or staff are kept back.
create function public.is_valid_username(p_username text) returns boolean
language sql immutable set search_path = '' as $$
  select p_username ~ '^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$'
     and p_username !~ '\.\.'
     and p_username !~ '(pamp|unihair)'
     and p_username <> all (array[
       'admin', 'administrator', 'support', 'help', 'host', 'hosts', 'official',
       'team', 'staff', 'moderator', 'mod', 'root', 'system', 'null', 'undefined',
       'me', 'everyone', 'verified'
     ])
$$;

alter table public.profiles
  add column username text,
  add constraint profiles_username_valid check (username is null or public.is_valid_username(username));

create unique index profiles_username_key on public.profiles (username);

-- Lets someone check a name before saving it. Only says yes or no.
create function public.username_available(p_username text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_name text := lower(btrim(coalesce(p_username, '')));
begin
  if not public.is_valid_username(v_name) then
    return false;
  end if;
  return not exists (
    select 1 from public.profiles p
     where p.username = v_name and p.id is distinct from (select auth.uid())
  );
end $$;

revoke execute on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;

-- 4. Verified badge -------------------------------------------------------------

alter table public.profiles add column identity_verified_at timestamptz;

-- The photo an admin last looked at, so the queue only shows new ones.
alter table public.account_private add column avatar_reviewed_path text;

create or replace function public.protect_profile_columns() returns trigger
language plpgsql as $$
begin
  if not public.is_privileged() then
    new.id := old.id;
    new.host_status := old.host_status;
    new.created_at := old.created_at;
    new.identity_verified_at := old.identity_verified_at;
  end if;
  -- The badge vouches for a face, so a new photo goes back to be checked.
  if new.avatar_path is distinct from old.avatar_path then
    new.identity_verified_at := null;
  end if;
  return new;
end $$;

-- As in 20261004000200, now also pinning the reviewed photo.
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
  new.avatar_reviewed_path := old.avatar_reviewed_path;
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

-- Profiles whose current photo no admin has looked at yet. Unlike the analytics
-- functions this returns people rather than totals: checking a face against a
-- name is the whole job, and it is limited to what the badge is about.
create function public.profiles_to_verify()
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_path text,
  joined_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  return query
    select p.id, p.display_name, p.username, p.avatar_path, p.created_at
      from public.profiles p
      join public.account_private a on a.user_id = p.id
     where p.avatar_path is not null
       and p.avatar_path is distinct from a.avatar_reviewed_path
     order by p.updated_at
     limit 200;
end $$;

-- Records an admin's answer for the photo they were shown. If the person has
-- changed it since, nothing happens and false comes back: the admin has not
-- seen the new one.
create function public.review_profile_photo(p_user uuid, p_avatar_path text, p_matches boolean)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_current text;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select p.avatar_path into v_current from public.profiles p where p.id = p_user for update;
  if v_current is null or v_current is distinct from p_avatar_path then
    return false;
  end if;

  update public.profiles
     set identity_verified_at = case when p_matches then now() else null end
   where id = p_user;
  update public.account_private
     set avatar_reviewed_path = v_current
   where user_id = p_user;
  return true;
end $$;

revoke execute on function public.profiles_to_verify() from public, anon;
revoke execute on function public.review_profile_photo(uuid, text, boolean) from public, anon;
grant execute on function public.profiles_to_verify() to authenticated;
grant execute on function public.review_profile_photo(uuid, text, boolean) to authenticated;

-- 5. Points ---------------------------------------------------------------------

alter table public.platform_settings
  add column points_per_attendance integer not null default 20
    check (points_per_attendance between 0 and 1000),
  add column points_per_referral integer not null default 25
    check (points_per_referral between 0 and 1000),
  add column point_value_ngwee integer not null default 10
    check (point_value_ngwee between 1 and 1000);

create table public.point_wallets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

-- Every change to a balance, in order. The balance is always their sum.
create table public.point_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  points integer not null check (points <> 0),
  kind text not null check (kind in (
    'attended', 'attended_undone',
    'referral', 'referral_undone',
    'pass_discount', 'pass_discount_refund',
    'adjustment'
  )),
  event_id uuid references public.events (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  -- For referral points: the friend whose attendance earned them.
  referred_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index point_entries_user_idx on public.point_entries (user_id, created_at desc);
create index point_entries_order_idx on public.point_entries (order_id) where order_id is not null;
create index point_entries_referred_idx on public.point_entries (referred_id) where referred_id is not null;

alter table public.point_wallets enable row level security;
alter table public.point_entries enable row level security;
-- Points are money to the person holding them, so only the database writes them.
revoke all on public.point_wallets, public.point_entries from anon, authenticated;
grant select on public.point_wallets, public.point_entries to authenticated;

create policy "people see their own points" on public.point_wallets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "people see their own point history" on public.point_entries
  for select to authenticated using (user_id = (select auth.uid()));

alter table public.orders
  add column points_used integer not null default 0 check (points_used >= 0),
  add column points_discount_ngwee integer not null default 0 check (points_discount_ngwee >= 0);
-- NOT VALID: holds for every order from now on without re-checking old ones.
alter table public.orders
  add constraint orders_total_after_points
    check (total_ngwee = subtotal_ngwee + fee_ngwee - points_discount_ngwee) not valid;

-- Creates the wallet if needed and locks it. Every award and spend takes this
-- lock before it looks at the history, so two at once are served in turn.
create function public.lock_point_wallet(p_user uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_balance integer;
begin
  insert into public.point_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select w.balance into v_balance from public.point_wallets w where w.user_id = p_user for update;
  return v_balance;
end $$;

-- The only way points move. The balance check refuses a spend below zero.
create function public.add_points(
  p_user uuid,
  p_points integer,
  p_kind text,
  p_event uuid default null,
  p_order uuid default null,
  p_referred uuid default null
) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if coalesce(p_points, 0) = 0 then
    return;
  end if;
  perform public.lock_point_wallet(p_user);
  update public.point_wallets
     set balance = balance + p_points, updated_at = now()
   where user_id = p_user;
  insert into public.point_entries (user_id, points, kind, event_id, order_id, referred_id)
  values (p_user, p_points, p_kind, p_event, p_order, p_referred);
end $$;

-- Net points a kind of award has given for something: positive while it stands.
create function public.points_net(p_user uuid, p_kinds text[], p_event uuid, p_referred uuid)
returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(pe.points), 0)::integer
    from public.point_entries pe
   where pe.user_id = p_user
     and pe.kind = any (p_kinds)
     and (p_event is null or pe.event_id = p_event)
     and (p_referred is null or pe.referred_id = p_referred)
$$;

-- Points follow the door. A scan earns them; undoing the scan takes them back,
-- as far as they have not been spent.
create function public.reward_attendance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_host uuid;
  v_per_attendance integer;
  v_per_referral integer;
  v_referrer uuid;
  v_balance integer;
  v_net integer;
begin
  select e.host_id into v_host from public.events e where e.id = new.event_id;
  -- Hosts hold the scanner, so they earn nothing at their own events.
  if new.user_id = v_host then
    return null;
  end if;

  select s.points_per_attendance, s.points_per_referral
    into v_per_attendance, v_per_referral
    from public.platform_settings s where s.id = 1;
  select r.referrer_id into v_referrer from public.referrals r where r.referred_id = new.user_id;
  -- No reward for bringing guests to your own event: that is how a host would
  -- farm points from accounts they made themselves.
  if v_referrer = v_host then
    v_referrer := null;
  end if;

  if new.status = 'checked_in' and old.status is distinct from 'checked_in' then
    -- Once per event, however many of their passes are scanned.
    perform public.lock_point_wallet(new.user_id);
    if public.points_net(new.user_id, array['attended', 'attended_undone'], new.event_id, null) <= 0 then
      perform public.add_points(new.user_id, v_per_attendance, 'attended', new.event_id);
    end if;

    -- Whoever invited them, once, the first time they are let in anywhere.
    if v_referrer is not null then
      perform public.lock_point_wallet(v_referrer);
      if public.points_net(v_referrer, array['referral', 'referral_undone'], null, new.user_id) <= 0 then
        perform public.add_points(v_referrer, v_per_referral, 'referral', new.event_id, null, new.user_id);
      end if;
    end if;

  elsif old.status = 'checked_in' and new.status is distinct from 'checked_in' then
    -- Another of their passes still scanned in at this event keeps the points.
    if not exists (
      select 1 from public.tickets t
       where t.user_id = new.user_id and t.event_id = new.event_id
         and t.status = 'checked_in' and t.id <> new.id
    ) then
      v_balance := public.lock_point_wallet(new.user_id);
      v_net := public.points_net(new.user_id, array['attended', 'attended_undone'], new.event_id, null);
      if v_net > 0 then
        perform public.add_points(new.user_id, -least(v_net, v_balance), 'attended_undone', new.event_id);
      end if;
    end if;

    -- The referral stands as long as the friend has been let in somewhere.
    if v_referrer is not null and not exists (
      select 1 from public.tickets t
       where t.user_id = new.user_id and t.status = 'checked_in'
    ) then
      v_balance := public.lock_point_wallet(v_referrer);
      v_net := public.points_net(v_referrer, array['referral', 'referral_undone'], null, new.user_id);
      if v_net > 0 then
        perform public.add_points(v_referrer, -least(v_net, v_balance), 'referral_undone', new.event_id, null, new.user_id);
      end if;
    end if;
  end if;

  return null;
end $$;

create trigger tickets_reward_attendance
  after update of status on public.tickets
  for each row execute function public.reward_attendance();

-- Points spent on an order that is never paid, or is refunded, come back.
create function public.refund_order_points() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_out integer;
begin
  if new.points_used = 0 or new.status is not distinct from old.status
     or new.status not in ('expired', 'failed', 'refunded') then
    return null;
  end if;

  perform public.lock_point_wallet(new.user_id);
  -- Negative while the points are still spent on this order.
  select coalesce(sum(pe.points), 0)::integer into v_out
    from public.point_entries pe
   where pe.order_id = new.id and pe.kind in ('pass_discount', 'pass_discount_refund');
  if v_out < 0 then
    perform public.add_points(new.user_id, -v_out, 'pass_discount_refund', new.event_id, new.id);
  end if;
  return null;
end $$;

create trigger orders_refund_points
  after update of status on public.orders
  for each row execute function public.refund_order_points();

-- This person's balance, and what a point is worth. Orders they left unpaid
-- past their hold are expired first, which gives back any points on them.
create function public.my_points()
returns table (balance integer, point_value_ngwee integer)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;

  update public.orders
     set status = 'expired'
   where user_id = v_user and status = 'pending'
     and expires_at is not null and expires_at < now();

  return query
    select coalesce((select w.balance from public.point_wallets w where w.user_id = v_user), 0),
           (select s.point_value_ngwee from public.platform_settings s where s.id = 1);
end $$;

-- create_order gains p_points: how many points to put towards a paid order.
-- Dropped and recreated rather than overloaded, so PostgREST never has two
-- candidates to choose between.
drop function public.create_order(uuid, integer, public.payment_method, text);

create function public.create_order(
  p_event_id uuid,
  p_quantity integer,
  p_method public.payment_method default 'free',
  p_msisdn text default null,
  p_points integer default 0
) returns public.orders
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_event public.events;
  v_unit integer;
  v_subtotal integer;
  v_fee integer;
  v_hold integer;
  v_sold integer;
  v_value integer;
  v_points integer := 0;
  v_discount integer := 0;
  v_total integer;
  v_order public.orders;
begin
  if v_user is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Choose between 1 and 10 passes' using errcode = '22023';
  end if;
  if coalesce(p_points, 0) < 0 then
    raise exception 'Points cannot be negative' using errcode = '22023';
  end if;

  -- Locked so two people buying the last places at once are served one after
  -- the other, and the capacity check below sees the first one's passes.
  select * into v_event from public.events e where e.id = p_event_id for no key update;
  if v_event.id is null or v_event.status <> 'published' then
    raise exception 'That event is not open for passes' using errcode = '22023';
  end if;

  -- Someone who already holds a free pass gets it back. This runs before the
  -- capacity check so a holder is never told the event is full. The lock makes
  -- a double tap wait for the first claim and then find its order, and it
  -- works whatever duplicates the table held before this change.
  if v_event.ticket_price_ngwee = 0 then
    perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_event_id::text, 0));

    select * into v_order
      from public.orders o
     where o.event_id = p_event_id and o.user_id = v_user
       and o.method = 'free' and o.status = 'paid'
     order by o.created_at
     limit 1;

    if v_order.id is not null then
      perform public.issue_tickets_for_order(v_order.id);
      return v_order;
    end if;
  end if;

  if v_event.capacity is not null then
    select coalesce(count(*), 0) into v_sold
      from public.tickets t
     where t.event_id = p_event_id and t.status <> 'void';
    if v_sold + p_quantity > v_event.capacity then
      raise exception 'Not enough passes left' using errcode = '22023';
    end if;
  end if;

  v_unit := v_event.ticket_price_ngwee;
  v_subtotal := v_unit * p_quantity;
  v_fee := case when v_subtotal = 0 then 0 else public.compute_fee(v_subtotal) end;
  select s.order_hold_minutes, s.point_value_ngwee into v_hold, v_value
    from public.platform_settings s where s.id = 1;

  if coalesce(p_points, 0) > 0 then
    if v_subtotal = 0 then
      raise exception 'Points can only be used on paid passes' using errcode = '22023';
    end if;
    -- Earning is open to everyone; spending is not, so an account made up to
    -- collect points cannot cash them in.
    if not exists (
      select 1 from public.profiles p
       where p.id = v_user and p.identity_verified_at is not null
    ) then
      raise exception 'Get your profile verified to spend points' using errcode = '42501';
    end if;

    -- Unpaid orders past their hold give their points back first.
    update public.orders
       set status = 'expired'
     where user_id = v_user and status = 'pending'
       and expires_at is not null and expires_at < now();

    v_value := coalesce(v_value, 10);
    -- Never more points than the order needs.
    v_points := least(p_points, ceil((v_subtotal + v_fee)::numeric / v_value)::integer);
    v_discount := least(v_subtotal + v_fee, v_points * v_value);
    if public.lock_point_wallet(v_user) < v_points then
      raise exception 'You do not have that many points' using errcode = '22023';
    end if;
  end if;

  v_total := v_subtotal + v_fee - v_discount;

  insert into public.orders (
    event_id, user_id, quantity, unit_price_ngwee, subtotal_ngwee,
    fee_ngwee, total_ngwee, status, method, msisdn, expires_at, paid_at,
    points_used, points_discount_ngwee
  ) values (
    p_event_id, v_user, p_quantity, v_unit, v_subtotal,
    v_fee, v_total,
    case when v_total = 0 then 'paid'::public.order_status else 'pending'::public.order_status end,
    case
      when v_subtotal = 0 then 'free'::public.payment_method
      when v_total = 0 then 'points'::public.payment_method
      else p_method
    end,
    nullif(p_msisdn, ''),
    case when v_total = 0 then null else now() + make_interval(mins => coalesce(v_hold, 15)) end,
    case when v_total = 0 then now() else null end,
    v_points, v_discount
  )
  returning * into v_order;

  if v_points > 0 then
    perform public.add_points(v_user, -v_points, 'pass_discount', p_event_id, v_order.id);
  end if;

  -- Free events, and passes points paid for in full, complete immediately;
  -- the rest wait for the provider webhook.
  if v_order.status = 'paid' then
    perform public.issue_tickets_for_order(v_order.id);
  end if;

  return v_order;
end $$;

revoke execute on function public.lock_point_wallet(uuid) from public, anon, authenticated;
revoke execute on function public.add_points(uuid, integer, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.points_net(uuid, text[], uuid, uuid) from public, anon, authenticated;
revoke execute on function public.reward_attendance() from public, anon, authenticated;
revoke execute on function public.refund_order_points() from public, anon, authenticated;
revoke execute on function public.my_points() from public, anon;
grant execute on function public.my_points() to authenticated;
revoke execute on function public.create_order(uuid, integer, public.payment_method, text, integer) from public, anon;
grant execute on function public.create_order(uuid, integer, public.payment_method, text, integer) to authenticated;
