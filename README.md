# PAMP — Party At My Place

A mobile-first web app for finding parties, mixers and lounges in Zambia and getting on the guest list from your phone. Hosts post events and scan guests in at the door; guests get QR passes that work offline.

React 19 · Vite · Tailwind 4 · TanStack Query · Supabase (Postgres, Auth, Storage, Edge Functions) · installable as a PWA.

## Getting started

Needs Node 20 or later.

```sh
npm ci
cp .env.example .env.local   # then fill in the two values below
npm run dev
```

| Variable | Where to find it |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase dashboard, Project Settings, API |
| `VITE_SUPABASE_ANON_KEY` | The same page. Use the publishable (anon) key, never the secret or service key |

If they are unset the app falls back to the production project's public URL and publishable key (see `src/lib/supabaseClient.js`), so point your own environment at a separate project when developing against data you can break. Vite reads these at build time: change them on the host and you must rebuild.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm run preview` | Production build, and serve it locally |
| `npm run lint` | ESLint |
| `npm test` | Every test: unit tests, database tests and the webhook tests |
| `npm run test:db` | Only the database tests |
| `npm run check` | Lint, tests and build. This is what CI runs |

## Database and migrations

The schema lives in `supabase/migrations/`, applied in filename order. Name new files `YYYYMMDDHHMMSS_what_it_does.sql`, later than the last one.

```sh
npm run db:link -- <project-ref>   # once: link the Supabase CLI to your project
npm run db:push                    # apply new migrations
npm run db:types                   # regenerate src/lib/database.types.ts
```

Never edit a migration that has been pushed: add a new one.

**Security rests on row-level security and `security definer` functions.** Browsers can read orders, tickets and points but never write them. Price, fees, paid status, check-in and points all change inside database functions (`create_order`, `check_in_ticket`, `mark_order_paid`, ...). When adding a function, set `search_path = ''` and `revoke execute` from `public`, `anon` and `authenticated` unless a browser really should call it.

**The app can ship before a migration runs**, so `src/lib/queries.js` falls back to the older columns when Postgres reports one missing (`withFallback`). Remove a fallback once its migration is applied everywhere.

### Database tests

