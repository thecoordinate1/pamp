// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { type Collection, type LencoClient, type OrderRow, type OrderStore, lencoSignature } from '../_shared/lenco.ts';
import { handleWebhook } from './handler.ts';

const TOKEN = 'sk_test_token';
const ORDER = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';

const order: OrderRow = {
  id: ORDER, user_id: 'u1', status: 'pending', total_ngwee: 5500, method: 'mtn', msisdn: '0971234567', expires_at: null,
};
const collection: Collection = {
  id: 'c1', reference: ORDER, lencoReference: '240730008', status: 'successful',
  amount: '55.00', currency: 'ZMW', reasonForFailure: null,
};

const setup = ({ row = order as OrderRow | null, found = collection as Collection | null } = {}) => {
  const store = {
    getOrder: vi.fn(async () => row),
    markPaid: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    flagReview: vi.fn(async () => {}),
  } satisfies OrderStore;
  const lenco = {
    initiate: vi.fn(),
    getByReference: vi.fn(async () => found),
  } satisfies LencoClient;
  return { store, lenco };
};

const event = (data: Record<string, unknown> = { reference: ORDER }) =>
  JSON.stringify({ event: 'collection.successful', data });

async function send(raw: string, deps: ReturnType<typeof setup>, { signature, method = 'POST' }: { signature?: string | null; method?: string } = {}) {
  const sig = signature === undefined ? await lencoSignature(raw, TOKEN) : signature;
  const req = new Request('https://x.test/lenco-webhook', {
    method,
    headers: sig ? { 'x-lenco-signature': sig } : {},
    body: method === 'POST' ? raw : undefined,
  });
  return handleWebhook(req, { apiToken: TOKEN, ...deps });
}

describe('lenco webhook', () => {
  it('confirms the order from what Lenco says, not from the webhook body', async () => {
    const deps = setup();
    // The body claims a different amount and a failure: neither is believed.
    const res = await send(event({ reference: ORDER, amount: '0.01', status: 'failed' }), deps);
    expect(res.status).toBe(200);
    expect(deps.lenco.getByReference).toHaveBeenCalledWith(ORDER);
    expect(deps.store.markPaid).toHaveBeenCalledWith(ORDER, 'lenco:240730008');
    expect(deps.store.markFailed).not.toHaveBeenCalled();
  });

  it('refuses a bad or missing signature before looking anything up', async () => {
    for (const signature of ['deadbeef', null]) {
      const deps = setup();
      expect((await send(event(), deps, { signature })).status).toBe(401);
      expect(deps.store.getOrder).not.toHaveBeenCalled();
      expect(deps.lenco.getByReference).not.toHaveBeenCalled();
    }
  });

  it('refuses anything but POST', async () => {
    expect((await send('', setup(), { method: 'GET', signature: 'x' })).status).toBe(405);
  });

  it('acknowledges events that are not about an order, so Lenco stops retrying', async () => {
    for (const raw of [
      JSON.stringify({ event: 'account.balance-updated', data: { id: 'a' } }),
      JSON.stringify({ event: 'transaction.successful', data: { clientReference: 'not-an-order' } }),
      'not json',
    ]) {
      const deps = setup();
      const res = await send(raw, deps);
      expect(res.status).toBe(200);
      expect(deps.lenco.getByReference).not.toHaveBeenCalled();
      expect(deps.store.markPaid).not.toHaveBeenCalled();
    }
  });

  it('acknowledges a reference that is not one of our orders', async () => {
    const deps = setup({ row: null });
    expect((await send(event(), deps)).status).toBe(200);
    expect(deps.lenco.getByReference).not.toHaveBeenCalled();
  });

  it('also reads the reference from clientReference', async () => {
    const deps = setup();
    await send(event({ clientReference: ORDER }), deps);
    expect(deps.store.markPaid).toHaveBeenCalled();
  });

  it('fails the order when Lenco says the payment failed', async () => {
    const deps = setup({ found: { ...collection, status: 'failed' } });
    expect((await send(event(), deps)).status).toBe(200);
    expect(deps.store.markFailed).toHaveBeenCalledWith(ORDER);
  });

  it('is safe to receive twice', async () => {
    const deps = setup({ row: { ...order, status: 'paid' } });
    expect((await send(event(), deps)).status).toBe(200);
    expect(deps.store.markPaid).not.toHaveBeenCalled();
  });

  it('asks Lenco to retry when it cannot find the collection yet', async () => {
    await expect(send(event(), setup({ found: null }))).rejects.toThrow(/does not know/);
  });

  it('refuses an oversized body', async () => {
    expect((await send('x'.repeat(70 * 1024), setup())).status).toBe(413);
  });
});
