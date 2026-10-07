import { describe, expect, it, vi } from 'vitest';
import {
  BridgeError,
  SIGNATURE_HEADER,
  createBridgeClient,
  isRefusal,
  normaliseLinkCode,
  signBridgeRequest,
  verifyBridgeRequest,
} from './bridge.ts';

const SECRET = 'a-test-secret-that-is-at-least-32-chars';
const NOW = 1_790_000_000;

describe('bridge signatures', () => {
  it('accepts a request signed with the secret, for exactly that body', async () => {
    const body = JSON.stringify({ action: 'take', points: 50 });
    const header = await signBridgeRequest(body, SECRET, NOW);
    expect(await verifyBridgeRequest(body, header, SECRET, NOW + 10)).toBe(true);
    // One changed character in the body.
    expect(await verifyBridgeRequest(body.replace('50', '5000'), header, SECRET, NOW)).toBe(false);
  });

  it('refuses another secret, an old or future timestamp, and junk', async () => {
    const body = '{}';
    const header = await signBridgeRequest(body, SECRET, NOW);
    expect(await verifyBridgeRequest(body, header, `${SECRET}x`, NOW)).toBe(false);
    expect(await verifyBridgeRequest(body, header, SECRET, NOW + 301)).toBe(false);
    expect(await verifyBridgeRequest(body, header, SECRET, NOW - 301)).toBe(false);
    for (const bad of [null, '', 't=abc,v1=00', `v1=${'0'.repeat(64)}`, 'garbage']) {
      expect(await verifyBridgeRequest(body, bad, SECRET, NOW)).toBe(false);
    }
  });

  it('refuses everything when the secret is missing or short', async () => {
    const header = await signBridgeRequest('{}', 'short', NOW);
    expect(await verifyBridgeRequest('{}', header, 'short', NOW)).toBe(false);
    expect(await verifyBridgeRequest('{}', header, '', NOW)).toBe(false);
  });
});

describe('normaliseLinkCode', () => {
  it('takes the code however it is typed', () => {
    expect(normaliseLinkCode('k7qx-4m2p')).toBe('K7QX4M2P');
    expect(normaliseLinkCode(' K7QX 4M2P ')).toBe('K7QX4M2P');
  });

  it('refuses codes of the wrong length or with look-alike characters', () => {
    for (const bad of ['123456', 'K7QX4M2', 'K7QX4M2PZ', 'O0QX4M2P', 'I1QX4M2P', 42, null]) {
      expect(normaliseLinkCode(bad)).toBeNull();
    }
  });
});

describe('createBridgeClient', () => {
  const answer = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it('signs each call and reads the answer', async () => {
    const fetchFn = answer(200, { ok: true, balance: 340, transferable: 290, point_value_ngwee: 10 });
    const client = createBridgeClient({ secret: SECRET, url: 'https://u.test/bridge', fetchFn, now: () => NOW });
    expect(await client.balance({ profileId: 'p', pampUser: 'u' })).toEqual({
      balance: 340,
      transferable: 290,
      pointValueNgwee: 10,
    });

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://u.test/bridge');
    const sent = String(init.body);
    expect(JSON.parse(sent)).toEqual({ action: 'balance', profile_id: 'p', pamp_user: 'u' });
    const header = (init.headers as Record<string, string>)[SIGNATURE_HEADER];
    expect(await verifyBridgeRequest(sent, header, SECRET, NOW)).toBe(true);
  });

  it('turns a refusal into a BridgeError that says why', async () => {
    const client = createBridgeClient({ secret: SECRET, fetchFn: answer(409, { ok: false, error: 'insufficient' }) });
    const err = await client
      .take({ profileId: 'p', pampUser: 'u', points: 5, ref: 'r', issuedAt: 'now' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect(err.code).toBe('insufficient');
    expect(isRefusal(err)).toBe(true);
  });

  it('treats no answer as unreachable, which is not a refusal', async () => {
    const client = createBridgeClient({
      secret: SECRET,
      fetchFn: vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    });
    const err = await client.check({ ref: 'r' }).catch((e) => e);
    expect(err.code).toBe('unreachable');
    expect(isRefusal(err)).toBe(false);
  });
});
