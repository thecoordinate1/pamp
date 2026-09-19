-- Retire the hand-made tables baselined in 20260404000000. They were superseded
-- by events + guest_requests in 20260919000100, are empty, and nothing in the
-- application references them. Keeping both left two overlapping models in the
-- schema, which is the kind of ambiguity that produces bugs later.
--
-- facecard_requests and rsvps both reference parties, so they go first.

drop table if exists public.facecard_requests;
drop table if exists public.rsvps;
drop table if exists public.parties;

-- Only ever used by the policies on the tables above.
drop function if exists public.is_party_host(uuid);
