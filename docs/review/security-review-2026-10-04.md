# PAMP security review — money and access-control paths

Date: 2026-10-04. Scope: order/payment flow, pass issuance and sharing, door
check-in, RLS coverage. Review only — no files were modified.

The two HIGH findings in section A were independently re-verified against the
migration SQL by the review agent. Severity calibration notes are marked
**[calibrated]** where the reviewing agent's urgency was adjusted.

## Bottom line

No path lets a client mint a pass without a paid order. `orders` and `tickets`
have SELECT-only grants and the writing functions are revoked from clients. The
single-use pass claim holds under concurrency, share tokens are unguessable, and
nobody can reclaim a pass they do not own.

The real problems are: ticket-code guessing, RSVP acting as a free "attendee"
credential, buyers' mobile numbers exposed to hosts, and payment-state gaps that
only bite once a provider is connected.

---

## A. Exploitable today

### A1 [HIGH, but not yet practical at current scale] Ticket codes are 32 bits, and check-in is an existence oracle

Files: `supabase/migrations/20260919000600_order_flow.sql:13`,
`supabase/migrations/20261004000300_shareable_single_use_passes.sql:45-52`,
`supabase/migrations/20260919000700_door_check_in.sql:~68-76`.

`generate_ticket_code()` returns `upper(substr(uuid_without_dashes, 1, 8))` — 8
hex characters, 16^8 ≈ 4.3 billion, i.e. **32 bits**. The ticket code *is* the
bearer credential: the QR encodes the code and the host scan checks nothing else.

`check_in_ticket` returns **distinguishable errors**:
- code does not exist → `P0002 "No pass with that code"`
- code exists but belongs to another host's event → `42501 "Only the host can check people in"`

Attack: sign in with any account, loop `rpc('check_in_ticket', {p_code: <random 8 hex>})`.
Every `42501` is a confirmed live code. Show it at the door as a QR; if the real
holder has not scanned yet, the attacker walks in and the real guest is refused
as "already used".

**[calibrated]** The reviewing agent estimated "a valid code in minutes" at 100k
issued tickets. At PAMP's *current* volume (single-digit tickets) the hit rate is
roughly 1 in 700 million, so this is **not practically exploitable today**. It
becomes serious as ticket volume grows, and must be fixed before paid passes
carry real money.

Fix:
1. Return the same error and errcode (`P0002`) for "no such code" and "not your
   event". Same for `undo_check_in`.
2. Raise QR entropy to ≥60 bits — a separate random `qr_secret` column, or a
   16+ character code from a 31-letter alphabet. Keep the short code for typing,
   host-only.
3. Rate-limit failed lookups per `auth.uid()`.
4. Treat typed codes as a host-only fallback.

Related: `generate_ticket_code` retries only 20 times and `reclaim_pass`
regenerates without a lock. Collisions are unlikely and fail closed on the unique
constraint.

### A2 [HIGH — exploitable right now, at any scale] RSVP is a free "attendee" credential

Files: `supabase/migrations/20260919000300_event_rsvps.sql:66-78` (`attends_event`)
and `:101-103` (insert policy); `supabase/migrations/20261004000400_attendee_privacy_and_requests.sql:25-55`
(`shares_event_with`).

The insert policy is:

```sql
create policy "guests rsvp for themselves" on public.event_rsvps
  for insert to authenticated
  with check (user_id = (select auth.uid()) and not featured_by_host);
```

It does **not** check that the event is published, ticketed or paid for. And
`attends_event()` returns true on a bare RSVP. The read policy
`"attendees see each other"` gates on `attends_event(event_id)`.

Attack: sign in, insert an `event_rsvps` row for every event id (the published
list is public), then select every attendee row plus the joined profile
(`display_name`, `headline`, `looking_for`, `social_platform`, `social_handle`,
`avatar_path`). This returns **every guest who ticked "Show me in this list", for
every event**, including paid and request-to-join events. No guessing required.

`shares_event_with` clause 1 has the same weakness: RSVPing to any event the
target also RSVP'd to grants profile access.

This directly undercuts v0.12.0 ("Fix attendee privacy"). That release correctly
hid guests who did not opt in, but opted-in guests consented to being seen *by
other attendees* — and attendance currently costs nothing.

