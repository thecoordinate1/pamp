// Lenco calls this when something happens on the account. It is only a nudge:
// the order and its status come from Lenco's API, not from this request.
//
// Lenco treats anything but 200, 201 or 202 as "not received" and retries every
// hour for a day. So events that are not ours, or that a person has to look at,
// are acknowledged with 200; only a transient failure (Lenco or the database
// being down) answers 500 so the retry can help.
import {
  type LencoClient,
  type OrderStore,
  UUID,
  json,
  settleCollection,
  verifyLencoSignature,
} from '../_shared/lenco.ts';

const MAX_BODY_BYTES = 64 * 1024;

// The reference a collection event carries. Lenco's published event list
// does not include a collection event, so this reads the places a reference
// can plausibly be and ignores anything that is not an order id.
function referenceOf(event: unknown): string | null {
  const data = (event as { data?: Record<string, unknown> } | null)?.data;
  for (const candidate of [data?.reference, data?.clientReference]) {
    if (typeof candidate === 'string' && UUID.test(candidate)) return candidate.toLowerCase();
  }
  return null;
}

export async function handleWebhook(
  req: Request,
  { apiToken, store, lenco }: { apiToken: string; store: OrderStore; lenco: LencoClient }
): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'too_large' });

  // Before anything is parsed or looked up, so an unsigned caller learns nothing
  // and cannot make this call Lenco.
  if (!(await verifyLencoSignature(raw, req.headers.get('x-lenco-signature'), apiToken))) {
    return json(401, { error: 'bad_signature' });
  }

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return json(200, { ok: true, ignored: 'not_json' });
  }

  const reference = referenceOf(event);
  if (!reference) return json(200, { ok: true, ignored: 'no_order_reference' });

  const order = await store.getOrder(reference);
  if (!order) return json(200, { ok: true, ignored: 'unknown_order' });

  const collection = await lenco.getByReference(order.id);
  if (!collection) {
    // Lenco has no such collection yet. Not acknowledged, so Lenco sends it again.
    throw new Error(`Lenco does not know collection ${order.id}`);
  }

  const settlement = await settleCollection(order, collection, store);
  return json(200, { ok: true, order: order.id, state: settlement.state });
}
