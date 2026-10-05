// @vitest-environment node
// Profile pictures, @usernames and the verified badge: who can see a picture,
// who can vouch for it, and that nobody can vouch for themselves.
import { beforeAll, describe, expect, it } from 'vitest';
import { asAnon, asUser, createDb, createUser, scalar } from './harness.js';
import { makeEvent } from './fixtures.js';

const canRead = (tx, path) =>
  tx
    .query(`select count(*)::int as n from storage.objects where bucket_id = 'selfies' and name = $1`, [path])
    .then((r) => r.rows[0].n === 1);

const setAvatar = (db, userId, path) =>
  asUser(db, userId, (tx) => tx.query('update public.profiles set avatar_path = $2 where id = $1', [userId, path]), {
    commit: true,
  });

const putPhoto = (db, path) =>
  db.query(`insert into storage.objects (bucket_id, name) values ('selfies', $1)`, [path]);

const makeAdmin = (db, userId) =>
  db.query('update public.account_private set is_admin = true where user_id = $1', [userId]);

describe('profile pictures', () => {
  let db;
  let host;
  let guest;
  let other;
  let stranger;
  let admin;
  let evt;
  let picture;
  let privateSelfie;

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    guest = await createUser(db, 'Guest');
    other = await createUser(db, 'Other Guest');
    stranger = await createUser(db, 'Stranger');
    admin = await createUser(db, 'Admin');
    await makeAdmin(db, admin);
    evt = await makeEvent(db, host);
    await db.query(
      `insert into public.event_rsvps (event_id, user_id, show_publicly) values ($1, $2, false), ($1, $3, true)`,
      [evt, guest, other]
    );

    picture = `${guest}/face.jpg`;
    privateSelfie = `${guest}/sent-to-another-host.jpg`;
    await putPhoto(db, picture);
    await putPhoto(db, privateSelfie);
    await setAvatar(db, guest, picture);
  });

  it('can only be a photo in the owner’s own folder', async () => {
    await expect(setAvatar(db, stranger, `${guest}/face.jpg`)).rejects.toThrow(/profiles_avatar_in_own_folder/);
    await expect(setAvatar(db, stranger, `${stranger}/../${guest}/face.jpg`)).rejects.toThrow(
      /profiles_avatar_in_own_folder/
    );
  });

  it('is seen by its owner, the host of an event they are going to, and admins', async () => {
    expect(await asUser(db, guest, (tx) => canRead(tx, picture))).toBe(true);
    expect(await asUser(db, host, (tx) => canRead(tx, picture))).toBe(true);
    expect(await asUser(db, admin, (tx) => canRead(tx, picture))).toBe(true);
  });

  it('is hidden from strangers, signed-out visitors and guests they have not chosen to show up for', async () => {
    expect(await asUser(db, stranger, (tx) => canRead(tx, picture))).toBe(false);
    expect(await asAnon(db, (tx) => canRead(tx, picture))).toBe(false);
    expect(await asUser(db, other, (tx) => canRead(tx, picture))).toBe(false);
  });

  it('is seen by other guests once its owner opts in to the list', async () => {
    await asUser(
      db,
      guest,
      (tx) => tx.query('update public.event_rsvps set show_publicly = true where event_id = $1 and user_id = $2', [evt, guest]),
      { commit: true }
    );
    try {
      expect(await asUser(db, other, (tx) => canRead(tx, picture))).toBe(true);
    } finally {
      await db.query('update public.event_rsvps set show_publicly = false where event_id = $1 and user_id = $2', [evt, guest]);
    }
  });

  it('becomes public when a host features its owner, while their other selfies stay private', async () => {
    await db.query(
      'update public.event_rsvps set show_publicly = true, featured_by_host = true where event_id = $1 and user_id = $2',
      [evt, guest]
    );
    try {
      expect(await asAnon(db, (tx) => canRead(tx, picture))).toBe(true);
      expect(await asAnon(db, (tx) => canRead(tx, privateSelfie))).toBe(false);
      expect(await asUser(db, stranger, (tx) => canRead(tx, privateSelfie))).toBe(false);
    } finally {
      await db.query(
        'update public.event_rsvps set show_publicly = false, featured_by_host = false where event_id = $1 and user_id = $2',
        [evt, guest]
      );
    }
  });
});