Side effect: the insert also works on draft/unpublished event ids and inflates
`rsvp_count`.

Fix: make `attends_event` (and `shares_event_with` clause 1) require a non-void
ticket, an approved `guest_request`, or event host. Let a plain RSVP count only
for free events. Add `exists (select 1 from events e where e.id = event_id and
e.status = 'published')` to the insert policy. Consider rate-limiting RSVPs.

### A3 [MEDIUM] Hosts can read every buyer's mobile-money number

File: `supabase/migrations/20260919000100_events_ticketing_storage.sql:141,175-177`.

`grant select on orders` with policy `user_id = uid OR is_event_host(event_id)`
exposes `msisdn`, `provider_reference` and `user_id` to the host. The host
dashboard only needs a sum (`src/lib/queries.js:331` selects `subtotal_ngwee`).
With real mobile money this is a PII and financial-data leak.

Fix: revoke table SELECT on `orders` for `authenticated`; grant column-level
SELECT excluding `msisdn`/`provider_reference`. Better: buyers read their own
full row, hosts get a `host_order_summary` view or SECURITY DEFINER RPC that
returns counts and totals only. Same pattern exposes `tickets.share_token` to
hosts — exclude that column too.

### A4 [MEDIUM] The "verified host" gate is not enforced

File: `supabase/migrations/20260919000100_events_ticketing_storage.sql:147-148`.
The policy is *named* "verified hosts create events" but only checks
`host_id = auth.uid()`. `is_verified_host()` exists and is never used;
`host_status` appears in no policy.

Today: anyone creates a free event under a fake name. Once payments are live:
anyone creates a paid event, takes money and disappears.

Fix: `with check (host_id = auth.uid() and public.is_verified_host(auth.uid()))`,
or at minimum require verification before `ticket_price_ngwee > 0` is
publishable. Gate payouts on it too.

### A5 [MEDIUM] Free-event capacity and farming

File: `20261004000100_attendance_and_passes.sql:132-170`.

The abuse you might expect — host sets price 0, lets people claim, then raises
the price — **is not possible**. Orders snapshot unit price and fee, the dedupe
lookup only runs while price = 0, and concurrent double-taps are serialised by
the event row lock (`for no key update`) plus an advisory lock. This part is
correct.

Remaining: the first claim can be quantity 10, so one account can take 10 passes
of a small free event. `create_order` never calls `is_active_user()`, so a
suspended account can still claim and RSVP, and it never checks `starts_on`, so
passes can be created for past events.

Fix: cap free claims at 1–2 per account; add the `is_active_user()` and
`starts_on` checks.

### A6 [LOW/MEDIUM] Selfie storage

`20260919000400_profile_visibility.sql:69-75`: the "featured selfies are public"
policy grants anon read on **every object** under a featured user's folder, not
just the facecard — including selfies sent as guest-request photos to other
hosts. Anon storage list calls can enumerate filenames in that folder.
Fix: put the public photo under a separate `facecards/` prefix or bucket and
match only that.

`can_view_request_selfie` (`20261004000400:62-72`) is **correct**: it requires
the path's first segment to equal `g.user_id`, so a requester cannot point a
request at someone else's photo. One gap: the host UPDATE policy on
`guest_requests` (`20260919000100:169-171`) lets a host rewrite `user_id` and
`selfie_path` on any request to their event, which would satisfy the check for
another user's selfie. Filenames are random UUIDs so a leaked path is needed.
Fix: restrict host updates to `status` and `decided_at`.

`event-images`: any signed-in user can upload anywhere in the public bucket
(5 MB, images only). Constrain `foldername(name)[1] = uid`.

### A7 [LOW] `create_order` stores client-supplied `p_method` as-is

`20261004000100:183-184`. A `pending` order with method `'free'` is harmless
today, but once the webhook marks it paid, the free-dedupe lookup
(`method='free' and status='paid'`) would treat it as a free claim if the host
later drops the price to 0. Reject `'free'` when subtotal > 0; reject unknown
methods.

### A8 [LOW] `compute_fee` integer overflow

