// Runs the real migrations against PGlite (Postgres compiled to WebAssembly), so
// row-level security, SECURITY DEFINER functions and triggers can be tested
// without a Supabase project or Docker.
//
// The prelude below stands in for the parts of Supabase the migrations rely on.
// It reproduces Supabase's default grants on purpose: every new table in public
// is fully granted to anon and authenticated, and only the migrations' own
// REVOKE statements narrow that. Testing against a stricter baseline would hide
// exactly the kind of hole these tests exist to catch.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));

const SUPABASE_PRELUDE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    instance_id uuid,
    id uuid primary key default gen_random_uuid(),
    aud text, role text,
    email text, phone text,
    encrypted_password text,
    email_confirmed_at timestamptz,
    raw_app_meta_data jsonb not null default '{}',
    raw_user_meta_data jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  -- Same resolution order as Supabase: the single claim first, then the JSON.
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ), '')::uuid
  $$;

  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text, owner uuid, created_at timestamptz default now()
  );
  alter table storage.objects enable row level security;
  -- As on Supabase: the storage API reaches these tables as the caller, and
  -- RLS policies decide what each caller may do.
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  grant select on storage.buckets to anon, authenticated;
  create function storage.foldername(name text) returns text[]
  language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
`;

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
}

// Boots a fresh database with every migration applied, in filename order.
// Pass `upTo` to stop before a given file, then `applyMigrations(db, { from })`
// to run the rest: that is how a test sees what a migration does to rows that
// already existed when it was applied.
export async function createDb({ upTo } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_PRELUDE);
  await applyMigrations(db, { upTo });
  return db;
}

export async function applyMigrations(db, { from, upTo } = {}) {
  for (const file of migrationFiles()) {
    if (from && file < from) continue;
    if (upTo && file >= upTo) break;
    try {
      await db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
  }
}

// Creates a user the way Supabase does, which fires handle_new_user and so
// creates the matching profile and account_private rows.
// Keeps generated emails unique across calls.
let seq = 0;

// `metadata` is merged into raw_user_meta_data, which is where supabase-js puts
// signUp's options.data, so it can carry an invite's referral code.
export async function createUser(db, displayName = 'Test user', metadata = {}) {
  const { rows } = await db.query(
    `insert into auth.users (email, raw_user_meta_data)
     values ($1, jsonb_build_object('display_name', $2::text) || $3::jsonb) returning id`,
    [
      `${displayName.replace(/\W+/g, '.').toLowerCase()}.${Math.abs(hash(displayName + JSON.stringify(metadata)))}.${seq++}@test.local`,
      displayName,
      JSON.stringify(metadata),
    ]
  );
  return rows[0].id;
}


function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

// Runs fn as a signed-in user: role authenticated with that user's JWT claims,
// exactly as PostgREST does. The transaction is always rolled back, so each call
// starts from the same state unless the caller passes { commit: true }.
export async function asUser(db, userId, fn, { commit = false } = {}) {
  return asRole(db, 'authenticated', userId, fn, { commit });
}

export async function asAnon(db, fn, { commit = false } = {}) {
  return asRole(db, 'anon', null, fn, { commit });
}

async function asRole(db, role, userId, fn, { commit }) {
  let result;
  let failure;
  await db.transaction(async (tx) => {
    const claims = userId ? JSON.stringify({ sub: userId, role }) : JSON.stringify({ role });
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await tx.exec(`set local role ${role}`);
    try {
      result = await fn(tx);
    } catch (err) {
      failure = err;
    }
    // SET LOCAL ends with the transaction, so no reset is needed either way.
    if (failure || !commit) await tx.rollback();
  });
  if (failure) throw failure;
  return result;
}

// First column of the first row, for terse assertions.
export async function scalar(db, sql, params = []) {
  const { rows } = await db.query(sql, params);
  const row = rows[0];
  return row ? Object.values(row)[0] : undefined;
}
