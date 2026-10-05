// @vitest-environment node
import { createHmac, createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  type Collection,
  type OrderRow,
  type OrderStore,
  LencoError,
  cleanPhone,
  createLencoClient,
  lencoAmountToNgwee,
  lencoSignature,
  ngweeToLencoAmount,
  settleCollection,
  verifyLencoSignature,
} from './lenco.ts';

const TOKEN = 'sk_test_token';
const ORDER = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';

// Lenco's documented scheme, written the way their Node example does it.
const referenceSignature = (body: string) =>
  createHmac('sha512', createHash('sha256').update(TOKEN).digest('hex')).update(body).digest('hex');

describe('Lenco signatures', () => {
  it('matches the HMAC-SHA512 over the SHA-256 of the token, as Lenco documents', async () => {
    const body = '{"event":"x"}';
    expect(await lencoSignature(body, TOKEN)).toBe(referenceSignature(body));
  });

  it('accepts a correct signature, in any letter case', async () => {
    const body = '{"event":"x"}';
    expect(await verifyLencoSignature(body, referenceSignature(body), TOKEN)).toBe(true);
    expect(await verifyLencoSignature(body, referenceSignature(body).toUpperCase(), TOKEN)).toBe(true);
  });

  it("accepts a signature over the compact form of a body sent with spaces, as Lenco's own example hashes", async () => {
    const sent = '{ "event": "x", "data": { "a": 1 } }';
    const signed = referenceSignature(JSON.stringify(JSON.parse(sent)));
    expect(await verifyLencoSignature(sent, signed, TOKEN)).toBe(true);
  });

  it('rejects a changed body, wrong token, missing header and empty token', async () => {
    const sig = referenceSignature('{"a":1}');
    expect(await verifyLencoSignature('{"a":2}', sig, TOKEN)).toBe(false);
    expect(await verifyLencoSignature('{"a":1}', sig, 'other')).toBe(false);
    expect(await verifyLencoSignature('{"a":1}', null, TOKEN)).toBe(false);
    expect(await verifyLencoSignature('{"a":1}', sig, '')).toBe(false);
    expect(await verifyLencoSignature('not json', 'abc', TOKEN)).toBe(false);
  });
});

describe('amounts', () => {
  it.each([
    ['13.00', 1300],
    ['13', 1300],
    ['0.50', 50],
    ['55.5', 5550],
    ['1200.00', 120000],
    ['13.000', 1300],
  ])('reads %s as %i ngwee', (text, ngwee) => {
    expect(lencoAmountToNgwee(text)).toBe(ngwee);
  });

  it.each(['', 'abc', '-5.00', '13.005', '1,300.00', '13.00 ZMW', null, 13, undefined])(
    'refuses %j',
    (value) => {
      expect(lencoAmountToNgwee(value)).toBeNull();
    }
  );

  it('sends ngwee to Lenco as kwacha', () => {
    expect(ngweeToLencoAmount(5500)).toBe(55);
    expect(ngweeToLencoAmount(1305)).toBe(13.05);
    expect(ngweeToLencoAmount(1)).toBe(0.01);
  });
});

describe('cleanPhone', () => {
  it('strips spaces, dashes, brackets and +', () => {
    expect(cleanPhone('097 123 4567')).toBe('0971234567');
    expect(cleanPhone('+260 97-123-4567')).toBe('260971234567');
    expect(cleanPhone('(097) 1234567')).toBe('0971234567');
  });
  it('refuses what is not a number', () => {
    expect(cleanPhone('')).toBeNull();
    expect(cleanPhone('12345')).toBeNull();
    expect(cleanPhone('097abc4567')).toBeNull();
    expect(cleanPhone(null)).toBeNull();
  });
});

