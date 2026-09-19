-- Lock down the three baseline tables.
--
-- Before this migration they had RLS disabled and blanket grants to `anon`,
-- meaning anyone holding the publishable key (which ships in the browser
-- bundle) could read, rewrite or truncate every row.

create function public.is_party_host(p_party uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.parties p
    where p.id = p_party and p.host_id = (select auth.uid())
  )
$$;

alter table public.parties enable row level security;
alter table public.rsvps enable row level security;
alter table public.facecard_requests enable row level security;

-- Drop the inherited blanket privileges, then grant only what the API needs.
revoke all on public.parties from anon, authenticated;
revoke all on public.rsvps from anon, authenticated;
revoke all on public.facecard_requests from anon, authenticated;

grant select on public.parties to anon, authenticated;
grant insert, update, delete on public.parties to authenticated;
grant select, insert, delete on public.rsvps to authenticated;
grant select, insert, update, delete on public.facecard_requests to authenticated;

-- Parties: browsable by everyone, editable only by the host who created it.
create policy "parties are public" on public.parties
  for select to anon, authenticated using (true);
create policy "hosts create parties" on public.parties
  for insert to authenticated with check (host_id = (select auth.uid()));
create policy "hosts edit own parties" on public.parties
  for update to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));
create policy "hosts delete own parties" on public.parties
  for delete to authenticated using (host_id = (select auth.uid()));

-- RSVPs: guests see their own, hosts see their guest list. The public
-- headcount comes from parties.rsvp_count, not from reading this table.
create policy "guests read own rsvps" on public.rsvps
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_party_host(party_id));
create policy "guests rsvp for themselves" on public.rsvps
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "guests cancel own rsvp" on public.rsvps
  for delete to authenticated using (user_id = (select auth.uid()));

-- Facecard requests: visible to the requester and the host being asked.
-- Requests must start as 'pending' so nobody can self-approve on insert,
-- and only the host can move them to approved/declined.
create policy "read own or hosted facecard requests" on public.facecard_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_party_host(party_id));
create policy "request own facecard" on public.facecard_requests
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy "hosts decide facecard requests" on public.facecard_requests
  for update to authenticated
  using (public.is_party_host(party_id))
  with check (public.is_party_host(party_id));
create policy "withdraw own facecard request" on public.facecard_requests
  for delete to authenticated using (user_id = (select auth.uid()));
