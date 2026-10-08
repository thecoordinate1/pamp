// @vitest-environment node
// Payments that need a person: the payment functions record them, admins see
// them with what a refund needs, and nobody else sees them. Also, hosts can no
// longer read the mobile money numbers on their events' orders (review A3).
import { beforeAll, describe, expect, it } from 'vitest';
import { asService, asUser, createDb, createUser } from './harness.js';
import { makeEvent } from './fixtures.js';

const pendingOrder = (db, userId, eventId) =>
  asUser(
    db,
    userId,
    async (tx) =>
      (
        await tx.query(
          `select * from public.create_order($1::uuid, 1, 'airtel'::public.payment_method, '0971234567')`,
          [eventId]
        )
      ).rows[0],
    { commit: true }
  );

const flag = (db, orderId, reason = 'order_not_payable') =>
  asService(
    db,
    (tx) =>
      tx.query(
        `insert into public.payment_reviews (order_id, reason, provider_reference, amount, currency)
         values ($1, $2, '240730008', '52.50', 'ZMW') on conflict (order_id, reason) do nothing`,
        [orderId, reason]
      ),
    { commit: true }
  );

const reviews = (db, userId) =>
  asUser(db, userId, (tx) => tx.query('select * from public.payments_to_review()').then((r) => r.rows));

describe('the mobile money number on an order', () => {
  let db;
  let host;
  let buyer;
  let order;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    buyer = await createUser(db, 'Buyer');
    order = await pendingOrder(db, buyer, await makeEvent(db, host, { price: 5000 }));
  });

  it('comes back to the buyer when they order, normalised', () => {
    expect(order.msisdn).toBe('260971234567');
  });

  it('cannot be read by the event’s host, who still sees the money', async () => {
    await expect(
      asUser(db, host, (tx) => tx.query('select msisdn from public.orders where id = $1', [order.id]))
    ).rejects.toThrow(/permission denied/);
    const { rows } = await asUser(db, host, (tx) =>
      tx.query('select subtotal_ngwee, status from public.orders where id = $1', [order.id])
    );
    expect(rows).toEqual([{ subtotal_ngwee: 5000, status: 'pending' }]);
  });

  it('is not needed by the buyer to read the rest of their order', async () => {
    const { rows } = await asUser(db, buyer, (tx) =>
      tx.query('select total_ngwee, points_used from public.orders where id = $1', [order.id])
    );
    expect(rows).toHaveLength(1);
  });
});

describe('payments to review', () => {
  let db;
  let admin;
  let buyer;
  let order;

  beforeAll(async () => {
    db = await createDb();
    admin = await createUser(db, 'Admin');
    await db.query('update public.account_private set is_admin = true where user_id = $1', [admin]);
    buyer = await createUser(db, 'Late Payer');
    const host = await createUser(db, 'Host');
    order = await pendingOrder(db, buyer, await makeEvent(db, host, { price: 5000, name: 'Rooftop' }));
    await db.query(`update public.orders set status = 'expired' where id = $1`, [order.id]);
  });

  it('records each case once, however often it is found', async () => {
    await flag(db, order.id);
    await flag(db, order.id);
    expect((await reviews(db, admin)).length).toBe(1);
  });

  it('shows admins what a refund needs', async () => {
    const [row] = await reviews(db, admin);
    expect(row).toMatchObject({
      order_id: order.id,
      reason: 'order_not_payable',
      provider_reference: '240730008',
      amount: '52.50',
      order_status: 'expired',
      buyer_name: 'Late Payer',
      buyer_msisdn: '260971234567',
      event_name: 'Rooftop',
    });
  });

  it('is hidden from everyone else, and cannot be written from a browser', async () => {
    await expect(reviews(db, buyer)).rejects.toThrow(/Admins only/);
    await expect(
      asUser(db, buyer, (tx) => tx.query('select * from public.payment_reviews'))
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, buyer, (tx) =>
        tx.query(`insert into public.payment_reviews (order_id, reason) values ($1, 'amount_mismatch')`, [order.id])
      )
    ).rejects.toThrow(/permission denied/);
  });

  it('leaves the list once an admin marks it dealt with', async () => {
    const [row] = await reviews(db, admin);
    await expect(
      asUser(db, buyer, (tx) => tx.query('select public.resolve_payment_review($1, $2)', [row.review_id, 'x']))
    ).rejects.toThrow(/Admins only/);
    const done = await asUser(
      db,
      admin,
      (tx) =>
        tx
          .query('select public.resolve_payment_review($1, $2) as ok', [row.review_id, 'Refunded K52.50 via Lenco'])
          .then((r) => r.rows[0].ok),
      { commit: true }
    );
    expect(done).toBe(true);
    expect(await reviews(db, admin)).toEqual([]);
  });
});
