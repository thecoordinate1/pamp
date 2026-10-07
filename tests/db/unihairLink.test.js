// @vitest-environment node
// The UniHair link on PAMP's side: only the server records links and moves
// points, a UniHair account links to one PAMP account, and a pull credits PAMP
// once, only when UniHair has confirmed the debit.
import { beforeAll, describe, expect, it } from 'vitest';
import { asService, asUser, createDb, createUser, scalar } from './harness.js';

const UNIHAIR_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UNIHAIR_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const service = (db, sql, params = []) =>
  asService(db, (tx) => tx.query(sql, params).then((r) => r.rows), { commit: true });

const link = (db, user, profile, name = 'Mwila') =>
  service(db, 'select public.link_unihair_account($1, $2, $3)', [user, profile, name]);

const balance = (db, user) =>
  scalar(db, 'select coalesce((select balance from public.point_wallets where user_id = $1), 0) as b', [user]);

describe('linking accounts', () => {
  let db;
  let mwila;
  let other;

  beforeAll(async () => {
    db = await createDb();
    mwila = await createUser(db, 'Mwila');
    other = await createUser(db, 'Other');
  });

  it('is recorded by the server, and seen only by its owner', async () => {
    await link(db, mwila, UNIHAIR_A);
    const own = await asUser(db, mwila, (tx) => tx.query('select unihair_profile_id from public.unihair_links'));
    expect(own.rows).toEqual([{ unihair_profile_id: UNIHAIR_A }]);
    const theirs = await asUser(db, other, (tx) => tx.query('select * from public.unihair_links'));
    expect(theirs.rows).toEqual([]);
  });

  it('gives one UniHair account to one PAMP account', async () => {
    await expect(link(db, other, UNIHAIR_A)).rejects.toThrow(/already_linked/);
    // Linking the same pair again is harmless.
    await link(db, mwila, UNIHAIR_A);
    expect(await scalar(db, 'select count(*)::int from public.unihair_links')).toBe(1);
  });

  it('cannot be written or faked from a browser', async () => {
    await expect(
      asUser(db, other, (tx) =>
        tx.query('insert into public.unihair_links (user_id, unihair_profile_id) values ($1, $2)', [other, UNIHAIR_B])
      )
    ).rejects.toThrow(/permission denied/);
    for (const sql of [
      `select public.link_unihair_account('${other}', '${UNIHAIR_B}', 'x')`,
      `select public.begin_unihair_transfer('${mwila}', 5)`,
      `select public.unlink_unihair_account('${mwila}')`,
    ]) {
      await expect(asUser(db, other, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
  });

  it('can be removed, saying which UniHair account it was', async () => {
    const [row] = await service(db, 'select public.unlink_unihair_account($1) as profile', [mwila]);
    expect(row.profile).toBe(UNIHAIR_A);
    // Free for another PAMP account now.
    await link(db, other, UNIHAIR_A);
  });
});

describe('pulling UniHair points', () => {
  let db;
  let user;

  beforeAll(async () => {
    db = await createDb();
    user = await createUser(db, 'Puller');
    await link(db, user, UNIHAIR_A);
  });

  const begin = (points) =>
    service(db, 'select * from public.begin_unihair_transfer($1, $2)', [user, points]).then((r) => r[0]);
  const finish = (ref, taken) =>
    service(db, 'select public.finish_unihair_transfer($1, $2) as balance', [ref, taken]).then((r) => r[0].balance);

  it('needs a link', async () => {
    const loner = await createUser(db, 'Loner');
    await expect(
      service(db, 'select * from public.begin_unihair_transfer($1, 10)', [loner])
    ).rejects.toThrow(/not_linked/);
  });

  it('credits PAMP once UniHair confirms, and only once however often it is confirmed', async () => {
    const t = await begin(120);
    expect(t.status).toBe('pending');
    expect(await balance(db, user)).toBe(0);
    expect(await finish(t.ref, true)).toBe(120);
    expect(await finish(t.ref, true)).toBe(120);
    expect(await finish(t.ref, false)).toBe(120);
    const entries = await db.query(`select kind, points, ref from public.point_entries where user_id = $1`, [user]);
    expect(entries.rows).toEqual([{ kind: 'transfer_in', points: 120, ref: `unihair:${t.ref}` }]);
  });

  it('credits nothing when UniHair refused', async () => {
    const t = await begin(50);
    expect(await finish(t.ref, false)).toBe(120);
    expect(await scalar(db, 'select status from public.point_transfers where ref = $1', [t.ref])).toBe('failed');
  });

  it('lists the pulls still waiting on an answer', async () => {
    const t = await begin(30);
    const pending = await service(db, 'select ref from public.pending_unihair_transfers($1)', [user]);
    expect(pending.map((r) => r.ref)).toEqual([t.ref]);
  });

  it('refuses silly amounts', async () => {
    for (const points of [0, -1, 100001]) await expect(begin(points)).rejects.toThrow(/bad_points/);
  });

  it('lets the owner read their transfers but not change them', async () => {
    const seen = await asUser(db, user, (tx) => tx.query('select points from public.point_transfers'));
    expect(seen.rows.length).toBeGreaterThan(0);
    await expect(
      asUser(db, user, (tx) => tx.query(`update public.point_transfers set status = 'done'`))
    ).rejects.toThrow(/permission denied/);
  });
});