`tests/db/` boots Postgres in WebAssembly ([PGlite](https://pglite.dev)), runs every migration and tests the real policies, triggers and functions as the `anon`, `authenticated` and `service_role` roles. No Supabase project or Docker is needed:

```sh
npm run test:db
```

Add a test for any migration that changes who can see or do something.

## Payments

Paid passes are collected through [Lenco](https://lenco-api.readme.io) mobile money (MTN, Airtel and Zamtel). Card is not offered yet.

1. The customer picks a provider and number. `create_order` makes a `pending` order, setting the price and fee itself.
2. The app calls the `lenco-charge` Edge Function with just the order id. It reads the amount, number and operator from the order and asks Lenco to prompt the customer's phone, using the order id as Lenco's `reference`.
3. The customer approves on their phone. The app polls `lenco-charge` every few seconds, and Lenco also calls the `lenco-webhook` Edge Function.
4. Both paths end the same way: ask Lenco for the collection's current state, check it is `successful`, in `ZMW`, for exactly the order total, then call `mark_order_paid` with the service role. That issues the passes. A failed collection marks the order `failed`, which returns any points spent on it. Doing it twice is harmless.

The webhook is only a nudge. Its body is never trusted for status or amount; the decision always comes from Lenco's API over an authenticated call.

Code: `supabase/functions/_shared/lenco.ts` (signatures, amounts, Lenco client, deciding what a collection means), `lenco-charge/` and `lenco-webhook/`. Tests sit beside them and run in `npm test`.

### Set up

1. In the Lenco dashboard, get an API token. Use a sandbox token first. Lenco lists [test accounts](https://lenco-api.readme.io/v2.0/reference/test-cards-and-accounts) for sandbox collections.
2. Give it to Supabase and deploy:
   ```sh
   supabase secrets set LENCO_API_TOKEN=<token>
   supabase functions deploy lenco-charge lenco-webhook
   ```
3. Lenco sets webhook URLs for you: email support@lenco.ng and ask for `https://<project-ref>.supabase.co/functions/v1/lenco-webhook`. The webhook signature (`X-Lenco-Signature`) is checked with a key derived from the same token, so nothing else needs configuring.
4. Switching from sandbox to live means setting the live token again with `supabase secrets set`.

Until the webhook is set up, payments still complete: the app's polling finds the result. The webhook makes it quicker, and covers a customer who closes the app before approving.

### Check before going live

- **One sandbox payment, end to end.** The request body, the status endpoint (`GET /collections/status/<reference>`), the webhook events (`collection.successful`, `collection.failed`, `collection.settled`, each with our order id in `data.reference`) and the signature scheme were checked against [Lenco's docs](https://lenco-api.readme.io/v2.0/reference/get-collection-by-reference) on 2026-10-05. What the docs cannot show is a real run: pay one sandbox order and watch it reach `paid`.
- **Fees.** Collections default to the merchant bearing Lenco's fee, so it comes out of PAMP's takings on top of PAMP's own service fee. Lenco's `bearer` option can pass it to the customer instead.

### Known gaps

- If Lenco reports a different amount or reference, no pass is issued. The case is recorded in `payment_reviews` and listed on the admin page under "Payments to check", with the buyer, their number and Lenco's reference. Refund it in the Lenco dashboard, then mark it dealt with.
- A payment that arrives after the order's hold ran out still gets its passes if the places are free. If someone else has taken them since, the order fails (returning any points) and is listed under "Payments to check" as "Paid after the event had filled up", to refund.
- Mobile money accounts that Lenco makes verify by one-time PIN are not handled. Lenco's current docs list only `pending`, `successful`, `failed` and `pay-offline`, with no way to submit a PIN.
- Card payments.

### Places and prompts

An unpaid order holds its places until its hold runs out (`places_taken()` counts passes plus orders still being paid for), and `mark_order_paid` checks again under the event's lock when the money lands, so a capped event never sells more passes than it has. A mobile money order needs a valid Zambian number, stored as `260XXXXXXXXX`, and at most three payment prompts can wait on one number, and five on one buyer, so nobody can flood a phone with prompts.

### Expiring unpaid orders

`20261005000400_schedule_order_expiry.sql` schedules `expire_stale_orders()` every five minutes with `pg_cron`, which frees held places and gives back spent points. Enable the extension first under Database, Extensions in the Supabase dashboard; without it the migration only prints a notice. Check with `select * from cron.job;`.

## UniHair points

People can link their PAMP account to their UniHair account (unihair.shop, a separate app and Supabase project) so UniHair points count towards PAMP passes. A point is worth K0.10 in both.

- **Linking.** In UniHair, Account → Link PAMP shows an 8-character code (XXXX-XXXX) that lasts five minutes. Typed into PAMP's profile, the `unihair-link` Edge Function hands it to UniHair's `pamp-bridge` function, which checks it and records the link on both sides. Being signed in to both apps within the code's lifetime is the proof that the accounts are one person; nothing is matched by email. UniHair throttles wrong codes.
- **Moving points.** Each app spends only its own ledger. At a PAMP checkout that needs more points than PAMP holds, the shortfall is pulled: UniHair debits its ledger (refusing an overdraft) and only then does PAMP credit its own, under a ref both sides record. A pull with no answer is settled on the next visit by asking UniHair about that ref. Nothing can push points into PAMP, so nothing outside PAMP can create PAMP points. A pull is refused if the two apps value a point differently.
- **Earned points only.** Only points earned by using UniHair (completed bookings, delivered orders, admin-confirmed no-shows) can move, never sign-up or referral bonuses, so throwaway UniHair accounts are worth nothing here. At most 2,000 points a day leave a UniHair account or reach a PAMP account, a PAMP account can link a different UniHair account at most once a week, and deleted or suspended UniHair accounts drop out.
- **One way for now.** Points move UniHair → PAMP only. Spending PAMP points at UniHair is not built yet.

Code: `supabase/functions/_shared/bridge.ts` (signing and the UniHair client), `unihair-link/`, and `20261007000100_unihair_points_link.sql`. UniHair's half lives in the UniHairShop repo.

### Set up

1. Apply `20261007000100_unihair_points_link.sql`, and UniHair's matching schema section.
2. Make one random secret of at least 32 characters and set it as `POINTS_BRIDGE_SECRET` in **both** projects (Dashboard → Edge Functions → Secrets). For example, in PowerShell, which copies it to the clipboard without showing it:
   ```powershell
   $b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) | Set-Clipboard
   ```
3. Deploy `unihair-link` here and `pamp-bridge` in UniHair. Until the secret is set, both answer "not switched on yet" and the profile card stays hidden.

## CI

`.github/workflows/ci.yml` runs `npm run check` on every pull request and push to `main`.

## Versioning

Every push is a new version and every commit in it starts with that version, such as `v0.17.0 Collect payments through Lenco`. See `CLAUDE.md` for how to choose the bump.

## Project layout

```
src/components/   screens and sheets (the map, host and admin screens load lazily)
src/lib/          queries.js (all Supabase access), mappers, auth, offline passes
supabase/         migrations, Edge Functions, config, seed data
tests/db/         database tests that run the real migrations
```