`20260914000120_core_platform.sql:21`: `p_subtotal * bps` is int*int, overflowing
around K42,949 per order at 500 bps (K7,158 at 3000 bps). It fails closed with
"integer out of range" rather than producing wrong money. Cast to bigint.
`unit * quantity` in `create_order` overflows at ~K21M and also fails closed.

---

## B. Becomes exploitable once payments are live

### B1 [HIGH] Pending orders do not hold capacity

`20261004000100:163-170` counts only `tickets`; `issue_tickets_for_order`
(`20260919000600:23-56`) inserts without re-checking capacity.

For a 100-capacity event, 300 people each create a pending order (all pass,
tickets = 0). The provider confirms all 300 → 300 tickets issued, 200 over
capacity, real money taken.

Fix: count `sum(quantity)` of pending unexpired orders plus non-void tickets in
the capacity check. Re-check capacity inside `issue_tickets_for_order` under the
same event-row lock. If a paid order cannot be honoured, mark it for refund —
never silently issue or silently drop.

### B2 [HIGH] A late payment on an expired order takes money and issues no pass

`20260919000600:131-135` only accepts `status in ('pending','paid')`; `:145-153`
expires orders after the hold. A buyer approving the prompt at minute 16 gets
`mark_order_paid` raising, and nothing records the payment.

`expire_stale_orders` has **no scheduler anywhere in the repo** — orders may
stay pending forever today.

Fix: the webhook must write the raw provider event to a `payments` table before
any state change. A payment for an `expired`/`failed` order must reinstate (if
capacity allows) or trigger a refund. Add the scheduler (pg_cron or a timed Edge
Function).

### B3 [MEDIUM] Unlimited pending orders, unvalidated payer number

`create_order` has no per-user pending cap and stores `p_msisdn` raw
(`nullif(p_msisdn,'')`); `normalize_msisdn` exists and is never called.

Attack: loop `create_order` with a victim's number. Once the provider is live,
each call sends a payment prompt to the victim's phone — harassment, and it
burns per-number provider limits.

Fix: call `normalize_msisdn`, reject null for mtn/airtel/zamtel, cap pending
orders (≈3 per user, 1 per user per event), rate-limit.

### B4 [MEDIUM] No refund, void or dispute path

`order_status` has `'refunded'` but nothing sets it; no function voids tickets of
a refunded order; `check_in_ticket` checks only the ticket's own status, never
the parent order's. A chargeback leaves a valid QR.

Fix: add `refund_order()` that voids tickets, and have check-in verify the parent
order is `paid`.

### B5 [LOW/MEDIUM] `mark_order_paid` does not check the amount

`20260919000600:125-143` takes only `(order_id, reference)`. Any service_role
caller marks any order paid at any price. Safer: add `p_amount_ngwee`,
`p_currency`, `p_provider` and enforce `total_ngwee = p_amount` and
`currency = 'ZMW'` inside the function, so the handler cannot forget. Reject an
empty reference. `provider_reference` is unique, which correctly blocks reusing
one reference across two orders.

### B6 [MEDIUM] Hosts can change price/capacity/status after orders exist

Hosts hold table-wide UPDATE on their events. Orders snapshot the price so
buyers are protected, but a host can cancel or hide an event after taking money,
or cut capacity below sold. Block price/currency changes and capacity reduction
once orders exist; make cancelling trigger refunds.

### B7

Do not enable the webhook while `expire_stale_orders` is unscheduled and there
is no refund path (B2, B4).

---

## C. Verified correct as-is

- `orders`, `tickets`: SELECT-only grants, no INSERT/UPDATE/DELETE policy or
  grant. Clients cannot mint or alter passes or set paid status.
- `issue_tickets_for_order`, `generate_ticket_code`, `mark_order_paid`,
  `expire_stale_orders`: revoked from public/anon/authenticated, service_role
  only. `create_order`: authenticated only.
- **No client-trusted money values.** `queries.js:398-408` and `TicketModal.jsx`
  send only event id, quantity, method and msisdn. Price, fee, total, status and
  the order's event_id are server-computed. Quantity bounded 1..10 server-side.
  `useHostRevenue` is display only.
- Paid-event concurrency: the event row lock serialises creates (no oversell, no
  double issue). `issue_tickets_for_order` is idempotent; a concurrent webhook
  retry blocks on the order row lock then sees committed tickets.
