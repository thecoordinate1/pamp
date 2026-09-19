-- Platform settings, notifications, blocks, and RLS for core tables.

create table public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  fee_percent_bps integer not null default 500 check (fee_percent_bps between 0 and 3000),
  fee_fixed_ngwee integer not null default 0 check (fee_fixed_ngwee >= 0),
  order_hold_minutes integer not null default 15 check (order_hold_minutes between 5 and 60),
  support_whatsapp text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1);

create trigger platform_settings_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();

-- Buyer-paid platform fee on top of the ticket subtotal (ngwee).
create function public.compute_fee(p_subtotal integer) returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when p_subtotal <= 0 then 0
    else (round(p_subtotal * s.fee_percent_bps / 10000.0) + s.fee_fixed_ngwee)::integer
  end
  from public.platform_settings s
  where s.id = 1
$$;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

create function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select p_user, p_kind, p_title, coalesce(p_body, ''), p_link
  where p_user is not null
$$;

create function public.mark_notifications_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = '' as $$
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (p_ids is null or id = any (p_ids))
$$;

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create function public.is_blocked_between(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  )
$$;

alter table public.profiles enable row level security;
alter table public.account_private enable row level security;
alter table public.platform_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.blocks enable row level security;

create policy "profiles are public" on public.profiles
  for select to anon, authenticated using (true);
create policy "users edit own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "users read own private data" on public.account_private
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy "users edit own private data" on public.account_private
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "settings are public" on public.platform_settings
  for select to anon, authenticated using (true);
create policy "admins edit settings" on public.platform_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "users read own notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

create policy "users see own blocks" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy "users block others" on public.blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "users unblock" on public.blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

revoke all on public.account_private from anon;
revoke execute on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;
