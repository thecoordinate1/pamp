// @vitest-environment node
// The map's "Reveal locations" asks for the exact location of every event the
// person holds a pass to. The database decides which rows come back, so these
// tests pin down exactly who sees what.
import { beforeAll, describe, expect, it } from 'vitest';
import { asAnon, asUser, createDb, createUser } from './harness.js';
import { checkIn, makeEvent, order, ticketsOf } from './fixtures.js';

const setLocation = (db, eventId, lat, lng, address = 'Plot 12, Leopards Hill Road') =>
  db.query(
    `insert into public.event_private (event_id, full_address, latitude, longitude)
     values ($1, $2, $3, $4)
     on conflict (event_id) do update
       set full_address = excluded.full_address, latitude = excluded.latitude, longitude = excluded.longitude`,
    [eventId, address, lat, lng]
  );

// What the client's reveal query returns: exact rows for the asked-for events.
const reveal = (tx, eventIds) =>
  tx
    .query('select event_id, full_address, latitude, longitude from public.event_private where event_id = any($1::uuid[])', [
      eventIds,
    ])
    .then((r) => r.rows);

describe('revealing exact locations', () => {
  let db;
  let host;
  let holder;
  let stranger;
  let withPass;
  let withoutPass;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    holder = await createUser(db, 'Holder');
    stranger = await createUser(db, 'Stranger');
    withPass = await makeEvent(db, host, { name: 'Has a pass' });
    withoutPass = await makeEvent(db, host, { name: 'No pass' });
    await setLocation(db, withPass, -15.416789, 28.354321);
    await setLocation(db, withoutPass, -15.401234, 28.301234);
    await order(db, holder, withPass);
  });

  it('keeps only a rounded neighbourhood point on the public event', async () => {
    const { rows } = await asAnon(db, (tx) =>
      tx.query('select area_latitude, area_longitude from public.events where id = $1', [withPass])
    );
    expect(rows[0]).toEqual({ area_latitude: -15.42, area_longitude: 28.35 });
  });

  it('shows a pass holder the exact location of that event and no other', async () => {
    const rows = await asUser(db, holder, (tx) => reveal(tx, [withPass, withoutPass]));
    expect(rows).toEqual([
      { event_id: withPass, full_address: 'Plot 12, Leopards Hill Road', latitude: -15.416789, longitude: 28.354321 },
    ]);
  });

  it('still shows it after the pass has been used at the door', async () => {
    const [pass] = await ticketsOf(db, holder, withPass);
    await checkIn(db, host, pass.code);
    const rows = await asUser(db, holder, (tx) => reveal(tx, [withPass]));
    expect(rows).toHaveLength(1);
  });

  it('shows nothing to someone without a pass, or to a signed-out visitor', async () => {
    expect(await asUser(db, stranger, (tx) => reveal(tx, [withPass, withoutPass]))).toEqual([]);
    expect(await asAnon(db, (tx) => reveal(tx, [withPass, withoutPass]).catch(() => []))).toEqual([]);
  });

  it('lets the host see and move their own event’s location', async () => {
    const rows = await asUser(db, host, (tx) => reveal(tx, [withPass, withoutPass]));
    expect(rows).toHaveLength(2);
    await asUser(
      db,
      host,
      (tx) =>
        tx.query('update public.event_private set latitude = $2, longitude = $3 where event_id = $1', [
          withoutPass,
          -15.389,
          28.3221,
        ]),
      { commit: true }
    );
    const { rows: moved } = await db.query('select area_latitude, area_longitude from public.events where id = $1', [
      withoutPass,
    ]);
    expect(moved[0]).toEqual({ area_latitude: -15.39, area_longitude: 28.32 });
  });

  it('does not let a stranger set or move a location', async () => {
    await asUser(
      db,
      stranger,
      (tx) => tx.query('update public.event_private set latitude = 0, longitude = 0 where event_id = $1', [withPass]),
      { commit: true }
    );
    const { rows } = await db.query('select latitude from public.event_private where event_id = $1', [withPass]);
    expect(rows[0].latitude).toBe(-15.416789);
    await expect(
      asUser(db, stranger, (tx) =>
        tx.query(`insert into public.event_private (event_id, full_address) values ($1, 'fake')`, [withoutPass])
      )
    ).rejects.toThrow(/row-level security|duplicate key/);
  });
});
