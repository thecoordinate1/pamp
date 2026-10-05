// @vitest-environment node
// Meet your people: who can see whose card, and how a match is made.
import { beforeAll, describe, expect, it } from 'vitest';
import { asAnon, asUser, createDb, createUser } from './harness.js';
import { makeEvent, order } from './fixtures.js';

const setMeet = (db, userId, visible, intents = ['friendship']) =>
  asUser(
    db,
    userId,
    (tx) =>
      tx.query(
        `insert into public.meet_settings (user_id, visible, intents) values ($1, $2, $3)
         on conflict (user_id) do update set visible = excluded.visible, intents = excluded.intents`,
        [userId, visible, intents]
      ),
    { commit: true }
  );

const deck = (db, userId, eventId) =>
  asUser(db, userId, (tx) => tx.query('select * from public.meet_deck($1)', [eventId]).then((r) => r.rows));

const swipe = (db, userId, targetId, eventId, direction) =>
  asUser(
    db,
    userId,
    (tx) =>
      tx
        .query('select * from public.record_swipe($1, $2, $3)', [targetId, eventId, direction])
        .then((r) => r.rows[0]),
    { commit: true }
  );

const matchesOf = (db, userId) =>
  asUser(db, userId, (tx) => tx.query('select * from public.my_matches()').then((r) => r.rows));

describe('meet your people', () => {
  let db;
  let evt;
  let ana;
  let ben;
  let cleo; // has a pass, Meet off
  let dan; // has a pass, Meet on, blocked Ana
  let eve; // Meet on, no pass
  let fay;

  const canSeePicture = (userId, path) =>
    asUser(db, userId, (tx) =>
      tx
        .query(`select count(*)::int as n from storage.objects where bucket_id = 'selfies' and name = $1`, [path])
        .then((r) => r.rows[0].n === 1)
    );

  const setPicture = async (userId) => {
    const path = `${userId}/face.jpg`;
    await db.query('update public.profiles set avatar_path = $1 where id = $2', [path, userId]);
    await db.query(`insert into storage.objects (bucket_id, name, owner) values ('selfies', $1, $2)`, [path, userId]);
    return path;
  };

  beforeAll(async () => {
    db = await createDb();
    const host = await createUser(db, 'Host');
    ana = await createUser(db, 'Ana');
    ben = await createUser(db, 'Ben');
    cleo = await createUser(db, 'Cleo');
    dan = await createUser(db, 'Dan');
    eve = await createUser(db, 'Eve');
    fay = await createUser(db, 'Fay');
    evt = await makeEvent(db, host);
    for (const u of [ana, ben, cleo, dan, fay]) await order(db, u, evt);
    for (const u of [ana, ben, dan, eve, fay]) await setMeet(db, u, true);
    await db.query(
      `update public.profiles set social_platform = 'instagram',
         social_handle = case id when $1 then 'ana.zm' when $2 then 'ben.zm' end
       where id in ($1, $2)`,
      [ana, ben]
    );
    await db.query(
      `update public.account_private set birth_date = current_date - interval '25 years 3 days' where user_id = $1`,
      [ben]
    );
    await db.query('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [dan, ana]);
  });

  it('keeps each person’s settings to themselves', async () => {
    const own = await asUser(db, ana, (tx) => tx.query('select user_id from public.meet_settings').then((r) => r.rows));
    expect(own).toEqual([{ user_id: ana }]);
    await expect(asAnon(db, (tx) => tx.query('select * from public.meet_settings'))).rejects.toThrow(/permission denied/);
  });

  it('opens the deck only to people with Meet on and a pass', async () => {
    await expect(deck(db, cleo, evt)).rejects.toThrow(/Turn on Meet/);
    await expect(deck(db, eve, evt)).rejects.toThrow(/need a pass/);
    await expect(asAnon(db, (tx) => tx.query('select * from public.meet_deck($1)', [evt]))).rejects.toThrow(
      /permission denied/
    );
  });

  it('deals people at the event with Meet on, with an age but no handle', async () => {
    const cards = await deck(db, ana, evt);
    expect(cards.map((c) => c.id).sort()).toEqual([ben, fay].sort());
    const card = cards.find((c) => c.id === ben);
    expect(card).toMatchObject({ display_name: 'Ben', age: 25, intents: ['friendship'] });
    expect(card).not.toHaveProperty('social_handle');
    expect(card).not.toHaveProperty('birth_date');
  });

  it('refuses swipes on anyone the deck would not show', async () => {
    for (const target of [ana, cleo, dan, eve]) {
      await expect(swipe(db, ana, target, evt, 'like')).rejects.toThrow(/not in your deck/);
    }
  });

  it('cannot be written to directly', async () => {
    await expect(
      asUser(db, ana, (tx) =>
        tx.query(`insert into public.swipes (swiper_id, target_id, event_id, direction) values ($1, $2, $3, 'like')`, [
          ana,
          ben,
          evt,
        ])
      )
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, ana, (tx) =>
        tx.query(
          `insert into public.matches (user_a, user_b, event_id)
           values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $3)`,
          [ana, ben, evt]
        )
      )
    ).rejects.toThrow(/permission denied/);
  });

  it('shows a card’s picture to people who can see the card, and nobody else', async () => {
    const path = await setPicture(fay);
    expect(await canSeePicture(ana, path)).toBe(true);
    expect(await canSeePicture(eve, path)).toBe(false);
    await expect(asAnon(db, (tx) => tx.query('select public.can_view_meet_avatar($1)', [path]))).rejects.toThrow(
      /permission denied/
    );
  });

  it('matches two people who like each other, and only then shares handles', async () => {
    const first = await swipe(db, ana, ben, evt, 'like');
    expect(first).toMatchObject({ matched: false, social_handle: null });
    expect(await matchesOf(db, ben)).toEqual([]);

    const second = await swipe(db, ben, ana, evt, 'like');
    expect(second).toMatchObject({ matched: true, display_name: 'Ana', social_handle: 'ana.zm' });

    expect(await matchesOf(db, ana)).toMatchObject([{ user_id: ben, display_name: 'Ben', social_handle: 'ben.zm' }]);
    expect(await matchesOf(db, ben)).toMatchObject([{ user_id: ana, social_handle: 'ana.zm' }]);
    expect((await deck(db, ana, evt)).map((c) => c.id)).not.toContain(ben);
  });

  it('never turns an earlier pass into a match', async () => {
    await swipe(db, fay, ben, evt, 'pass');
    await swipe(db, ben, fay, evt, 'like');
    expect(await swipe(db, fay, ben, evt, 'like')).toMatchObject({ matched: false });
    expect(await matchesOf(db, fay)).toEqual([]);
  });

  it('keeps swipes and matches from anyone else', async () => {
    const matches = await asUser(db, fay, (tx) => tx.query('select * from public.matches').then((r) => r.rows));
    expect(matches).toEqual([]);
    const swipes = await asUser(db, fay, (tx) => tx.query('select swiper_id from public.swipes').then((r) => r.rows));
    expect(swipes.every((s) => s.swiper_id === fay)).toBe(true);
  });

  it('keeps a match’s picture visible after Meet is turned off, but nobody else’s', async () => {
    const path = await setPicture(ben);
    await setMeet(db, ben, false);
    expect(await canSeePicture(ana, path)).toBe(true);
    expect(await canSeePicture(fay, path)).toBe(false);
  });

  it('hides a match once either person blocks the other', async () => {
    await db.query('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [ben, ana]);
    expect(await matchesOf(db, ana)).toEqual([]);
    expect(await canSeePicture(ana, `${ben}/face.jpg`)).toBe(false);
  });
});
