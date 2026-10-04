// @vitest-environment node
// The public "Attending this event" list is double-gated: the attendee opts in
// and the host features them. Neither side may set the other's flag, and an
// attendee must always be able to take themselves back out of public view.
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDb, createUser } from './harness.js';
import { makeEvent } from './fixtures.js';

const rsvp = async (db, eventId, userId) =>
  (
    await db.query(
      'select show_publicly, featured_by_host from public.event_rsvps where event_id = $1 and user_id = $2',
      [eventId, userId]
    )
  ).rows[0];

const update = (db, actor, eventId, userId, fields) =>
  asUser(
    db,
    actor,
    (tx) =>
      tx.query(
        `update public.event_rsvps
            set show_publicly = coalesce($3, show_publicly),
                featured_by_host = coalesce($4, featured_by_host)
          where event_id = $1 and user_id = $2`,
        [eventId, userId, fields.show ?? null, fields.featured ?? null]
      ),
    { commit: true }
  );

describe('attendee visibility', () => {
  let db;
  let host;
  let guest;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    guest = await createUser(db, 'Guest');
  });

  const joined = async () => {
    const evt = await makeEvent(db, host);
    await db.query('insert into public.event_rsvps (event_id, user_id) values ($1, $2)', [evt, guest]);
    return evt;
  };

  it('does not let an attendee feature themselves', async () => {
    const evt = await joined();
    await update(db, guest, evt, guest, { show: true, featured: true });
    expect(await rsvp(db, evt, guest)).toEqual({ show_publicly: true, featured_by_host: false });
  });

  it('does not let a host opt an attendee in', async () => {
    const evt = await joined();
    await update(db, host, evt, guest, { show: true });
    expect((await rsvp(db, evt, guest)).show_publicly).toBe(false);
  });

  it('lets a host feature someone who opted in', async () => {
    const evt = await joined();
    await update(db, guest, evt, guest, { show: true });
    await update(db, host, evt, guest, { featured: true });
    expect(await rsvp(db, evt, guest)).toEqual({ show_publicly: true, featured_by_host: true });
  });

  it('lets a featured attendee take themselves out of public view', async () => {
    const evt = await joined();
    await update(db, guest, evt, guest, { show: true });
    await update(db, host, evt, guest, { featured: true });
    await update(db, guest, evt, guest, { show: false });
    expect(await rsvp(db, evt, guest)).toEqual({ show_publicly: false, featured_by_host: false });
  });
});
