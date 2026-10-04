// @vitest-environment node
// Door check-in records attendance, events show how many people came, and a
// person who already holds a pass gets that same pass back instead of a new one.
import { beforeAll, describe, expect, it } from 'vitest';
import { asAnon, asUser, createDb, createUser, scalar } from './harness.js';
import { checkIn, eventCounts, makeEvent, order, ticketsOf, undoCheckIn } from './fixtures.js';

describe('attendance', () => {
  let db;
  let host;
  let guest;
  let friend;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    guest = await createUser(db, 'Guest');
    friend = await createUser(db, 'Friend');
  });

  it('starts every event at zero attended, readable by anyone', async () => {
    const evt = await makeEvent(db, host);
    const seen = await asAnon(db, (tx) =>
      scalar(tx, 'select attended_count from public.events where id = $1', [evt])
    );
    expect(seen).toBe(0);
  });

  it('counts a guest as attended when the host scans their pass', async () => {
    const evt = await makeEvent(db, host);
    await order(db, guest, evt);
    const [pass] = await ticketsOf(db, guest, evt);

    const scan = await checkIn(db, host, pass.code);
    expect(scan.was_already_in).toBe(false);
    expect((await eventCounts(db, evt)).attended_count).toBe(1);

    // The attendee can see their own check-in through RLS.
    const mine = await asUser(db, guest, async (tx) =>
      (await tx.query('select status, checked_in_at from public.tickets where code = $1', [pass.code])).rows[0]
    );
    expect(mine.status).toBe('checked_in');
    expect(mine.checked_in_at).not.toBeNull();
  });

  it('does not count a second scan of the same pass', async () => {
    const evt = await makeEvent(db, host);
    await order(db, guest, evt);
    const [pass] = await ticketsOf(db, guest, evt);
    await checkIn(db, host, pass.code);
    const again = await checkIn(db, host, pass.code);
    expect(again.was_already_in).toBe(true);
    expect((await eventCounts(db, evt)).attended_count).toBe(1);
  });

  it('takes a person back off the count when the host undoes a check-in', async () => {
    const evt = await makeEvent(db, host);
    await order(db, guest, evt);
    const [pass] = await ticketsOf(db, guest, evt);
    await checkIn(db, host, pass.code);
    expect(await undoCheckIn(db, host, pass.code)).toBe(true);
    expect((await eventCounts(db, evt)).attended_count).toBe(0);
    // Undoing twice must not push the count below zero.
    expect(await undoCheckIn(db, host, pass.code)).toBe(false);
    expect((await eventCounts(db, evt)).attended_count).toBe(0);
  });

  it('counts each pass in a multi-pass order separately', async () => {
    const evt = await makeEvent(db, host);
    await order(db, guest, evt, 3);
    const passes = await ticketsOf(db, guest, evt);
    expect(passes).toHaveLength(3);
    await checkIn(db, host, passes[0].code);
    await checkIn(db, host, passes[2].code);
    expect((await eventCounts(db, evt)).attended_count).toBe(2);
  });

  it('keeps the counts out of the host’s hands', async () => {
    const evt = await makeEvent(db, host);
    await asUser(
      db,
      host,
      (tx) =>
        tx.query('update public.events set attended_count = 500, rsvp_count = 900 where id = $1', [evt]),
      { commit: true }
    );
    expect(await eventCounts(db, evt)).toEqual({ rsvp_count: 0, attended_count: 0 });

    // Ordinary edits still go through.
    await asUser(
      db,
      host,
      (tx) => tx.query(`update public.events set name = 'Renamed party' where id = $1`, [evt]),
      { commit: true }
    );
    expect(await scalar(db, 'select name from public.events where id = $1', [evt])).toBe('Renamed party');
  });

  it('starts a newly created event at zero even if the client sends counts', async () => {
    const id = await asUser(
      db,
      host,
      async (tx) =>
        (
          await tx.query(
            `insert into public.events (host_id, name, starts_on, start_time, area, rsvp_count, attended_count)
             values ($1, 'Inflated launch', current_date, '20:00', 'Rhodes Park', 300, 250) returning id`,
            [host]
          )
        ).rows[0].id,
      { commit: true }
    );
    expect(await eventCounts(db, id)).toEqual({ rsvp_count: 0, attended_count: 0 });
  });

  it('still lets RSVPs and passes move the going count', async () => {
    const evt = await makeEvent(db, host);
    await asUser(
      db,
      friend,
      (tx) => tx.query('insert into public.event_rsvps (event_id, user_id) values ($1, $2)', [evt, friend]),
      { commit: true }
    );
    expect((await eventCounts(db, evt)).rsvp_count).toBe(1);
    await order(db, guest, evt); // a pass puts its holder on the guest list
    expect((await eventCounts(db, evt)).rsvp_count).toBe(2);
    await asUser(
      db,
      friend,
      (tx) => tx.query('delete from public.event_rsvps where event_id = $1 and user_id = $2', [evt, friend]),
      { commit: true }
    );
    expect((await eventCounts(db, evt)).rsvp_count).toBe(1);
  });
});

describe('one free pass per person', () => {
  let db;
  let host;
  let guest;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    guest = await createUser(db, 'Guest');
  });

  it('returns the same pass when a holder claims a free event again', async () => {
    const evt = await makeEvent(db, host);
    const first = await order(db, guest, evt, 2);
    const firstCodes = (await ticketsOf(db, guest, evt)).map((t) => t.code);

    const second = await order(db, guest, evt, 1);
    expect(second.id).toBe(first.id);
    expect((await ticketsOf(db, guest, evt)).map((t) => t.code)).toEqual(firstCodes);
  });

  it('gives a holder their pass back even once the event is full', async () => {
    const evt = await makeEvent(db, host, { capacity: 1 });
    const first = await order(db, guest, evt);
    const again = await order(db, guest, evt);
    expect(again.id).toBe(first.id);
  });

  it('returns the earliest order to someone already holding duplicates from before', async () => {
    const evt = await makeEvent(db, host);
    const first = await order(db, guest, evt);
    // Simulate a second free order left over from before claims were idempotent.
    await db.query(
      `insert into public.orders (event_id, user_id, quantity, unit_price_ngwee, subtotal_ngwee,
                                  total_ngwee, status, method, paid_at, created_at)
       select event_id, user_id, 1, 0, 0, 0, 'paid', 'free', now(), created_at + interval '1 minute'
         from public.orders where id = $1`,
      [first.id]
    );
    const again = await order(db, guest, evt);
    expect(again.id).toBe(first.id);
  });

  it('still lets someone place more than one order for a paid event', async () => {
    const evt = await makeEvent(db, host, { price: 5000 });
    const a = await order(db, guest, evt, 1, 'mtn');
    const b = await order(db, guest, evt, 1, 'mtn');
    expect(a.status).toBe('pending');
    expect(b.id).not.toBe(a.id);
  });
});
