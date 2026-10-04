// @vitest-environment node
// Every account has one referral code for life, and a sign-up that arrives
// through someone's invite link is credited to them by the database itself.
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, asUser, createDb, createUser, scalar } from './harness.js';
import { makeEvent } from './fixtures.js';

const REFERRALS_MIGRATION = '20261004000200_referrals.sql';
const CODE_FORMAT = /^[A-HJ-NP-Z2-9]{8}$/;

const codeOf = (db, userId) =>
  scalar(db, 'select referral_code from public.account_private where user_id = $1', [userId]);

const referralOf = async (db, userId) =>
  (
    await db.query('select referrer_id, code, event_id from public.referrals where referred_id = $1', [userId])
  ).rows[0];

describe('referral codes', () => {
  it('gives accounts that existed before the change a code of their own', async () => {
    const db = await createDb({ upTo: REFERRALS_MIGRATION });
    const early = await createUser(db, 'Early adopter');
    const second = await createUser(db, 'Second');
    await applyMigrations(db, { from: REFERRALS_MIGRATION });

    const a = await codeOf(db, early);
    const b = await codeOf(db, second);
    expect(a).toMatch(CODE_FORMAT);
    expect(b).toMatch(CODE_FORMAT);
    expect(a).not.toBe(b);
  });

  describe('for new accounts', () => {
    let db;
    beforeAll(async () => {
      db = await createDb();
    });

    it('issues a different, readable code to every account', async () => {
      const ids = [];
      for (let i = 0; i < 40; i += 1) ids.push(await createUser(db, `Person ${i}`));
      const codes = await Promise.all(ids.map((id) => codeOf(db, id)));
      codes.forEach((c) => expect(c).toMatch(CODE_FORMAT));
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('lets a person read their own code and nobody else’s', async () => {
      const me = await createUser(db, 'Me');
      const other = await createUser(db, 'Other');
      const mine = await asUser(db, me, (tx) =>
        scalar(tx, 'select referral_code from public.account_private where user_id = $1', [me])
      );
      expect(mine).toBe(await codeOf(db, me));
      const theirs = await asUser(db, me, (tx) =>
        scalar(tx, 'select count(*)::int from public.account_private where user_id = $1', [other])
      );
      expect(theirs).toBe(0);
    });

    it('keeps a code fixed, so links already shared keep working', async () => {
      const me = await createUser(db, 'Fixed');
      const before = await codeOf(db, me);
      await asUser(
        db,
        me,
        (tx) =>
          tx.query(`update public.account_private set referral_code = 'VANITY22' where user_id = $1`, [me]),
        { commit: true }
      );
      expect(await codeOf(db, me)).toBe(before);
    });
  });
});

describe('referral attribution', () => {
  let db;
  let sharer;
  let sharerCode;
  let event;

  beforeAll(async () => {
    db = await createDb();
    sharer = await createUser(db, 'Sharer');
    sharerCode = await codeOf(db, sharer);
    event = await makeEvent(db, sharer);
  });

  it('credits the sharer, and the event they shared, when someone signs up through it', async () => {
    const joiner = await createUser(db, 'Joiner', { referral_code: sharerCode, referral_event: event });
    expect(await referralOf(db, joiner)).toEqual({ referrer_id: sharer, code: sharerCode, event_id: event });
  });

  it('accepts a code typed in lower case or with stray spaces', async () => {
    const joiner = await createUser(db, 'Typist', { referral_code: `  ${sharerCode.toLowerCase()} ` });
    expect((await referralOf(db, joiner))?.referrer_id).toBe(sharer);
  });

  it('never blocks a sign-up over a bad code or event', async () => {
    const unknown = await createUser(db, 'Unknown code', { referral_code: 'ZZZZZZZZ' });
    const garbage = await createUser(db, 'Garbage', { referral_code: "x'; drop table--", referral_event: 'nope' });
    const badEvent = await createUser(db, 'Bad event', { referral_code: sharerCode, referral_event: 'not-a-uuid' });
    const goneEvent = await createUser(db, 'Gone event', {
      referral_code: sharerCode,
      referral_event: '00000000-0000-4000-9000-000000000999',
    });

    for (const id of [unknown, garbage, badEvent, goneEvent]) {
      expect(await scalar(db, 'select count(*)::int from public.profiles where id = $1', [id])).toBe(1);
    }
    expect(await referralOf(db, unknown)).toBeUndefined();
    expect(await referralOf(db, garbage)).toBeUndefined();
    // A real code still counts when only the event is unusable.
    expect(await referralOf(db, badEvent)).toEqual({ referrer_id: sharer, code: sharerCode, event_id: null });
    expect(await referralOf(db, goneEvent)).toEqual({ referrer_id: sharer, code: sharerCode, event_id: null });
  });

  it('shows a referrer who joined through them, and nobody else', async () => {
    const joiner = await createUser(db, 'Visible joiner', { referral_code: sharerCode });
    const mine = await asUser(db, sharer, (tx) =>
      scalar(tx, 'select count(*)::int from public.referrals where referred_id = $1', [joiner])
    );
    expect(mine).toBe(1);
    const stranger = await createUser(db, 'Stranger');
    const theirs = await asUser(db, stranger, (tx) =>
      scalar(tx, 'select count(*)::int from public.referrals where referred_id = $1', [joiner])
    );
    expect(theirs).toBe(0);
  });

  it('cannot be written or rewritten from the browser', async () => {
    const outsider = await createUser(db, 'Outsider');
    await expect(
      asUser(db, outsider, (tx) =>
        tx.query('insert into public.referrals (referred_id, referrer_id, code) values ($1, $2, $3)', [
          outsider,
          sharer,
          sharerCode,
        ])
      )
    ).rejects.toThrow(/permission denied/);

    const joiner = await createUser(db, 'Settled joiner', { referral_code: sharerCode });
    await expect(
      asUser(db, sharer, (tx) =>
        tx.query('update public.referrals set event_id = null where referred_id = $1', [joiner])
      )
    ).rejects.toThrow(/permission denied/);
  });
});
