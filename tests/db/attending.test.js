// @vitest-environment node
// Who counts as being at an event, for seeing its guest list: a pass, an
// approved request, or an RSVP to a free event. An RSVP to a paid event, which
// anyone can make, is not enough. (Security review 2026-10-04, finding A2.)
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDb, createUser } from './harness.js';
import { makeEvent } from './fixtures.js';

const guestIds = (tx, eventId) =>
  tx
    .query('select user_id from public.event_rsvps where event_id = $1', [eventId])
    .then((r) => r.rows.map((row) => row.user_id));

const profileName = (tx, userId) =>
  tx.query('select display_name from public.profiles where id = $1', [userId]).then((r) => r.rows[0]?.display_name);

const rsvp = (db, userId, eventId) =>
  asUser(db, userId, (tx) => tx.query('insert into public.event_rsvps (event_id, user_id) values ($1, $2)', [eventId, userId]), {
    commit: true,
  });

// A paid order settled the way the payment webhook would, issuing the pass.
async function paidPass(db, userId, eventId) {
  const { rows } = await db.query(
    `insert into public.orders (event_id, user_id, quantity, unit_price_ngwee, subtotal_ngwee, total_ngwee, status, method, paid_at)
     values ($1, $2, 1, 5000, 5000, 5000, 'paid', 'mtn', now()) returning id`,
    [eventId, userId]
  );
  await db.query('select public.issue_tickets_for_order($1)', [rows[0].id]);
}

describe('the guest list of a paid event', () => {
  let db;
  let host;
  let holder;
  let approved;
  let lurker;
  let evt;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    holder = await createUser(db, 'Pass Holder');
    approved = await createUser(db, 'Approved Guest');
    lurker = await createUser(db, 'Lurker');
    evt = await makeEvent(db, host, { price: 5000 });

    await paidPass(db, holder, evt);
    await db.query('update public.event_rsvps set show_publicly = true where event_id = $1 and user_id = $2', [evt, holder]);
    await db.query(
      `insert into public.guest_requests (event_id, user_id, status) values ($1, $2, 'approved')`,
      [evt, approved]
    );
    await rsvp(db, lurker, evt);
  });

  it('is hidden from someone who only RSVP’d', async () => {
    expect(await asUser(db, lurker, (tx) => guestIds(tx, evt))).toEqual([lurker]);
    expect(await asUser(db, lurker, (tx) => profileName(tx, holder))).toBeUndefined();
  });

  it('is open to a guest the host approved', async () => {
    expect(await asUser(db, approved, (tx) => guestIds(tx, evt))).toContain(holder);
    expect(await asUser(db, approved, (tx) => profileName(tx, holder))).toBe('Pass Holder');
  });

  it('still shows the host everyone', async () => {
    const seen = await asUser(db, host, (tx) => guestIds(tx, evt));
    expect(seen).toEqual(expect.arrayContaining([holder, lurker]));
  });
});

describe('RSVPs', () => {
  let db;
  let host;
  let guest;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    guest = await createUser(db, 'Guest');
  });

  it('can only be made to published events', async () => {
    const draft = await makeEvent(db, host, { name: 'Not out yet' });
    await db.query(`update public.events set status = 'draft' where id = $1`, [draft]);
    await expect(rsvp(db, guest, draft)).rejects.toThrow(/row-level security/);
  });

  it('to a free event still put you on its guest list', async () => {
    const free = await makeEvent(db, host);
    const other = await createUser(db, 'Other Guest');
    await rsvp(db, other, free);
    await db.query('update public.event_rsvps set show_publicly = true where event_id = $1 and user_id = $2', [free, other]);
    await rsvp(db, guest, free);
    expect(await asUser(db, guest, (tx) => guestIds(tx, free))).toContain(other);
  });
});
