// Lenco (https://lenco-api.readme.io) mobile money collections, as plain
// functions with no Deno or Supabase imports, so Vitest can run them.
//
// How a paid order gets paid:
//   1. lenco-charge asks Lenco to collect the order's total from the customer's
//      phone, using the order id as Lenco's `reference`.
//   2. The customer approves on their phone. Lenco calls lenco-webhook, and the
//      app also polls lenco-charge, until the collection is successful or failed.
//   3. Either way, the decision comes from asking Lenco for the collection's
//      current state (getByReference) and never from the request that woke us.
//      A webhook only says "look at this reference"; amount, currency and status
//      are read from Lenco's own API over an authenticated call.
//   4. settleCollection turns that state into passes (mark_order_paid) or a
//      failed order, and does nothing twice.

export const LENCO_API_URL = 'https://api.lenco.co/access/v2';

export type Collection = {
  id: string;
  reference: string;
  lencoReference: string | null;
  status: string; // 'pending' | 'successful' | 'failed' | 'pay-offline'
  amount: string; // kwacha as a decimal string, "13.00"
  currency: string;
  reasonForFailure: string | null;
};

export type OrderRow = {
  id: string;
  user_id: string;
  status: string;
  total_ngwee: number;
  method: string;
  msisdn: string | null;
  expires_at: string | null;
};

// What the handlers need from the database. index.ts backs it with the service
// role; tests pass a fake.
export type ReviewReason = 'order_not_payable' | 'amount_mismatch' | 'reference_mismatch';

export type OrderStore = {
  getOrder(id: string): Promise<OrderRow | null>;
  markPaid(id: string, reference: string): Promise<void>;
  markFailed(id: string): Promise<void>;
  // Records money a person has to sort out, for the admin page. Once per order
  // and reason, however many times the webhook and polls find it.
  flagReview(input: {
    orderId: string;
    reason: ReviewReason;
    providerReference: string | null;
    amount: string;
    currency: string;
  }): Promise<void>;
};

export type LencoClient = {
  initiate(input: { amountNgwee: number; reference: string; phone: string; operator: string }): Promise<Collection>;
  getByReference(reference: string): Promise<Collection | null>;
};

export class LencoError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'LencoError';
    this.status = status;
  }
}

export const isDuplicateReference = (err: unknown) =>
  err instanceof LencoError && /duplicate reference/i.test(err.message);

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// payment_method values that are Lenco mobile money operators.
export const OPERATORS: Record<string, string> = { mtn: 'mtn', airtel: 'airtel', zamtel: 'zamtel' };

// --- Signatures -------------------------------------------------------------

const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Compares in time that does not depend on where the strings first differ.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Lenco's webhook_hash_key: the SHA-256 of the API token, as hex.
async function webhookHashKey(apiToken: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(apiToken)));
}

export async function lencoSignature(body: string, apiToken: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(await webhookHashKey(apiToken)),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
}

// X-Lenco-Signature is the hex HMAC-SHA512 of the event, keyed with the hash of
// the API token. Lenco's own examples hash JSON.stringify(parsedBody), so the
// compact re-serialisation is accepted as well as the exact bytes received:
// either one can only be produced by someone holding the key.
export async function verifyLencoSignature(raw: string, header: string | null, apiToken: string): Promise<boolean> {
  if (!header || !apiToken) return false;
  const given = header.trim().toLowerCase();
  if (safeEqual(given, await lencoSignature(raw, apiToken))) return true;
  try {
    const compact = JSON.stringify(JSON.parse(raw));
    return compact !== raw && safeEqual(given, await lencoSignature(compact, apiToken));
  } catch {
    return false;
  }
}

// --- Amounts and phone numbers ----------------------------------------------

// Lenco amounts are kwacha strings ("13.00"); PAMP stores ngwee. Parsed as text
// so no floating point is involved. Null for anything that is not an amount.
export function lencoAmountToNgwee(amount: unknown): number | null {
  if (typeof amount !== 'string') return null;
  const m = /^(\d{1,9})(?:\.(\d{1,2})\d*)?$/.exec(amount.trim());
  if (!m) return null;
  // Digits past the second decimal must be zeros, or it is not a whole ngwee.
  if (/\.\d{2}\d*[1-9]/.test(amount)) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

export const ngweeToLencoAmount = (ngwee: number) => Number((ngwee / 100).toFixed(2));

// Digits only, as people type spaces and a leading + or 0 freely. Lenco takes
// local (0977...) and international (260977...) numbers.
export function cleanPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/[\s\-().+]/g, '');
  return /^\d{9,15}$/.test(digits) ? digits : null;
}