describe('Lenco client', () => {
  const collection = {
    id: 'c1', reference: ORDER, lencoReference: '240730008', status: 'pay-offline',
    amount: '55.00', currency: 'ZMW', reasonForFailure: null,
  };
  const reply = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it('starts a collection with the order id as the reference and a bearer token', async () => {
    const fetchFn = reply(200, { status: true, message: '', data: collection });
    const client = createLencoClient({ token: TOKEN, fetchFn });
    const got = await client.initiate({ amountNgwee: 5500, reference: ORDER, phone: '0971234567', operator: 'mtn' });

    expect(got.status).toBe('pay-offline');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.lenco.co/access/v2/collections/mobile-money');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body as string)).toEqual({
      amount: 55, reference: ORDER, phone: '0971234567', operator: 'mtn', country: 'zm',
    });
  });

  it("raises Lenco's own message when it refuses", async () => {
    const client = createLencoClient({
      token: TOKEN,
      fetchFn: reply(400, { status: false, message: 'Duplicate reference', data: null }),
    });
    await expect(
      client.initiate({ amountNgwee: 5500, reference: ORDER, phone: '0971234567', operator: 'mtn' })
    ).rejects.toMatchObject({ message: 'Duplicate reference', status: 400 });
  });

  it('answers null for a collection Lenco does not know', async () => {
    const client = createLencoClient({ token: TOKEN, fetchFn: reply(404, { status: false, message: 'Not found', data: null }) });
    expect(await client.getByReference(ORDER)).toBeNull();
  });

  it('raises for an answer it cannot read', async () => {
    const client = createLencoClient({ token: TOKEN, fetchFn: reply(200, { status: true, data: { nope: 1 } }) });
    await expect(client.initiate({ amountNgwee: 100, reference: ORDER, phone: '0971234567', operator: 'mtn' })).rejects.toBeInstanceOf(LencoError);
  });
});

describe('settleCollection', () => {
  const order: OrderRow = {
    id: ORDER, user_id: 'u1', status: 'pending', total_ngwee: 5500, method: 'mtn', msisdn: '0971234567', expires_at: null,
  };
  const col = (over: Partial<Collection> = {}): Collection => ({
    id: 'c1', reference: ORDER, lencoReference: '240730008', status: 'successful',
    amount: '55.00', currency: 'ZMW', reasonForFailure: null, ...over,
  });
  const makeStore = () => ({
    getOrder: vi.fn(async () => order),
    markPaid: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
  }) satisfies OrderStore;
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  it('issues the passes for a successful collection that matches the order', async () => {
    const store = makeStore();
    expect(await settleCollection(order, col(), store)).toEqual({ state: 'paid' });
    expect(store.markPaid).toHaveBeenCalledWith(ORDER, 'lenco:240730008');
  });

  it('does not pay twice', async () => {
    const store = makeStore();
    expect((await settleCollection({ ...order, status: 'paid' }, col(), store)).state).toBe('paid');
    expect(store.markPaid).not.toHaveBeenCalled();
  });

  it('holds back for review when the amount, currency or reference is wrong', async () => {
    const err = quiet();
    for (const bad of [{ amount: '1.00' }, { amount: '55.01' }, { currency: 'USD' }, { reference: 'other' }]) {
      const store = makeStore();
      expect((await settleCollection(order, col(bad), store)).state).toBe('review');
      expect(store.markPaid).not.toHaveBeenCalled();
    }
    err.mockRestore();
  });

  it('holds back for review when money arrives for an expired order', async () => {
    const err = quiet();
    const store = makeStore();
    expect((await settleCollection({ ...order, status: 'expired' }, col(), store)).state).toBe('review');
    expect(store.markPaid).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('waits while the customer has not approved', async () => {
    for (const status of ['pending', 'pay-offline']) {
      const store = makeStore();
      expect((await settleCollection(order, col({ status }), store)).state).toBe('pending');
      expect(store.markPaid).not.toHaveBeenCalled();
      expect(store.markFailed).not.toHaveBeenCalled();
    }
  });

  it('fails a pending order and says why', async () => {
    const store = makeStore();
    const out = await settleCollection(order, col({ status: 'failed', reasonForFailure: 'Insufficient funds' }), store);
    expect(out).toEqual({ state: 'failed', message: 'Insufficient funds' });
    expect(store.markFailed).toHaveBeenCalledWith(ORDER);
  });

  it('does not fail an order that is already paid', async () => {
    const store = makeStore();
    expect((await settleCollection({ ...order, status: 'paid' }, col({ status: 'failed' }), store)).state).toBe('paid');
    expect(store.markFailed).not.toHaveBeenCalled();
  });
});