describe('the verified badge', () => {
  let db;
  let person;
  let admin;
  let photo;

  const badge = (userId) =>
    scalar(db, 'select identity_verified_at is not null from public.profiles where id = $1', [userId]);
  const queue = (userId) =>
    asUser(db, userId, (tx) => tx.query('select user_id, avatar_path from public.profiles_to_verify()').then((r) => r.rows));
  const review = (userId, target, path, matches) =>
    asUser(
      db,
      userId,
      (tx) =>
        tx
          .query('select public.review_profile_photo($1, $2, $3) as ok', [target, path, matches])
          .then((r) => r.rows[0].ok),
      { commit: true }
    );

  beforeAll(async () => {
    db = await createDb();
    person = await createUser(db, 'Mwila');
    admin = await createUser(db, 'Admin');
    await makeAdmin(db, admin);
    photo = `${person}/one.jpg`;
    await setAvatar(db, person, photo);
  });

  it('cannot be given to yourself', async () => {
    await asUser(
      db,
      person,
      (tx) => tx.query('update public.profiles set identity_verified_at = now() where id = $1', [person]),
      { commit: true }
    );
    expect(await badge(person)).toBe(false);
  });

  it('keeps the review queue and the decision to admins', async () => {
    await expect(queue(person)).rejects.toThrow(/Admins only/);
    await expect(review(person, person, photo, true)).rejects.toThrow(/Admins only/);
    await asUser(
      db,
      person,
      (tx) => tx.query('update public.account_private set avatar_reviewed_path = $2 where user_id = $1', [person, photo]),
      { commit: true }
    );
    expect(await queue(admin)).toContainEqual({ user_id: person, avatar_path: photo });
  });

  it('is given by an admin for the photo they saw, which then leaves the queue', async () => {
    expect(await review(admin, person, photo, true)).toBe(true);
    expect(await badge(person)).toBe(true);
    expect((await queue(admin)).map((r) => r.user_id)).not.toContain(person);
  });

  it('comes off with a new photo, which goes back in the queue', async () => {
    const next = `${person}/two.jpg`;
    await setAvatar(db, person, next);
    expect(await badge(person)).toBe(false);
    expect(await queue(admin)).toContainEqual({ user_id: person, avatar_path: next });

    // The admin answers for the old photo: nothing changes.
    expect(await review(admin, person, photo, true)).toBe(false);
    expect(await badge(person)).toBe(false);

    // Not a match: no badge, and out of the queue until the photo changes again.
    expect(await review(admin, person, next, false)).toBe(true);
    expect(await badge(person)).toBe(false);
    expect((await queue(admin)).map((r) => r.user_id)).not.toContain(person);
  });
});

describe('usernames', () => {
  let db;
  let mwila;
  let chanda;

  const setUsername = (userId, name) =>
    asUser(db, userId, (tx) => tx.query('update public.profiles set username = $2 where id = $1', [userId, name]), {
      commit: true,
    });
  const available = (userId, name) =>
    asUser(db, userId, (tx) =>
      tx.query('select public.username_available($1) as ok', [name]).then((r) => r.rows[0].ok)
    );

  beforeAll(async () => {
    db = await createDb();
    mwila = await createUser(db, 'Mwila');
    chanda = await createUser(db, 'Chanda');
  });

  it('accepts lower-case letters, numbers, underscores and single dots', async () => {
    await setUsername(mwila, 'mwila.k_95');
    expect(await scalar(db, 'select username from public.profiles where id = $1', [mwila])).toBe('mwila.k_95');
  });

  it('refuses names that are malformed, or could pass for PAMP, UniHair or staff', async () => {
    for (const bad of ['Mwila', 'mw', 'a'.repeat(21), '.mwila', 'mwila.', 'mw..ila', 'mw ila', 'pamp_official', 'unihair', 'admin']) {
      await expect(setUsername(chanda, bad), bad).rejects.toThrow(/profiles_username_valid/);
    }
  });

  it('gives each name to one person', async () => {
    await expect(setUsername(chanda, 'mwila.k_95')).rejects.toThrow(/profiles_username_key/);
  });

  it('says whether a name is free, counting your own as free', async () => {
    expect(await available(chanda, 'mwila.k_95')).toBe(false);
    expect(await available(chanda, 'MWILA.K_95')).toBe(false);
    expect(await available(mwila, 'mwila.k_95')).toBe(true);
    expect(await available(chanda, 'chanda')).toBe(true);
    expect(await available(chanda, 'pamp')).toBe(false);
  });
});
