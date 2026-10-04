// @vitest-environment node
// What the broken guards allowed before 20261004000100 is cleaned up when it is
// applied, and the new guards hold for admins as well as everyone else.
import { describe, expect, it } from 'vitest';
import { applyMigrations, asUser, createDb, createUser } from './harness.js';
import { makeEvent } from './fixtures.js';

const ATTENDANCE_MIGRATION = '20261004000100_attendance_and_passes.sql';

const rsvpFlags = async (db, eventId, userId) =>
  (
    await db.query(
      'select show_publicly, featured_by_host from public.event_rsvps where event_id = $1 and user_id = $2',
      [eventId, userId]
    )
  ).rows[0];

describe('applying the attendance migration to existing data', () => {
  it('recounts forged going counts and withdraws every public listing', async () => {
    const db = await createDb({ upTo: ATTENDANCE_MIGRATION });
    const host = await createUser(db, 'Host');
    const guest = await createUser(db, 'Guest');
    const evt = await makeEvent(db, host);
    await db.query('insert into public.event_rsvps (event_id, user_id) values ($1, $2)', [evt, guest]);

    // What the old, broken guards let through.
    await asUser(
      db,
      host,
      (tx) => tx.query('update public.events set rsvp_count = 500 where id = $1', [evt]),
      { commit: true }
    );
    await asUser(
      db,
      host,
      (tx) =>
        tx.query(
          'update public.event_rsvps set show_publicly = true, featured_by_host = true where event_id = $1',
          [evt]
        ),
      { commit: true }
    );
    expect((await db.query('select rsvp_count from public.events where id = $1', [evt])).rows[0].rsvp_count).toBe(500);
    expect(await rsvpFlags(db, evt, guest)).toEqual({ show_publicly: true, featured_by_host: true });

    await applyMigrations(db, { from: ATTENDANCE_MIGRATION });

    expect((await db.query('select rsvp_count from public.events where id = $1', [evt])).rows[0].rsvp_count).toBe(1);
    expect(await rsvpFlags(db, evt, guest)).toEqual({ show_publicly: false, featured_by_host: false });
  });
});

describe('admins and the guards', () => {
  it('holds an admin who hosts to the same rules as any host', async () => {
    const db = await createDb();
    const admin = await createUser(db, 'Admin host');
    const guest = await createUser(db, 'Guest');
    await db.query('update public.account_private set is_admin = true where user_id = $1', [admin]);
    const evt = await makeEvent(db, admin);
    await db.query('insert into public.event_rsvps (event_id, user_id) values ($1, $2)', [evt, guest]);

    await asUser(
      db,
      admin,
      (tx) => tx.query('update public.events set rsvp_count = 999, attended_count = 999 where id = $1', [evt]),
      { commit: true }
    );
    const { rows } = await db.query('select rsvp_count, attended_count from public.events where id = $1', [evt]);
    expect(rows[0]).toEqual({ rsvp_count: 1, attended_count: 0 });

    await asUser(
      db,
      admin,
      (tx) => tx.query('update public.event_rsvps set show_publicly = true where event_id = $1', [evt]),
      { commit: true }
    );
    expect((await rsvpFlags(db, evt, guest)).show_publicly).toBe(false);
  });

  it('lets a featured admin leave public view like anyone else', async () => {
    const db = await createDb();
    const host = await createUser(db, 'Host');
    const admin = await createUser(db, 'Admin guest');
    await db.query('update public.account_private set is_admin = true where user_id = $1', [admin]);
    const evt = await makeEvent(db, host);
    await db.query('insert into public.event_rsvps (event_id, user_id) values ($1, $2)', [evt, admin]);

    const set = (actor, fields) =>
      asUser(
        db,
        actor,
        (tx) =>
          tx.query(
            `update public.event_rsvps set show_publicly = coalesce($3, show_publicly),
                    featured_by_host = coalesce($4, featured_by_host)
              where event_id = $1 and user_id = $2`,
            [evt, admin, fields.show ?? null, fields.featured ?? null]
          ),
        { commit: true }
      );

    await set(admin, { show: true });
    await set(host, { featured: true });
    await set(admin, { show: false });
    expect(await rsvpFlags(db, evt, admin)).toEqual({ show_publicly: false, featured_by_host: false });
  });
});
