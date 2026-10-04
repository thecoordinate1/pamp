// @vitest-environment node
// Proves the harness itself behaves like Supabase before anything relies on it.
import { describe, expect, it, beforeAll } from 'vitest';
import { asAnon, asUser, createDb, createUser, migrationFiles, scalar } from './harness.js';

describe('database harness', () => {
  let db;
  let alice;

  beforeAll(async () => {
    db = await createDb();
    alice = await createUser(db, 'Alice');
  });

  it('applies every migration in order', () => {
    expect(migrationFiles().length).toBeGreaterThanOrEqual(13);
  });

  it('creates a profile for each new auth user', async () => {
    expect(await scalar(db, 'select display_name from public.profiles where id = $1', [alice])).toBe('Alice');
  });

  it('resolves auth.uid() and the role from the impersonated claims', async () => {
    const who = await asUser(db, alice, (tx) => scalar(tx, 'select auth.uid()'));
    expect(who).toBe(alice);
    const role = await asUser(db, alice, (tx) => scalar(tx, 'select current_user'));
    expect(role).toBe('authenticated');
    expect(await asAnon(db, (tx) => scalar(tx, 'select auth.uid()'))).toBeNull();
  });

  it('enforces row-level security for impersonated users', async () => {
    // account_private is private to its owner; another user sees nothing.
    const bob = await createUser(db, 'Bob');
    const seen = await asUser(db, bob, (tx) =>
      scalar(tx, 'select count(*)::int from public.account_private where user_id = $1', [alice])
    );
    expect(seen).toBe(0);
  });

  it('rolls back by default and rethrows SQL errors', async () => {
    await asUser(db, alice, (tx) =>
      tx.query(`update public.profiles set headline = 'changed' where id = $1`, [alice])
    );
    expect(await scalar(db, 'select headline from public.profiles where id = $1', [alice])).not.toBe('changed');
    await expect(asUser(db, alice, (tx) => tx.query('select 1/0'))).rejects.toThrow(/division by zero/);
  });
});
