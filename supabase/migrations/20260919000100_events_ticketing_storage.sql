-- Completes the design the earlier migrations only sketched: nine of the ten
-- enums created in 20260914000100 were unused, platform_settings.order_hold_minutes
-- and compute_fee() referenced an order flow with no tables, and facecard
-- image_url pointed at storage that did not exist.

-- Events. Supersedes the hand-made `parties` table, which is empty and left in
-- place for now rather than dropped.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 120),
  category public.event_category not null default 'party',
  status public.event_status not null default 'published',
  starts_on date not null,
  start_time text not null,
  city text not null default 'Lusaka',
  area text not null,
  vibe text not null default '',
  dress_code text not null default '',
  description text not null default '' check (char_length(description) <= 2000),
  image_url text not null default '',
  host_display_name text not null default '',
  ticket_price_ngwee integer not null default 0 check (ticket_price_ngwee >= 0),
  currency text not null default 'ZMW' check (currency = 'ZMW'),
  capacity integer check (capacity is null or capacity > 0),
  rsvp_count integer not null default 0 check (rsvp_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_starts_on_idx on public.events (starts_on, status);
create index events_host_idx on public.events (host_id);

-- Exact location and host contact stay out of the public row: they are revealed
-- only to approved guests and ticket holders. Mirrors the account_private pattern.
create table public.event_private (
  event_id uuid primary key references public.events (id) on delete cascade,
  full_address text not null default '',
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  host_whatsapp text
);

create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

create table public.guest_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.request_status not null default 'pending',
  reason text not null default '' check (char_length(reason) <= 500),
  selfie_path text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index guest_requests_event_idx on public.guest_requests (event_id, status);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  quantity integer not null check (quantity between 1 and 10),
  unit_price_ngwee integer not null check (unit_price_ngwee >= 0),
  subtotal_ngwee integer not null check (subtotal_ngwee >= 0),
  fee_ngwee integer not null default 0 check (fee_ngwee >= 0),
  total_ngwee integer not null check (total_ngwee >= 0),
  status public.order_status not null default 'pending',
  method public.payment_method not null default 'free',
  msisdn text,
  provider_reference text unique,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_idx on public.orders (user_id, created_at desc);

create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique,
  status public.ticket_status not null default 'valid',
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index tickets_user_idx on public.tickets (user_id);
create index tickets_event_idx on public.tickets (event_id, status);

-- ---------------------------------------------------------------------------
-- Access control. Kept in the same migration as the tables above so the two can
-- never be applied separately, which would leave the tables briefly unguarded.
-- ---------------------------------------------------------------------------

create function public.is_event_host(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event and e.host_id = (select auth.uid())
  )
$$;

-- Host, approved guest, or ticket holder: the people allowed the exact address.
create function public.has_event_access(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_event_host(p_event)
    or exists (
      select 1 from public.guest_requests g
      where g.event_id = p_event and g.user_id = (select auth.uid())
        and g.status = 'approved'
    )
    or exists (
      select 1 from public.tickets t
      where t.event_id = p_event and t.user_id = (select auth.uid())
        and t.status <> 'void'
    )
$$;

alter table public.events enable row level security;
alter table public.event_private enable row level security;
alter table public.guest_requests enable row level security;
alter table public.orders enable row level security;
alter table public.tickets enable row level security;

revoke all on public.events, public.event_private, public.guest_requests,
  public.orders, public.tickets from anon, authenticated;

grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
grant select, insert, update on public.event_private to authenticated;
grant select, insert, delete on public.guest_requests to authenticated;
grant update on public.guest_requests to authenticated;
-- Orders and tickets are readable but never client-writable: payment state and
-- check-in are set server-side, so a client cannot mark its own order paid.
grant select on public.orders to authenticated;
grant select on public.tickets to authenticated;

create policy "published events are public" on public.events
  for select to anon, authenticated
  using (status = 'published' or host_id = (select auth.uid()));
create policy "verified hosts create events" on public.events
  for insert to authenticated with check (host_id = (select auth.uid()));
create policy "hosts edit own events" on public.events
  for update to authenticated
  using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
create policy "hosts delete own events" on public.events
  for delete to authenticated using (host_id = (select auth.uid()));

create policy "address for approved guests" on public.event_private
  for select to authenticated using (public.has_event_access(event_id));
create policy "hosts set own event address" on public.event_private
  for insert to authenticated with check (public.is_event_host(event_id));
create policy "hosts edit own event address" on public.event_private
  for update to authenticated
  using (public.is_event_host(event_id)) with check (public.is_event_host(event_id));

create policy "read own or hosted requests" on public.guest_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_event_host(event_id));
create policy "guests request for themselves" on public.guest_requests
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy "hosts decide requests" on public.guest_requests
  for update to authenticated
  using (public.is_event_host(event_id)) with check (public.is_event_host(event_id));
create policy "guests withdraw own request" on public.guest_requests
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "read own orders" on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_event_host(event_id));
create policy "read own tickets" on public.tickets
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_event_host(event_id));

-- Storage: event artwork is world-readable, selfies are not.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('event-images', 'event-images', true, 5242880,
   array['image/jpeg','image/png','image/webp']),
  ('selfies', 'selfies', false, 5242880,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "event images are public" on storage.objects
  for select to anon, authenticated using (bucket_id = 'event-images');
create policy "signed-in users upload event images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-images' and owner = (select auth.uid()));
create policy "owners replace own event images" on storage.objects
  for update to authenticated using (bucket_id = 'event-images' and owner = (select auth.uid()));
create policy "owners delete own event images" on storage.objects
  for delete to authenticated using (bucket_id = 'event-images' and owner = (select auth.uid()));

-- Selfies live at <user-id>/<file>, so the first path segment is the owner.
create policy "users read own selfies" on storage.objects
  for select to authenticated
  using (bucket_id = 'selfies' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users upload own selfies" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'selfies' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users delete own selfies" on storage.objects
  for delete to authenticated
  using (bucket_id = 'selfies' and (storage.foldername(name))[1] = (select auth.uid())::text);
