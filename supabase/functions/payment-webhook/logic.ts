// Payment confirmation. A mobile money or card provider calls this when a
// customer's payment succeeds or fails, and it is the only thing that turns a
// pending order into passes (through mark_order_paid, which browsers cannot call).
//
// Everything here is provider-neutral and has no Deno or Supabase imports, so
// Vitest can run it. Connecting a provider means changing two places:
//   - verifySignature: how that provider signs a request (HMAC over the raw body
//     is the common case and is what this does).
//   - parsePayment: how its payload maps onto the Payment shape below.

export type Payment = {
  status: 'succeeded' | 'failed';
  orderId: string;
  reference: string;
  amountNgwee: number;
};

export type OrderRow = { id: string; status: string; total_ngwee: number };

// What the handler needs from the database. index.ts backs it with the service
// role; tests pass a fake.
export type OrderStore = {
  getOrder(id: string): Promise<OrderRow | null>;
  markPaid(id: string, reference: string): Promise<void>;
  markFailed(id: string): Promise<void>;
};

const MAX_BODY_BYTES = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Compares in time that does not depend on where the strings first differ.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sign(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
}

// The header carries the hex HMAC-SHA256 of the raw request body, optionally
// prefixed "sha256=". Verified against the exact bytes received, never a
// re-serialised copy.
export async function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string
): Promise<boolean> {
  if (!header || !secret) return false;
  const given = header.trim().toLowerCase().replace(/^sha256=/, '');
  return safeEqual(given, await sign(rawBody, secret));
}

// The payload this endpoint expects:
//   { "event": "payment.succeeded" | "payment.failed",
//     "order_id": "<uuid>", "reference": "<provider's id>", "amount_ngwee": 5000 }
export function parsePayment(body: unknown): Payment | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const status =
    b.event === 'payment.succeeded' ? 'succeeded' : b.event === 'payment.failed' ? 'failed' : null;
  if (!status) return null;
  if (typeof b.order_id !== 'string' || !UUID.test(b.order_id)) return null;
  if (typeof b.reference !== 'string' || !b.reference.trim() || b.reference.length > 128) return null;
  if (typeof b.amount_ngwee !== 'number' || !Number.isInteger(b.amount_ngwee) || b.amount_ngwee < 0) {
    return null;
  }
  return {
    status,
    orderId: b.order_id.toLowerCase(),
    reference: b.reference.trim(),
    amountNgwee: b.amount_ngwee,
  };
}

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function handlePayment(
  req: Request,
  { secret, store }: { secret: string; store: OrderStore }
): Promise<Response> {
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return reply(413, { error: 'too_large' });

  // Before anything is parsed or looked up, so an unsigned caller learns nothing.
  if (!(await verifySignature(raw, req.headers.get('x-signature'), secret))) {
    return reply(401, { error: 'bad_signature' });
  }

  let payment: Payment | null;
  try {
    payment = parsePayment(JSON.parse(raw));
  } catch {
    payment = null;
  }
  if (!payment) return reply(400, { error: 'bad_payload' });

  const order = await store.getOrder(payment.orderId);
  if (!order) {
    console.error('payment for unknown order', payment.orderId, payment.reference);
    return reply(404, { error: 'unknown_order' });
  }

  if (payment.status === 'failed') {
    // A failure for an order that already moved on (paid, expired) changes nothing.
    if (order.status === 'pending') await store.markFailed(order.id);
    return reply(200, { ok: true, order: order.id, status: order.status === 'pending' ? 'failed' : order.status });
  }

  // Redelivery of a webhook that already worked.
  if (order.status === 'paid') return reply(200, { ok: true, order: order.id, status: 'paid' });

  if (order.status !== 'pending') {
    // Money arrived for an order that has expired, failed or been refunded.
    // Nothing is issued, so this needs a person: refund it or reissue by hand.
    console.error('payment for an order that is not payable', order.id, order.status, payment.reference);
    return reply(409, { error: 'order_not_payable', status: order.status });
  }

  if (payment.amountNgwee !== order.total_ngwee) {
    console.error('payment amount mismatch', order.id, payment.amountNgwee, order.total_ngwee, payment.reference);
    return reply(422, { error: 'amount_mismatch' });
  }

  await store.markPaid(order.id, payment.reference);
  return reply(200, { ok: true, order: order.id, status: 'paid' });
}
