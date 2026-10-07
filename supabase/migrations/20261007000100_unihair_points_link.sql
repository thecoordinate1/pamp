-- Linking a PAMP account to a UniHair account, and moving points between them.
--
-- PAMP and UniHair are separate apps with separate sign-ins, so the same person
-- has two unrelated accounts. They are linked once, by an 8-character code
-- (XXXX-XXXX, five minutes, single use): the person asks UniHair for a code
-- while signed in there, and types it into PAMP while signed in here. Being signed in to both inside the code's lifetime is
-- the proof that the two accounts are one person. Nothing is matched by email,
-- which anyone can type into a sign-up form.
--
-- Each app keeps its own ledger, and spends only from it. "One balance" is the
-- two shown together. When PAMP needs UniHair points, at a checkout, it pulls
-- them: UniHair debits its own ledger (refusing an overdraft) and only then does
-- PAMP credit its own. There is no way to push points into PAMP from outside,
-- so nothing outside PAMP can create PAMP points.
--
-- A pull is recorded here before UniHair is asked, under a random ref that
-- UniHair also records. If the answer is lost, the pull can be settled later by
-- asking UniHair what happened to that ref, so points are never lost or counted
-- twice. The unihair-link Edge Function does the talking; these functions are
-- for it alone (service role).

-- Accounts --------------------------------------------------------------------

create table public.unihair_links (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  unihair_profile_id uuid not null unique,
  unihair_name text not null default '' check (char_length(unihair_name) <= 120),
  linked_at timestamptz not null default now()
);

alter table public.unihair_links enable row level security;
revoke all on public.unihair_links from anon, authenticated;
grant select on public.unihair_links to authenticated;
create policy "people see their own UniHair link" on public.unihair_links
  for select to authenticated using (user_id = (select auth.uid()));

-- Records a link UniHair has just confirmed. One UniHair account per PAMP
-- account and the other way round; relinking the same pair is harmless.
create function public.link_unihair_account(p_user uuid, p_unihair_profile uuid, p_name text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.unihair_links l
     where l.unihair_profile_id = p_unihair_profile and l.user_id <> p_user
  ) then
    raise exception 'already_linked' using errcode = '23505';
  end if;
  insert into public.unihair_links (user_id, unihair_profile_id, unihair_name)
  values (p_user, p_unihair_profile, left(coalesce(p_name, ''), 120))
  on conflict (user_id) do update
    set unihair_profile_id = excluded.unihair_profile_id,
        unihair_name = excluded.unihair_name,
        linked_at = now();
end $$;

-- Removes the link and says which UniHair account it was, so UniHair can be told.
create function public.unlink_unihair_account(p_user uuid) returns uuid
language sql volatile security definer set search_path = '' as $$
  delete from public.unihair_links where user_id = p_user returning unihair_profile_id
$$;

-- Transfers -------------------------------------------------------------------

alter table public.point_entries add column ref text unique;
alter table public.point_entries drop constraint point_entries_kind_check;
alter table public.point_entries add constraint point_entries_kind_check check (kind in (
  'attended', 'attended_undone',
  'referral', 'referral_undone',
  'pass_discount', 'pass_discount_refund',
  'adjustment',
  'transfer_in'
));

create table public.point_transfers (
  ref uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  points integer not null check (points between 1 and 100000),
  source text not null default 'unihair' check (source in ('unihair')),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index point_transfers_pending_idx on public.point_transfers (user_id, created_at) where status = 'pending';

alter table public.point_transfers enable row level security;
revoke all on public.point_transfers from anon, authenticated;
grant select on public.point_transfers to authenticated;
create policy "people see their own transfers" on public.point_transfers
  for select to authenticated using (user_id = (select auth.uid()));

-- Step 1 of a pull: record it before UniHair is asked.
create function public.begin_unihair_transfer(p_user uuid, p_points integer)
returns public.point_transfers
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_transfer public.point_transfers;
begin
  if not exists (select 1 from public.unihair_links l where l.user_id = p_user) then
    raise exception 'not_linked' using errcode = '22023';
  end if;
  if p_points is null or p_points < 1 or p_points > 100000 then
    raise exception 'bad_points' using errcode = '22023';
  end if;
  insert into public.point_transfers (user_id, points) values (p_user, p_points)
  returning * into v_transfer;
  return v_transfer;
end $$;

-- Step 2: UniHair has answered. Credits the points once, however many times it
-- is called with the same ref, and returns the PAMP balance afterwards.
create function public.finish_unihair_transfer(p_ref uuid, p_taken boolean) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_transfer public.point_transfers;
begin
  select * into v_transfer from public.point_transfers t where t.ref = p_ref for update;
  if v_transfer.ref is null then
    raise exception 'unknown_transfer' using errcode = 'P0002';
  end if;

  perform public.lock_point_wallet(v_transfer.user_id);
  if v_transfer.status = 'pending' then
    if p_taken then
      update public.point_wallets
         set balance = balance + v_transfer.points, updated_at = now()
       where user_id = v_transfer.user_id;
      insert into public.point_entries (user_id, points, kind, ref)
      values (v_transfer.user_id, v_transfer.points, 'transfer_in', 'unihair:' || v_transfer.ref::text);
    end if;
    update public.point_transfers
       set status = case when p_taken then 'done' else 'failed' end, settled_at = now()
     where ref = p_ref;
  end if;

  return (select w.balance from public.point_wallets w where w.user_id = v_transfer.user_id);
end $$;

-- Pulls still waiting on an answer, oldest first, to settle on the next visit.
create function public.pending_unihair_transfers(p_user uuid)
returns setof public.point_transfers
language sql stable security definer set search_path = '' as $$
  select * from public.point_transfers t
   where t.user_id = p_user and t.status = 'pending'
   order by t.created_at
$$;

revoke execute on function public.link_unihair_account(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.unlink_unihair_account(uuid) from public, anon, authenticated;
revoke execute on function public.begin_unihair_transfer(uuid, integer) from public, anon, authenticated;
revoke execute on function public.finish_unihair_transfer(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.pending_unihair_transfers(uuid) from public, anon, authenticated;
