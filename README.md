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

Paid events stay `pending` until a payment provider confirms them. The confirmation arrives at the `payment-webhook` Edge Function (`supabase/functions/payment-webhook/`), which checks the request's signature and that the amount equals the order total, then calls `mark_order_paid` with the service role. That issues the passes. A failure event marks the order `failed`, which returns any points spent on it. Redelivered webhooks are safe.

### Set up

1. Choose a secret and give it to both sides:
   ```sh
   supabase secrets set PAYMENT_WEBHOOK_SECRET=<long random string>
   supabase functions deploy payment-webhook
   ```
2. Point the provider's webhook at `https://<project-ref>.supabase.co/functions/v1/payment-webhook`.
3. The function expects a `POST` with the header `x-signature`, the hex HMAC-SHA256 of the raw body keyed with the secret, and this JSON:
   ```json
   { "event": "payment.succeeded", "order_id": "<uuid>", "reference": "<provider id>", "amount_ngwee": 5500 }
   ```
   (`payment.failed` for failures.) A real provider will send its own shape and signing scheme: adapt `verifySignature` and `parsePayment` in `logic.ts`. They are the only two places that know the format, and `logic.test.ts` covers them.

The browser side asks the provider to charge the customer's phone using the order's `id` and `total_ngwee`. That request is not built yet.

### Known gap

If a customer pays after their order's hold has run out and the order has expired, the webhook answers `409` and logs the order and reference. No passes are issued, so that payment has to be refunded or fixed by hand.

### Expiring unpaid orders

`20261005000400_schedule_order_expiry.sql` schedules `expire_stale_orders()` every five minutes with `pg_cron`, which frees held places and gives back spent points. Enable the extension first under Database, Extensions in the Supabase dashboard; without it the migration only prints a notice. Check with `select * from cron.job;`.

## CI

`.github/workflows/ci.yml` runs `npm run check` on every pull request and push to `main`.

## Versioning

Every push is a new version and every commit in it starts with that version, such as `v0.16.0 Add payment webhook`. See `CLAUDE.md` for how to choose the bump.

## Project layout

```
src/components/   screens and sheets (the map, host and admin screens load lazily)
src/lib/          queries.js (all Supabase access), mappers, auth, offline passes
supabase/         migrations, Edge Functions, config, seed data
tests/db/         database tests that run the real migrations
```
