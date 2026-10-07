import { describe, expect, it, vi } from 'vitest';
import { BridgeError, type BridgeClient } from '../_shared/bridge.ts';
import { GIVE_UP_AFTER_MS, handleUnihairLink, type LinkStore } from './handler.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-10-07T10:00:00Z');

function setup({ linked = true, pamp = 100, unihair = 500, value = 10 } = {}) {
  const transfers: { ref: string; points: number; createdAt: string; status: string }[] = [];
  let wallet = pamp;
  let link = linked ? { unihairProfileId: PROFILE, unihairName: 'Mwila' } : null;
  const store = {
    getLink: vi.fn(async () => link),
    link: vi.fn(async (_u: string, profileId: string, name: string) => {
      link = { unihairProfileId: profileId, unihairName: name };
    }),
    unlink: vi.fn(async () => {
      link = null;
    }),
    balance: vi.fn(async () => wallet),
    pointValue: vi.fn(async () => 10),
    beginTransfer: vi.fn(async (_u: string, points: number) => {
      const t = { ref: `ref-${transfers.length + 1}`, points, createdAt: new Date(NOW).toISOString(), status: 'pending' };
      transfers.push(t);
      return t;
    }),
    finishTransfer: vi.fn(async (ref: string, taken: boolean) => {
      const t = transfers.find((x) => x.ref === ref)!;
      if (t.status === 'pending') {
        t.status = taken ? 'done' : 'failed';
        if (taken) wallet += t.points;
      }
      return wallet;
    }),
    pendingTransfers: vi.fn(async () => transfers.filter((t) => t.status === 'pending')),
  } satisfies LinkStore;
  const bridge = {
    claim: vi.fn(async () => ({ profileId: PROFILE, name: 'Mwila' })),
    // Usable points: here everything held, unless a test says otherwise.
    balance: vi.fn(async () => ({ balance: unihair + 50, transferable: unihair, pointValueNgwee: value })),
    take: vi.fn(async ({ points }: { points: number }) => unihair - points),
    check: vi.fn(async () => ({ taken: false, points: null })),
    unlink: vi.fn(async () => {}),
  } satisfies BridgeClient;
  return { store, bridge, transfers, wallet: () => wallet };
}

const call = (deps: ReturnType<typeof setup>, body: unknown, now = NOW) =>
  handleUnihairLink(
    new Request('https://pamp.test', { method: 'POST', body: JSON.stringify(body) }),
    { userId: USER, store: deps.store, bridge: deps.bridge, now: () => now }
  ).then(async (r) => ({ status: r.status, body: await r.json() }));

describe('linking', () => {
  it('links with a code UniHair accepts, however it is typed', async () => {
    const deps = setup({ linked: false });
    const r = await call(deps, { action: 'link', code: 'k7qx-4m2p' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ linked: true, name: 'Mwila', unihair: 500 });
    expect(deps.bridge.claim).toHaveBeenCalledWith({ code: 'K7QX4M2P', pampUser: USER });
    expect(deps.store.link).toHaveBeenCalledWith(USER, PROFILE, 'Mwila');
  });

  it('refuses a malformed code without asking UniHair', async () => {
    const deps = setup({ linked: false });
    const r = await call(deps, { action: 'link', code: '123456' });
    expect(r.status).toBe(400);
    expect(deps.bridge.claim).not.toHaveBeenCalled();
  });

  it('passes on UniHair saying the code is wrong, or that there have been too many tries', async () => {
    for (const code of ['invalid_code', 'too_many_attempts']) {
      const deps = setup({ linked: false });
      deps.bridge.claim.mockRejectedValueOnce(new BridgeError(code, 409));
      const r = await call(deps, { action: 'link', code: 'K7QX4M2P' });
      expect(r.status).toBe(409);
      expect(r.body.error).toBe(code);
      expect(deps.store.link).not.toHaveBeenCalled();
    }
  });

  it('will not link a second UniHair account over the first', async () => {
    const deps = setup();
    const r = await call(deps, { action: 'link', code: 'K7QX4M2P' });
    expect(r.status).toBe(409);
    expect(deps.bridge.claim).not.toHaveBeenCalled();
  });
});

