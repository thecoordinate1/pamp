// @vitest-environment node
// A capped paid event never takes more payments than it has places (review
// finding B1), and nobody can flood a phone with payment prompts (B3).
import { beforeAll, describe, expect, it } from 'vitest';
import { asService, asUser, createDb, createUser, scalar } from './harness.js';
import { makeEvent, ticketsOf } from './fixtures.js';

let phones = 0;
// A different valid Zambian number each time, unless one is given.
const nextPhone = () => `097${String(++phones).padStart(7, '0')}`;

const order = (db, userId, eventId, quantity = 1, phone = nextPhone()) =>
  asUser(
    db,
    userId,
    async (tx) =>
      (
        await tx.query(
          `select * from public.create_order($1::uuid, $2::int, 'mtn'::public.payment_method, $3)`,
          [eventId, quantity, phone]
        )
      ).rows[0],
    { commit: true }
  );

const markPaid = (db, orderId) =>
  asService(
    db,
    // Each payment has its own provider reference, as real ones do.
    async (tx) => (await tx.query('select * from public.mark_order_paid($1, $2)', [orderId, `lenco:${orderId}`])).rows[0],
    { commit: true }
  );

const lapse = (db, orderId) =>
  db.query(`update public.orders set expires_at = now() - interval '1 minute' where id = $1`, [orderId]);

describe('places on a capped paid event', () => {
  let db;
  let host;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
  });

  it('are held by orders still being paid for', async () => {
    const event = await makeEvent(db, host, { price: 5000, capacity: 2 });
    await order(db, await createUser(db, 'First'), event, 2);
    await expect(order(db, await createUser(db, 'Second'), event, 1)).rejects.toThrow(/Not enough passes left/);
  });

  it('come free again when an unpaid order’s hold runs out', async () => {
    const event = await makeEvent(db, host, { price: 5000, capacity: 1 });
    const first = await order(db, await createUser(db, 'Slow'), event);
    await lapse(db, first.id);
    expect((await order(db, await createUser(db, 'Next'), event)).status).toBe('pending');
  });

  it('are issued when a payment lands in time', async () => {
    const event = await makeEvent(db, host, { price: 5000, capacity: 2 });
    const buyer = await createUser(db, 'On time');
    const pending = await order(db, buyer, event, 2);
    expect((await markPaid(db, pending.id)).status).toBe('paid');
    expect(await ticketsOf(db, buyer, event)).toHaveLength(2);
  });

  it('still go to a late payer when nobody else has taken them', async () => {
    const event = await makeEvent(db, host, { price: 5000, capacity: 1 });
    const buyer = await createUser(db, 'Late but lucky');
    const pending = await order(db, buyer, event);
    await lapse(db, pending.id);
    expect((await markPaid(db, pending.id)).status).toBe('paid');
    expect(await ticketsOf(db, buyer, event)).toHaveLength(1);
  });

  it('are never oversold: a payment for places since taken fails and goes to review', async () => {
    const event = await makeEvent(db, host, { price: 5000, capacity: 1 });
    const late = await createUser(db, 'Too late');
    const pending = await order(db, late, event);
    await lapse(db, pending.id);
    const prompt = await createUser(db, 'Prompt');
    const second = await order(db, prompt, event);
    await markPaid(db, second.id);

    const settled = await markPaid(db, pending.id);
    expect(settled.status).toBe('failed');
    expect(await ticketsOf(db, late, event)).toHaveLength(0);
    expect(await scalar(db, 'select count(*)::int from public.tickets where event_id = $1', [event])).toBe(1);
    expect(
      await scalar(db, `select reason from public.payment_reviews where order_id = $1`, [pending.id])
    ).toBe('over_capacity');
  });
});

describe('locks', () => {
  // PGlite runs one connection, so two payments cannot actually race here.
  // What prevents a deadlock between create_order and mark_order_paid is that
  // both take the event row's lock before anything else; this pins that order
  // in the function as installed.
  it('mark_order_paid locks the event before the order, as create_order does', async () => {
    const db = await createDb();
    const def = (name) => scalar(db, `select pg_get_functiondef('public.${name}'::regproc)`);
    const paid = await def('mark_order_paid');
    const eventLock = paid.indexOf('from public.events e where e.id = v_event_id for no key update');
    const orderLock = paid.indexOf('from public.orders o where o.id = p_order for update');
    expect(eventLock).toBeGreaterThan(-1);
    expect(orderLock).toBeGreaterThan(eventLock);
    const order = await def('create_order');
    expect(order).toMatch(/from public\.events e where e\.id = p_event_id for no key update/);
  });
});

describe('payment prompts', () => {
  let db;
  let host;
  let event;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    event = await makeEvent(db, host, { price: 5000 });
  });

  it('need a real Zambian mobile number, stored the same way every time', async () => {
    const buyer = await createUser(db, 'Typist');
    await expect(order(db, buyer, event, 1, '12345')).rejects.toThrow(/valid Zambian mobile money number/);
    expect((await order(db, buyer, event, 1, '+260 97 765 4321')).msisdn).toBe('260977654321');
  });

  it('are limited to three waiting per number, whoever asks', async () => {
    const victim = '0966000001';
    for (const name of ['A', 'B', 'C']) await order(db, await createUser(db, name), event, 1, victim);
    await expect(order(db, await createUser(db, 'D'), event, 1, '+260966000001')).rejects.toThrow(
      /already has payments waiting/
    );
  });

  it('are limited to five waiting per buyer', async () => {
    const buyer = await createUser(db, 'Spammer');
    for (let i = 0; i < 5; i++) await order(db, buyer, event);
    await expect(order(db, buyer, event)).rejects.toThrow(/several orders waiting/);
  });
});
