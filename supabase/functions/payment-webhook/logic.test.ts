// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handlePayment, parsePayment, sign, verifySignature, type OrderRow, type OrderStore } from './logic.ts';

const SECRET = 'whsec_test';
const ORDER = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';

const makeStore = (order: OrderRow | null) => {
  const store = {
    getOrder: vi.fn(async () => order),
    markPaid: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
  };
  return store satisfies OrderStore;
};

const body = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ event: 'payment.succeeded', order_id: ORDER, reference: 'MM-1001', amount_ngwee: 5500, ...over });

async function call(raw: string, store: OrderStore, { signature, method = 'POST' }: { signature?: string | null; method?: string } = {}) {
  const sig = signature === undefined ? await sign(raw, SECRET) : signature;
  const req = new Request('https://x.test/payment-webhook', {
    method,
    headers: sig ? { 'x-signature': sig } : {},
    body: method === 'POST' ? raw : undefined,
  });
  return handlePayment(req, { secret: SECRET, store });
}

describe('verifySignature', () => {
  it('accepts the HMAC of the exact body, with or without the sha256= prefix', async () => {
    const sig = await sign('{"a":1}', SECRET);
    expect(await verifySignature('{"a":1}', sig, SECRET)).toBe(true);
    expect(await verifySignature('{"a":1}', `sha256=${sig.toUpperCase()}`, SECRET)).toBe(true);
  });

  it('rejects a changed body, wrong secret, missing header or empty secret', async () => {
    const sig = await sign('{"a":1}', SECRET);
    expect(await verifySignature('{"a":2}', sig, SECRET)).toBe(false);
    expect(await verifySignature('{"a":1}', sig, 'other')).toBe(false);
    expect(await verifySignature('{"a":1}', null, SECRET)).toBe(false);
    expect(await verifySignature('{"a":1}', sig, '')).toBe(false);
    expect(await verifySignature('{"a":1}', 'abc', SECRET)).toBe(false);
  });
});

describe('parsePayment', () => {
  it('reads a valid payload', () => {
    expect(parsePayment(JSON.parse(body()))).toEqual({
      status: 'succeeded', orderId: ORDER, reference: 'MM-1001', amountNgwee: 5500,
    });
  });

  it.each([
    ['unknown event', { event: 'payment.refunded' }],
    ['order id that is not a uuid', { order_id: '1 or 1=1' }],
    ['blank reference', { reference: '  ' }],
    ['fractional amount', { amount_ngwee: 55.5 }],
    ['negative amount', { amount_ngwee: -1 }],
    ['amount as a string', { amount_ngwee: '5500' }],
  ])('refuses %s', (_name, over) => {
    expect(parsePayment(JSON.parse(body(over)))).toBeNull();
  });

  it('refuses things that are not objects', () => {
    expect(parsePayment(null)).toBeNull();
    expect(parsePayment('x')).toBeNull();
  });
});

describe('handlePayment', () => {
  const pending: OrderRow = { id: ORDER, status: 'pending', total_ngwee: 5500 };

  it('marks a pending order paid when the amount matches', async () => {
    const store = makeStore(pending);
    const res = await call(body(), store);
    expect(res.status).toBe(200);
    expect(store.markPaid).toHaveBeenCalledWith(ORDER, 'MM-1001');
  });

  it('does nothing and says so for a bad signature, before any lookup', async () => {
    const store = makeStore(pending);
    const res = await call(body(), store, { signature: 'deadbeef' });
    expect(res.status).toBe(401);
    expect(store.getOrder).not.toHaveBeenCalled();
    expect(store.markPaid).not.toHaveBeenCalled();
  });

  it('refuses an unsigned request', async () => {
    const store = makeStore(pending);
    expect((await call(body(), store, { signature: null })).status).toBe(401);
  });

  it('refuses anything but POST', async () => {
    expect((await call('', makeStore(pending), { method: 'GET', signature: 'x' })).status).toBe(405);
  });

  it('does not issue passes when the amount differs from the order total', async () => {
    const store = makeStore(pending);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(body({ amount_ngwee: 100 }), store);
    expect(res.status).toBe(422);
    expect(store.markPaid).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('acknowledges a redelivery for an order already paid without paying it twice', async () => {
    const store = makeStore({ ...pending, status: 'paid' });
    const res = await call(body(), store);
    expect(res.status).toBe(200);
    expect(store.markPaid).not.toHaveBeenCalled();
  });

  it('flags payment for an expired order instead of issuing passes', async () => {
    const store = makeStore({ ...pending, status: 'expired' });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(body(), store);
    expect(res.status).toBe(409);
    expect(store.markPaid).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('answers 404 for an order that does not exist', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await call(body(), makeStore(null))).status).toBe(404);
    err.mockRestore();
  });

  it('marks a pending order failed on a failure event', async () => {
    const store = makeStore(pending);
    const res = await call(body({ event: 'payment.failed' }), store);
    expect(res.status).toBe(200);
    expect(store.markFailed).toHaveBeenCalledWith(ORDER);
  });

  it('leaves a paid order alone on a late failure event', async () => {
    const store = makeStore({ ...pending, status: 'paid' });
    expect((await call(body({ event: 'payment.failed' }), store)).status).toBe(200);
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it('rejects a malformed payload that is correctly signed', async () => {
    const store = makeStore(pending);
    expect((await call('not json', store)).status).toBe(400);
    expect((await call(body({ order_id: 'nope' }), store)).status).toBe(400);
  });

  it('refuses an oversized body', async () => {
    expect((await call('x'.repeat(70 * 1024), makeStore(pending))).status).toBe(413);
  });
});
