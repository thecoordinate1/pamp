// @vitest-environment node
// A pass admits one person once: the scan uses it up for every copy of it.
// That is what lets a holder send passes to friends as private links.
import { beforeAll, describe, expect, it } from 'vitest';
import { asAnon, asUser, createDb, createUser } from './harness.js';
import { checkIn, eventCounts, makeEvent, order, ticketsOf } from './fixtures.js';

describe('shared, single-use passes', () => {
  let db;
  let host;
  let buyer;
  let stranger;
  let evt;
  let passes;

  const share = (code, as = buyer) =>
    asUser(db, as, async (tx) => (await tx.query('select public.share_pass($1) as t', [code])).rows[0].t, {
      commit: true,
    });
  const reclaim = (code, as = buyer) =>
    asUser(db, as, async (tx) => (await tx.query('select public.reclaim_pass($1) as c', [code])).rows[0].c, {
      commit: true,
    });
  const view = (token) =>
    asAnon(db, async (tx) => (await tx.query('select * from public.view_shared_pass($1)', [token])).rows);

  beforeAll(async () => {
    db = await createDb();
    host = await createUser(db, 'Host');
    buyer = await createUser(db, 'Mapalo');
    stranger = await createUser(db, 'Stranger');
    evt = await makeEvent(db, host, { name: 'Neon Nights' });
    await db.query(
      `insert into public.event_private (event_id, full_address, latitude, longitude)
       values ($1, 'Plot 12, Leopards Hill Road', -15.416789, 28.354321)`,
      [evt]
    );
    await order(db, buyer, evt, 3);
    passes = await ticketsOf(db, buyer, evt);
  });

  it('gives each pass its own private link, the same one every time', async () => {
    const token = await share(passes[0].code);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await share(passes[0].code)).toBe(token);
    expect(await share(passes[1].code)).not.toBe(token);
  });

  it('shows a signed-out friend the pass, who sent it and where to go', async () => {
    const [seen] = await view(await share(passes[0].code));
    expect(seen).toMatchObject({
      code: passes[0].code,
      status: 'valid',
      event_name: 'Neon Nights',
      from_name: 'Mapalo',
      full_address: 'Plot 12, Leopards Hill Road',
      latitude: -15.416789,
    });
  });

  it('shows nothing for an unknown, malformed or missing token', async () => {
    expect(await view('0'.repeat(64))).toEqual([]);
    expect(await view("x' or 1=1 --")).toEqual([]);
    expect(await view(null)).toEqual([]);
  });

  it('is used up by the first scan, for every copy of it', async () => {
    const token = await share(passes[1].code);
    expect((await checkIn(db, host, passes[1].code)).was_already_in).toBe(false);
    expect((await checkIn(db, host, passes[1].code)).was_already_in).toBe(true);
    expect((await eventCounts(db, evt)).attended_count).toBe(1);

    const [after] = await view(token);
    expect(after.status).toBe('checked_in');
    expect(after.checked_in_at).not.toBeNull();
    await expect(share(passes[1].code)).rejects.toThrow(/already been used/);
    await expect(reclaim(passes[1].code)).rejects.toThrow(/already been used/);
  });

  it('can be taken back: a new code, and the old link and QR stop working', async () => {
    const token = await share(passes[2].code);
    const fresh = await reclaim(passes[2].code);
    expect(fresh).not.toBe(passes[2].code);
    expect(await view(token)).toEqual([]);
    await expect(checkIn(db, host, passes[2].code)).rejects.toThrow(/No pass with that code/);
    expect((await checkIn(db, host, fresh)).was_already_in).toBe(false);
  });

  it('belongs to its holder alone', async () => {
    const [first] = await ticketsOf(db, buyer, evt);
    await expect(share(first.code, stranger)).rejects.toThrow(/No pass with that code/);
    await expect(reclaim(first.code, stranger)).rejects.toThrow(/No pass with that code/);
    await expect(asAnon(db, (tx) => tx.query('select public.share_pass($1)', [first.code]))).rejects.toThrow(
      /permission denied/
    );
    const visible = await asUser(db, stranger, async (tx) =>
      (await tx.query('select count(*)::int as n from public.tickets where share_token is not null')).rows[0].n
    );
    expect(visible).toBe(0);
  });
});
