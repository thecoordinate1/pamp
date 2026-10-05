// @vitest-environment node
// The paid-order path: only the service role confirms a payment, passes are
// issued once however often the webhook repeats, and orders nobody paid for
// expire and give back what they held.
import { beforeAll, describe, expect, it } from 'vitest';
import { asAnon, asService, asUser, createDb, createUser, scalar } from './harness.js';
import { makeEvent, ticketsOf } from './fixtures.js';

const pendingOrder = (db, userId, eventId, quantity = 2) =>
  asUser(
    db,
    userId,
    async (tx) =>
      (
        await tx.query(
          `select * from public.create_order($1::uuid, $2::int, 'mtn'::public.payment_method, '0971234567')`,
          [eventId, quantity]
        )
      ).rows[0],
    { commit: true }
  );

const markPaid = (db, orderId, reference) =>
  asService(
    db,
    async (tx) => (await tx.query('select * from public.mark_order_paid($1, $2)', [orderId, reference])).rows[0],
    { commit: true }
  );

const statusOf = (db, orderId) => scalar(db, 'select status from public.orders where id = $1', [orderId]);

describe('confirming a payment', () => {
  let db;
  let host;
  let guest;
  let event;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    guest = await createUser(db, 'Guest');
    event = await makeEvent(db, host, { price: 5000 });
  });

  it('leaves a paid event pending, with no passes, until the provider confirms', async () => {
    const order = await pendingOrder(db, guest, event);
    expect(order.status).toBe('pending');
    expect(await ticketsOf(db, guest, event)).toHaveLength(0);
  });

  it('issues one pass per place and a guest-list entry when the webhook confirms', async () => {
    const order = await pendingOrder(db, guest, event, 2);
    const paid = await markPaid(db, order.id, 'MM-1');
    expect(paid.status).toBe('paid');
    expect(paid.provider_reference).toBe('MM-1');
    expect((await ticketsOf(db, guest, event)).length).toBeGreaterThanOrEqual(2);
    expect(
      await scalar(db, 'select count(*)::int from public.event_rsvps where event_id = $1 and user_id = $2', [event, guest])
    ).toBe(1);
  });

  it('does not issue passes again when the webhook is delivered twice', async () => {
    const buyer = await createUser(db, 'Twice');
    const order = await pendingOrder(db, buyer, event, 3);
    await markPaid(db, order.id, 'MM-2');
    await markPaid(db, order.id, 'MM-2');
    expect(await ticketsOf(db, buyer, event)).toHaveLength(3);
  });

  it('will not confirm an order that has expired', async () => {
    const buyer = await createUser(db, 'Late');
    const order = await pendingOrder(db, buyer, event, 1);
    await db.query(`update public.orders set expires_at = now() - interval '1 minute' where id = $1`, [order.id]);
    await asService(db, (tx) => tx.query('select public.expire_stale_orders()'), { commit: true });
    await expect(markPaid(db, order.id, 'MM-3')).rejects.toThrow(/not payable/);
    expect(await ticketsOf(db, buyer, event)).toHaveLength(0);
  });

  it('keeps browsers away from the payment functions', async () => {
    const order = await pendingOrder(db, guest, event, 1);
    await expect(
      asUser(db, guest, (tx) => tx.query('select * from public.mark_order_paid($1, $2)', [order.id, 'forged']))
    ).rejects.toThrow(/permission denied/);
    await expect(
      asAnon(db, (tx) => tx.query('select * from public.mark_order_paid($1, $2)', [order.id, 'forged']))
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, guest, (tx) => tx.query('select public.expire_stale_orders()'))
    ).rejects.toThrow(/permission denied/);
    expect(await statusOf(db, order.id)).toBe('pending');
  });

  it('does not let a browser mark its own order paid by updating it', async () => {
    const order = await pendingOrder(db, guest, event, 1);
    await expect(
      asUser(db, guest, (tx) => tx.query(`update public.orders set status = 'paid' where id = $1`, [order.id]))
    ).rejects.toThrow(/permission denied/);
  });
});

describe('orders nobody paid for', () => {
  let db;
  let host;
  let event;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    event = await makeEvent(db, host, { price: 5000 });
  });

  const withPoints = async (name, points) => {
    const user = await createUser(db, name);
    await db.query('update public.profiles set identity_verified_at = now() where id = $1', [user]);
    await db.query(`select public.add_points($1, $2, 'adjustment')`, [user, points]);
    const order = await asUser(
      db,
      user,
      async (tx) =>
        (
          await tx.query(
            `select * from public.create_order($1::uuid, 1, 'mtn'::public.payment_method, '0971234567', $2::int)`,
            [event, points]
          )
        ).rows[0],
      { commit: true }
    );
    return { user, order };
  };

  const balance = (userId) =>
    scalar(db, 'select coalesce((select balance from public.point_wallets where user_id = $1), 0)', [userId]);

  it('expires only the orders whose hold has run out', async () => {
    const a = await createUser(db, 'Stale');
    const b = await createUser(db, 'Fresh');
    const stale = await pendingOrder(db, a, event, 1);
    const fresh = await pendingOrder(db, b, event, 1);
    await db.query(`update public.orders set expires_at = now() - interval '1 minute' where id = $1`, [stale.id]);

    const count = await asService(db, async (tx) => scalar(tx, 'select public.expire_stale_orders()'), { commit: true });

    expect(count).toBeGreaterThanOrEqual(1);
    expect(await statusOf(db, stale.id)).toBe('expired');
    expect(await statusOf(db, fresh.id)).toBe('pending');
  });

  it('gives points back when an unpaid order expires', async () => {
    const { user, order } = await withPoints('Spender', 100);
    expect(await balance(user)).toBeLessThan(100);
    await db.query(`update public.orders set expires_at = now() - interval '1 minute' where id = $1`, [order.id]);
    await asService(db, (tx) => tx.query('select public.expire_stale_orders()'), { commit: true });
    expect(await balance(user)).toBe(100);
  });

  it('gives points back when the provider reports the payment failed', async () => {
    const { user, order } = await withPoints('Failed', 100);
    await asService(db, (tx) => tx.query(`update public.orders set status = 'failed' where id = $1`, [order.id]), {
      commit: true,
    });
    expect(await balance(user)).toBe(100);
  });
});