// --- Lenco API --------------------------------------------------------------

export function parseCollection(data: unknown): Collection | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.id !== 'string' || typeof d.reference !== 'string') return null;
  if (typeof d.status !== 'string' || typeof d.amount !== 'string' || typeof d.currency !== 'string') return null;
  return {
    id: d.id,
    reference: d.reference,
    lencoReference: typeof d.lencoReference === 'string' ? d.lencoReference : null,
    status: d.status,
    amount: d.amount,
    currency: d.currency,
    reasonForFailure: typeof d.reasonForFailure === 'string' ? d.reasonForFailure : null,
  };
}

export function createLencoClient({
  token,
  baseUrl = LENCO_API_URL,
  fetchFn = fetch,
}: {
  token: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}): LencoClient {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  async function call(path: string, init: RequestInit) {
    const res = await fetchFn(`${baseUrl}${path}`, { ...init, headers });
    const json = await res.json().catch(() => null);
    return { res, json };
  }

  return {
    async initiate({ amountNgwee, reference, phone, operator }) {
      const { res, json } = await call('/collections/mobile-money', {
        method: 'POST',
        body: JSON.stringify({
          amount: ngweeToLencoAmount(amountNgwee),
          reference,
          phone,
          operator,
          country: 'zm',
        }),
      });
      if (!res.ok || json?.status === false) {
        throw new LencoError(json?.message || `Lenco answered ${res.status}`, res.status);
      }
      const collection = parseCollection(json?.data);
      if (!collection) throw new LencoError('Unexpected answer from Lenco', 502);
      return collection;
    },

    // GET /collections/status/{reference}, checked against
    // https://lenco-api.readme.io/v2.0/reference/get-collection-by-reference
    // on 2026-10-05. Answers 404 with status false when Lenco has no such
    // collection. Still worth one sandbox run before going live.
    async getByReference(reference) {
      const { res, json } = await call(`/collections/status/${encodeURIComponent(reference)}`, { method: 'GET' });
      if (res.status === 404) return null;
      if (!res.ok || json?.status === false) {
        throw new LencoError(json?.message || `Lenco answered ${res.status}`, res.status);
      }
      return parseCollection(json?.data);
    },
  };
}

// --- Settling ---------------------------------------------------------------

export type Settlement = {
  // paid: passes issued (now or earlier). failed: Lenco reports the payment
  // failed. pending: the customer has not approved yet. review: money and order
  // disagree and a person has to look, so nothing is issued.
  state: 'paid' | 'failed' | 'pending' | 'review';
  message?: string;
};

export async function settleCollection(
  order: OrderRow,
  collection: Collection,
  store: OrderStore
): Promise<Settlement> {
  const review = async (reason: ReviewReason): Promise<Settlement> => {
    await store.flagReview({
      orderId: order.id,
      reason,
      providerReference: collection.lencoReference ?? collection.id,
      amount: collection.amount,
      currency: collection.currency,
    });
    return { state: 'review', message: reason };
  };

  if (collection.reference !== order.id) {
    console.error('collection reference does not match its order', order.id, collection.reference);
    return review('reference_mismatch');
  }

  if (collection.status === 'failed') {
    if (order.status === 'pending') {
      await store.markFailed(order.id);
      return { state: 'failed', message: collection.reasonForFailure ?? 'The payment was not approved.' };
    }
    return { state: order.status === 'paid' ? 'paid' : 'failed' };
  }

  if (collection.status !== 'successful') return { state: 'pending' };

  // Redelivery, or a poll after the webhook already did the work.
  if (order.status === 'paid') return { state: 'paid' };

  if (order.status !== 'pending') {
    // The customer paid for an order that has expired, failed or been refunded.
    console.error('payment for an order that is not payable', order.id, order.status, collection.lencoReference);
    return review('order_not_payable');
  }

  if (collection.currency !== 'ZMW' || lencoAmountToNgwee(collection.amount) !== order.total_ngwee) {
    console.error(
      'payment does not match the order',
      order.id, collection.amount, collection.currency, order.total_ngwee, collection.lencoReference
    );
    return review('amount_mismatch');
  }

  await store.markPaid(order.id, `lenco:${collection.lencoReference ?? collection.id}`);
  return { state: 'paid' };
}

export const json = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } });
