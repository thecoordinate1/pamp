// @vitest-environment node
// Who can see whom around an event: guests appear to other guests only once
// they opt in, while a host sees everyone attending or asking to join,
// including the selfie sent with a request.
import { beforeAll, describe, expect, it } from 'vitest';
import { asAnon, asUser, createDb, createUser } from './harness.js';
import { makeEvent } from './fixtures.js';

const visibleGuests = (tx, eventId) =>
  tx
    .query(
      `select r.user_id, p.display_name
         from public.event_rsvps r
         left join public.profiles p on p.id = r.user_id
        where r.event_id = $1`,
      [eventId]
    )
    .then((res) => res.rows);

const profileName = (tx, userId) =>
  tx.query('select display_name from public.profiles where id = $1', [userId]).then((r) => r.rows[0]?.display_name);

const canReadObject = (tx, path) =>
  tx
    .query(`select count(*)::int as n from storage.objects where bucket_id = 'selfies' and name = $1`, [path])
    .then((r) => r.rows[0].n === 1);

describe('guests at the same event', () => {
  let db;
  let host;
  let shy;
  let open;
  let evt;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    shy = await createUser(db, 'Shy Guest');
    open = await createUser(db, 'Open Guest');
    evt = await makeEvent(db, host);
    await db.query(
      `insert into public.event_rsvps (event_id, user_id, show_publicly) values ($1, $2, false), ($1, $3, true)`,
      [evt, shy, open]
    );
  });

  it('do not see someone who has not opted in, or their profile', async () => {
    const seen = await asUser(db, open, (tx) => visibleGuests(tx, evt));
    expect(seen.map((r) => r.user_id)).not.toContain(shy);
    expect(await asUser(db, open, (tx) => profileName(tx, shy))).toBeUndefined();
  });

  it('see someone who has opted in, with their profile', async () => {
    const seen = await asUser(db, shy, (tx) => visibleGuests(tx, evt));
    expect(seen).toContainEqual({ user_id: open, display_name: 'Open Guest' });
  });

  it('always see themselves', async () => {
    const seen = await asUser(db, shy, (tx) => visibleGuests(tx, evt));
    expect(seen.map((r) => r.user_id)).toContain(shy);
  });

  it('leave the host seeing everyone, opted in or not', async () => {
    const seen = await asUser(db, host, (tx) => visibleGuests(tx, evt));
    expect(seen).toEqual(
      expect.arrayContaining([
        { user_id: shy, display_name: 'Shy Guest' },
        { user_id: open, display_name: 'Open Guest' },
      ])
    );
  });

  it('show signed-out visitors nobody who has not been featured', async () => {
    expect(await asAnon(db, (tx) => visibleGuests(tx, evt))).toEqual([]);
  });
});

describe('requests to join', () => {
  let db;
  let host;
  let asker;
  let stranger;
  let evt;
  const selfie = (userId) => `${userId}/selfie.jpg`;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    asker = await createUser(db, 'Chanda Requester');
    stranger = await createUser(db, 'Stranger');
    evt = await makeEvent(db, host);
    await asUser(
      db,
      asker,
      (tx) =>
        tx.query(
          `insert into public.guest_requests (event_id, user_id, reason, selfie_path) values ($1, $2, 'hi', $3)`,
          [evt, asker, selfie(asker)]
        ),
      { commit: true }
    );
    await db.query(`insert into storage.objects (bucket_id, name, owner) values ('selfies', $1, $2), ('selfies', $3, $4)`, [
      selfie(asker),
      asker,
      selfie(stranger),
      stranger,
    ]);
  });

  it('show the host who is asking, by name', async () => {
    const { rows } = await asUser(db, host, (tx) =>
      tx.query(
        `select p.display_name from public.guest_requests g left join public.profiles p on p.id = g.user_id
          where g.event_id = $1`,
        [evt]
      )
    );
    expect(rows).toEqual([{ display_name: 'Chanda Requester' }]);
  });

  it('let the host see the selfie sent with the request', async () => {
    expect(await asUser(db, host, (tx) => canReadObject(tx, selfie(asker)))).toBe(true);
  });

  it('let the person asking see who the host is', async () => {
    expect(await asUser(db, asker, (tx) => profileName(tx, host))).toBe('Host');
  });

  it('keep the selfie from anyone else', async () => {
    expect(await asUser(db, stranger, (tx) => canReadObject(tx, selfie(asker)))).toBe(false);
  });

  it('cannot be used to show a host someone else’s photo', async () => {
    // The host asks to join their own event, pointing the request at the
    // stranger's selfie. The path is not in the requester's own folder.
    await asUser(
      db,
      host,
      (tx) =>
        tx.query(
          `insert into public.guest_requests (event_id, user_id, reason, selfie_path) values ($1, $2, 'x', $3)`,
          [evt, host, selfie(stranger)]
        ),
      { commit: true }
    );
    expect(await asUser(db, host, (tx) => canReadObject(tx, selfie(stranger)))).toBe(false);
  });
});