describe('pulling points into PAMP', () => {
  it('credits PAMP only after UniHair confirms the debit', async () => {
    const deps = setup();
    const r = await call(deps, { action: 'pull', points: 120 });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ moved: 120, pamp: 220, unihair: 380 });
    expect(deps.bridge.take).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: PROFILE, pampUser: USER, points: 120, ref: 'ref-1' })
    );
    expect(deps.transfers[0].status).toBe('done');
  });

  it('moves nothing when a point is worth different amounts in the two apps', async () => {
    const deps = setup({ value: 15 });
    const r = await call(deps, { action: 'pull', points: 50 });
    expect(r.body.error).toBe('rates_differ');
    expect(deps.store.beginTransfer).not.toHaveBeenCalled();
    expect(deps.bridge.take).not.toHaveBeenCalled();
  });

  it('moves nothing when UniHair does not hold enough', async () => {
    const deps = setup({ unihair: 40 });
    const r = await call(deps, { action: 'pull', points: 50 });
    expect(r.body.error).toBe('insufficient');
    expect(deps.bridge.take).not.toHaveBeenCalled();
  });

  it('marks the pull failed when UniHair refuses the debit', async () => {
    const deps = setup();
    deps.bridge.take.mockRejectedValueOnce(new BridgeError('daily_limit', 409));
    const r = await call(deps, { action: 'pull', points: 50 });
    expect(r.status).toBe(409);
    expect(deps.transfers[0].status).toBe('failed');
    expect(deps.wallet()).toBe(100);
  });

  it('leaves the pull open when UniHair does not answer, and settles it later', async () => {
    const deps = setup();
    deps.bridge.take.mockRejectedValueOnce(new BridgeError('unreachable', 503));
    expect((await call(deps, { action: 'pull', points: 50 })).status).toBe(502);
    expect(deps.transfers[0].status).toBe('pending');
    expect(deps.wallet()).toBe(100);

    // It turns out the debit went through: the next visit credits it, once.
    deps.bridge.check.mockResolvedValue({ taken: true, points: 50 });
    await call(deps, { action: 'status' });
    await call(deps, { action: 'status' });
    expect(deps.transfers[0].status).toBe('done');
    expect(deps.wallet()).toBe(150);
  });

  it('calls off an unanswered pull only once UniHair can no longer accept it', async () => {
    const deps = setup();
    deps.bridge.take.mockRejectedValueOnce(new BridgeError('unreachable', 503));
    await call(deps, { action: 'pull', points: 50 });

    await call(deps, { action: 'status' }, NOW + 60_000);
    expect(deps.transfers[0].status).toBe('pending');
    await call(deps, { action: 'status' }, NOW + GIVE_UP_AFTER_MS + 1);
    expect(deps.transfers[0].status).toBe('failed');
    expect(deps.wallet()).toBe(100);
  });

  it('refuses silly amounts and pulls for an unlinked account', async () => {
    for (const points of [0, -5, 1.5, '50', 100001]) {
      expect((await call(setup(), { action: 'pull', points })).status).toBe(400);
    }
    expect((await call(setup({ linked: false }), { action: 'pull', points: 5 })).body.error).toBe('not_linked');
  });
});

describe('status and unlinking', () => {
  it('shows both balances', async () => {
    const r = await call(setup(), { action: 'status' });
    expect(r.body).toEqual({ linked: true, name: 'Mwila', pamp: 100, unihair: 500 });
  });

  it('forgets a link that UniHair no longer has', async () => {
    const deps = setup();
    deps.bridge.balance.mockRejectedValueOnce(new BridgeError('not_linked', 409));
    const r = await call(deps, { action: 'status' });
    expect(r.body).toEqual({ linked: false, pamp: 100 });
    expect(deps.store.unlink).toHaveBeenCalled();
  });

  it('still shows PAMP points when UniHair is unreachable', async () => {
    const deps = setup();
    deps.bridge.balance.mockRejectedValueOnce(new BridgeError('unreachable', 503));
    expect((await call(deps, { action: 'status' })).body).toMatchObject({ linked: true, pamp: 100, unihair: null });
  });

  it('unlinks here even if UniHair cannot be told', async () => {
    const deps = setup();
    deps.bridge.unlink.mockRejectedValueOnce(new BridgeError('unreachable', 503));
    expect((await call(deps, { action: 'unlink' })).body).toEqual({ linked: false });
    expect(deps.store.unlink).toHaveBeenCalled();
  });
});