- Fee is deterministic and stored on the order, so settings changes do not alter
  existing orders.
- Share/reclaim/check-in concurrency (`20261004000300`): all three take
  `FOR UPDATE` on the ticket row, so "first scan wins" holds across two door
  phones. Reclaim racing a scan fails on `status <> 'valid'`. Reclaiming or
  sharing someone else's pass both return the same "No pass with that code" — no
  oracle there. A recipient cannot re-share (`share_pass` requires
  `user_id = uid`). `reclaim_pass` invalidates the old code and link.
- Share token: 64 hex chars from two `gen_random_uuid()` values (~244 bits),
  format CHECK, unique, equality-matched. Not enumerable.
- **Accepted design risk:** `view_shared_pass` returns the real ticket code plus
  exact address and coordinates to anyone holding the link. A leaked link is a
  leaked pass; first scan wins. The `0300` header states this.
- RLS enabled on events, event_private, guest_requests, orders, tickets,
  event_rsvps, referrals, profiles, account_private, notifications, blocks,
  platform_settings. Anon gets SELECT only on published events,
  platform_settings, and double-gated featured attendees/profiles. Anon has no
  access to orders, tickets, guest_requests, event_private, referrals or
  account_private. Cross-user reads denied except: the event host (see A3) and
  admins reading `account_private` (includes payout details — keep admin
  accounts few).
- `account_private`: `is_admin`, `is_suspended`, `phone`, `email`,
  `referral_code` pinned for non-privileged callers; `is_admin` not
  user-writable.
- Admin functions check `is_admin()` inside the SECURITY DEFINER body.
- Profiles are no longer public (`0400` dropped "profiles are public").
- The publishable key in `src/lib/supabaseClient.js` is public by design. No
  service_role key found in `src/`.

---

## D. Controls the future webhook handler must have

Run as an Edge Function / server with the service role key **server-side only**.

1. **Authenticity.** Verify the provider's HMAC over the *raw* body before JSON
   parsing, constant-time compare. MTN MoMo callbacks historically are not
   signed — in that case treat the callback only as a *trigger* and call the
   provider's get-transaction-status API with your own credentials, then act on
   that response. Also use a long random secret in the callback path, IP-allowlist
   if ranges are published, and reject non-HTTPS, wrong content-type, oversized bodies.
2. **Correlate by what you stored.** Save your own collection request id (MoMo
   `X-Reference-Id` / Airtel transaction id) as `provider_reference` when you
   initiate. Look the order up by that. **Never accept an order id from the payload.**
3. **Amount and currency.** Compare provider-reported amount and currency to
   `orders.total_ngwee` and `ZMW` using integer math. Reject mismatch or
   underpayment, record, alert. Check the paying msisdn and provider match the
   order, and that the status is a final success state.
4. **Replay/idempotency.** Persist every callback in `payment_events` with a
   unique key on (provider, provider event id), inserting *first*; a duplicate
   insert means stop and return 200.
5. **State rules.** Only `pending` → `paid`. Failed/cancelled → `failed`.
   Payments on expired/failed orders: refund or reinstate (B2). Re-check capacity
   in-transaction (B1). Refund excess on partial/duplicate payments.
6. **Never trust from the payload:** order id, amount, currency, user id, event
   id, quantity, payment status, msisdn-to-user binding, redirect URL. Use payload
   values in SQL only as bound parameters.
7. **Respond 200 only after the DB transaction commits**, so provider retries
   cover failures. Non-2xx on transient errors. Never log full payloads
   containing MSISDNs or secrets.
8. **Reconciliation.** Poll the provider for pending orders older than a few
   minutes (callbacks get lost), plus daily totals reconciliation against
   provider statements.
9. **Secrets** in server env only, never in `VITE_` variables. Rotate on suspicion.

---

## Priority order before going live

1. **A2** — tighten `attends_event` / RSVP insert (exploitable now)
2. **A1** — uniform errors, longer QR secret, throttling
3. **A3** — hide msisdn from hosts
4. **A4** — verified-host gate
5. **B1/B2/B4/B3** — capacity holds, expiry scheduler and late-payment handling,
   refund/void path, msisdn validation and pending caps
6. Move amount/currency checks into `mark_order_paid`
7. Remaining low items
