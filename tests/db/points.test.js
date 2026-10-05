// @vitest-environment node
// Points: earned at the door and by inviting friends who turn up, spent as money
// off paid passes by verified profiles, and never written by a browser.
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDb, createUser, scalar } from './harness.js';
import { checkIn, makeEvent, order, ticketsOf, undoCheckIn } from './fixtures.js';

const balance = (db, userId) =>
  scalar(db, 'select coalesce((select balance from public.point_wallets where user_id = $1), 0) as b', [userId]);

const history = (db, userId) =>
  db
    .query('select kind, points from public.point_entries where user_id = $1 order by created_at, kind', [userId])
    .then((r) => r.rows);

const codeOf = (db, userId) => scalar(db, 'select referral_code from public.account_private where user_id = $1', [userId]);

const verify = (db, userId) =>
  db.query('update public.profiles set identity_verified_at = now() where id = $1', [userId]);

const grant = (db, userId, points) =>
  db.query(`select public.add_points($1, $2, 'adjustment')`, [userId, points]);

const buyWithPoints = (db, userId, eventId, points, quantity = 1) =>
  asUser(
    db,
    userId,
    async (tx) =>
      (
        await tx.query(
          `select * from public.create_order($1::uuid, $2::int, 'mtn'::public.payment_method, '0971234567', $3::int)`,
          [eventId, quantity, points]
        )
      ).rows[0],
    { commit: true }
  );

describe('earning points at the door', () => {
  let db;
  let host;
  let inviter;
  let guest;
  let evt;
  let second;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    inviter = await createUser(db, 'Inviter');
    guest = await createUser(db, 'Guest', { referral_code: await codeOf(db, inviter) });
    evt = await makeEvent(db, host);
    second = await makeEvent(db, host, { name: 'Second party' });
    await order(db, guest, evt, 2);
    await order(db, guest, second);
  });

  it('gives a guest points once per event, however many of their passes are scanned', async () => {
    const [a, b] = await ticketsOf(db, guest, evt);
    await checkIn(db, host, a.code);
    expect(await balance(db, guest)).toBe(20);
    await checkIn(db, host, b.code);
    await checkIn(db, host, a.code);
    expect(await balance(db, guest)).toBe(20);
  });

  it('pays whoever invited them when they first turn up, and only then', async () => {
    expect(await history(db, inviter)).toEqual([{ kind: 'referral', points: 25 }]);
    const [pass] = await ticketsOf(db, guest, second);
    await checkIn(db, host, pass.code);
    expect(await balance(db, guest)).toBe(40);
    expect(await balance(db, inviter)).toBe(25);
  });

  it('takes the points back when a scan is undone, and gives them again on a rescan', async () => {
    const [a, b] = await ticketsOf(db, guest, evt);
    await undoCheckIn(db, host, a.code);
    expect(await balance(db, guest)).toBe(40);

    await undoCheckIn(db, host, b.code);
    expect(await balance(db, guest)).toBe(20);
    // Still let in at the second party, so the invite still counts.
    expect(await balance(db, inviter)).toBe(25);

    await checkIn(db, host, a.code);
    expect(await balance(db, guest)).toBe(40);
  });

  it('gives a host nothing for passes scanned at their own event', async () => {
    await order(db, host, evt);
    const [pass] = await ticketsOf(db, host, evt);
    await checkIn(db, host, pass.code);
    expect(await balance(db, host)).toBe(0);
  });

  it('gives a host nothing for guests they invited to their own event', async () => {
    const recruit = await createUser(db, 'Recruit', { referral_code: await codeOf(db, host) });
    await order(db, recruit, evt);
    const [pass] = await ticketsOf(db, recruit, evt);
    await checkIn(db, host, pass.code);
    expect(await balance(db, recruit)).toBe(20);
    expect(await balance(db, host)).toBe(0);
  });

  it('cannot be written or topped up from a browser', async () => {
    await expect(
      asUser(db, guest, (tx) =>
        tx.query(`insert into public.point_entries (user_id, points, kind) values ($1, 1000, 'adjustment')`, [guest])
      )
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, guest, (tx) => tx.query('update public.point_wallets set balance = 1000 where user_id = $1', [guest]))
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, guest, (tx) => tx.query(`select public.add_points($1, 1000, 'adjustment')`, [guest]))
    ).rejects.toThrow(/permission denied/);
  });

  it('shows each person only their own points', async () => {
    const seen = await asUser(db, inviter, (tx) =>
      tx.query('select user_id from public.point_entries').then((r) => r.rows.map((row) => row.user_id))
    );
    expect(new Set(seen)).toEqual(new Set([inviter]));
    const mine = await asUser(db, guest, (tx) => tx.query('select * from public.my_points()').then((r) => r.rows[0]));
    expect(mine).toEqual({ balance: 40, point_value_ngwee: 10 });
  });
});

describe('spending points on a paid pass', () => {
  let db;
  let host;
  let buyer;
  let paid;
  let free;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    buyer = await createUser(db, 'Buyer');
    paid = await makeEvent(db, host, { price: 5000 });
    free = await makeEvent(db, host);
    await grant(db, buyer, 100);
  });

  it('is only for verified profiles', async () => {
    await expect(buyWithPoints(db, buyer, paid, 50)).rejects.toThrow(/verified/);
    expect(await balance(db, buyer)).toBe(100);
  });

  it('takes money off the price, and the host is still owed the full amount', async () => {
    await verify(db, buyer);
    const o = await buyWithPoints(db, buyer, paid, 100);
    expect(o.points_used).toBe(100);
    expect(o.points_discount_ngwee).toBe(1000);
    expect(o.subtotal_ngwee).toBe(5000);
    expect(o.total_ngwee).toBe(o.subtotal_ngwee + o.fee_ngwee - 1000);
    expect(o.status).toBe('pending');
    expect(await balance(db, buyer)).toBe(0);
  });

  it('gives the points back when the order is left unpaid', async () => {
    await db.query(`update public.orders set expires_at = now() - interval '1 minute' where user_id = $1`, [buyer]);
    const mine = await asUser(db, buyer, (tx) => tx.query('select * from public.my_points()').then((r) => r.rows[0]), {
      commit: true,
    });
    expect(mine.balance).toBe(100);
    expect(await history(db, buyer)).toEqual([
      { kind: 'adjustment', points: 100 },
      { kind: 'pass_discount', points: -100 },
      { kind: 'pass_discount_refund', points: 100 },
    ]);
  });

  it('pays for a whole pass, using no more points than it costs', async () => {
    await grant(db, buyer, 600);
    const o = await buyWithPoints(db, buyer, paid, 10000);
    const needed = Math.ceil((o.subtotal_ngwee + o.fee_ngwee) / 10);
    expect(o.points_used).toBe(needed);
    expect(o.total_ngwee).toBe(0);
    expect(o.status).toBe('paid');
    expect(o.method).toBe('points');
    expect(await ticketsOf(db, buyer, paid)).toHaveLength(1);
    expect(await balance(db, buyer)).toBe(700 - needed);
  });

  it('refuses more points than the person has, or points on a free event', async () => {
    const left = await balance(db, buyer);
    await expect(buyWithPoints(db, buyer, paid, left + 1)).rejects.toThrow(/do not have that many points/);
    await expect(buyWithPoints(db, buyer, free, 1)).rejects.toThrow(/only be used on paid passes/);
    expect(await balance(db, buyer)).toBe(left);
  });
});
