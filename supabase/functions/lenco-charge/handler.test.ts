// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { type Collection, type LencoClient, type OrderRow, type OrderStore, LencoError } from '../_shared/lenco.ts';
import { handleCharge } from './handler.ts';

const ORDER = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
const NOW = Date.parse('2026-10-05T12:00:00Z');

const order: OrderRow = {
  id: ORDER, user_id: 'me', status: 'pending', total_ngwee: 5500, method: 'mtn',
  msisdn: '097 123 4567', expires_at: '2026-10-05T12:15:00Z',
};
const offline: Collection = {
  id: 'c1', reference: ORDER, lencoReference: '240730008', status: 'pay-offline',
  amount: '55.00', currency: 'ZMW', reasonForFailure: null,
};

const setup = ({ row = order as OrderRow | null, initiate = offline as Collection | Error, found = offline as Collection | null } = {}) => {
  const store = {
    getOrder: vi.fn(async () => row),
    markPaid: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
  } satisfies OrderStore;
  const lenco = {
    initiate: vi.fn(async () => {
      if (initiate instanceof Error) throw initiate;
      return initiate;
    }),
    getByReference: vi.fn(async () => found),
  } satisfies LencoClient;
  return { store, lenco };
};

const call = (deps: ReturnType<typeof setup>, body: unknown, { userId = 'me', method = 'POST' } = {}) =>
  handleCharge(
    new Request('https://x.test/lenco-charge', { method, body: method === 'POST' ? JSON.stringify(body) : undefined }),
    { userId, ...deps, now: () => NOW }
  );

const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('starting a charge', () => {
  it("asks Lenco for the order's own amount, phone and operator, never the request's", async () => {
    const deps = setup();
    const res = await call(deps, { order_id: ORDER, amount: 1, phone: '0000000000', operator: 'airtel' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'pending' });
    expect(deps.lenco.initiate).toHaveBeenCalledWith({
      amountNgwee: 5500, reference: ORDER, phone: '0971234567', operator: 'mtn',
    });
  });

  it('pays the order straight away when Lenco says it is already successful', async () => {
    const deps = setup({ initiate: { ...offline, status: 'successful' } });
    expect(await (await call(deps, { order_id: ORDER })).json()).toEqual({ state: 'paid' });
    expect(deps.store.markPaid).toHaveBeenCalled();
  });

  it('fails the order and says why when Lenco refuses it outright', async () => {
    const deps = setup({ initiate: { ...offline, status: 'failed', reasonForFailure: 'Insufficient funds' } });
    expect(await (await call(deps, { order_id: ORDER })).json()).toEqual({ state: 'failed', message: 'Insufficient funds' });
    expect(deps.store.markFailed).toHaveBeenCalledWith(ORDER);
  });

  it('reports on the first request when a double tap is a duplicate reference', async () => {
    const deps = setup({ initiate: new LencoError('Duplicate reference', 400) });
    const res = await call(deps, { order_id: ORDER });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'pending' });
    expect(deps.lenco.getByReference).toHaveBeenCalledWith(ORDER);
  });

  it("passes Lenco's explanation of a rejected request to the customer", async () => {
    const deps = setup({ initiate: new LencoError('Invalid phone number', 400) });
    const res = await call(deps, { order_id: ORDER });
    expect(res.status).toBe(422);
    expect((await res.json()).message).toBe('Invalid phone number');
  });

  it('keeps provider and credential failures to itself', async () => {
    const err = quiet();
    for (const status of [401, 403, 500, 502]) {
      const res = await call(setup({ initiate: new LencoError('secret detail', status) }), { order_id: ORDER });
      expect(res.status).toBe(502);
      expect(JSON.stringify(await res.json())).not.toContain('secret detail');
    }
    err.mockRestore();
  });
});

describe('who and what can be charged', () => {
  it("treats someone else's order like one that does not exist", async () => {
    const deps = setup();
    expect((await call(deps, { order_id: ORDER }, { userId: 'someone-else' })).status).toBe(404);
    expect(deps.lenco.initiate).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown order', async () => {
    expect((await call(setup({ row: null }), { order_id: ORDER })).status).toBe(404);
  });

  it('refuses a request that is not a valid order id', async () => {
    for (const body of [{}, { order_id: 'nope' }, { order_id: 5 }]) {
      expect((await call(setup(), body)).status).toBe(400);
    }
  });

  it('refuses anything but POST', async () => {
    expect((await call(setup(), {}, { method: 'GET' })).status).toBe(405);
  });

  it.each([
    ['expired', { status: 'expired' }, 409],
    ['failed', { status: 'failed' }, 409],
    ['past its hold', { expires_at: '2026-10-05T11:59:00Z' }, 409],
    ['paid by card', { method: 'card' }, 400],
    ['paid with points only', { method: 'points' }, 400],
    ['missing a phone number', { msisdn: null }, 400],
    ['a nonsense phone number', { msisdn: 'abc' }, 400],
    ['nothing to pay', { total_ngwee: 0 }, 409],
  ])('does not charge an order that is %s', async (_name, over, status) => {
    const deps = setup({ row: { ...order, ...over } });
    expect((await call(deps, { order_id: ORDER })).status).toBe(status);
    expect(deps.lenco.initiate).not.toHaveBeenCalled();
  });

  it('answers paid, without charging again, for an order that is already paid', async () => {
    const deps = setup({ row: { ...order, status: 'paid' } });
    expect(await (await call(deps, { order_id: ORDER })).json()).toEqual({ state: 'paid' });
    expect(deps.lenco.initiate).not.toHaveBeenCalled();
  });
});

describe('checking on a charge', () => {
  it('settles from what Lenco says now', async () => {
    const deps = setup({ found: { ...offline, status: 'successful' } });
    expect(await (await call(deps, { order_id: ORDER, check: true })).json()).toEqual({ state: 'paid' });
    expect(deps.lenco.initiate).not.toHaveBeenCalled();
    expect(deps.store.markPaid).toHaveBeenCalled();
  });

  it('keeps waiting while the customer has not approved', async () => {
    expect(await (await call(setup(), { order_id: ORDER, check: true })).json()).toEqual({ state: 'pending' });
  });

  it('reports failure', async () => {
    const deps = setup({ found: { ...offline, status: 'failed', reasonForFailure: 'Declined' } });
    expect((await (await call(deps, { order_id: ORDER, check: true })).json()).state).toBe('failed');
  });

  it('stops the wait once the order has expired without an approval', async () => {
    const deps = setup({ row: { ...order, status: 'expired' } });
    const body = await (await call(deps, { order_id: ORDER, check: true })).json();
    expect(body.state).toBe('failed');
    expect(deps.store.markPaid).not.toHaveBeenCalled();
  });

  it('does not ask Lenco about an order that is already paid', async () => {
    const deps = setup({ row: { ...order, status: 'paid' } });
    expect(await (await call(deps, { order_id: ORDER, check: true })).json()).toEqual({ state: 'paid' });
    expect(deps.lenco.getByReference).not.toHaveBeenCalled();
  });
});
