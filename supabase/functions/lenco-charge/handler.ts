// Starts a mobile money collection for one of the signed-in customer's orders,
// and checks on it afterwards. Amount, phone number and operator come from the
// order row, which only the database writes, and never from this request.
import {
  type LencoClient,
  LencoError,
  type OrderStore,
  OPERATORS,
  UUID,
  cleanPhone,
  isDuplicateReference,
  json,
  settleCollection,
} from '../_shared/lenco.ts';

const GENERIC = 'The payment service is not available right now. Try again in a moment.';

export async function handleCharge(
  req: Request,
  { userId, store, lenco, now = () => Date.now() }: { userId: string; store: OrderStore; lenco: LencoClient; now?: () => number },
  headers: Record<string, string> = {}
): Promise<Response> {
  const reply = (status: number, body: Record<string, unknown>) => json(status, body, headers);
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  let body: { order_id?: unknown; check?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'bad_request', message: 'Send the order to pay.' });
  }
  if (typeof body.order_id !== 'string' || !UUID.test(body.order_id)) {
    return reply(400, { error: 'bad_request', message: 'Send the order to pay.' });
  }

  const order = await store.getOrder(body.order_id.toLowerCase());
  // Someone else's order looks the same as one that does not exist.
  if (!order || order.user_id !== userId) return reply(404, { error: 'not_found', message: 'Order not found.' });

  try {
    // Checking: what has Lenco heard from the customer's phone?
    if (body.check === true) {
      if (order.status === 'paid') return reply(200, { state: 'paid' });
      const collection = await lenco.getByReference(order.id);
      if (!collection) return reply(200, { state: order.status === 'pending' ? 'pending' : 'failed' });
      const settlement = await settleCollection(order, collection, store);
      // The hold ran out (or the order was cancelled) with the customer still
      // undecided, so stop the app waiting for an approval that cannot count.
      if (settlement.state === 'pending' && order.status !== 'pending') {
        return reply(200, { state: 'failed', message: 'This order expired before it was paid.' });
      }
      return reply(200, { ...settlement });
    }

    if (order.status === 'paid') return reply(200, { state: 'paid' });
    if (order.status !== 'pending') {
      return reply(409, { error: 'not_payable', message: 'This order can no longer be paid. Start again.' });
    }
    if (order.expires_at && Date.parse(order.expires_at) <= now()) {
      return reply(409, { error: 'expired', message: 'This order has expired. Start again.' });
    }
    const operator = OPERATORS[order.method];
    if (!operator) {
      return reply(400, { error: 'unsupported_method', message: 'Pay with MTN, Airtel or Zamtel mobile money.' });
    }
    const phone = cleanPhone(order.msisdn);
    if (!phone) return reply(400, { error: 'bad_phone', message: 'Enter a valid mobile money number.' });
    if (order.total_ngwee <= 0) return reply(409, { error: 'not_payable', message: 'Nothing to pay on this order.' });

    let collection;
    try {
      collection = await lenco.initiate({
        amountNgwee: order.total_ngwee,
        reference: order.id,
        phone,
        operator,
      });
    } catch (err) {
      // A double tap: the first request already started it, so report on that.
      if (!isDuplicateReference(err)) throw err;
      collection = await lenco.getByReference(order.id);
      if (!collection) throw err;
    }

    const settlement = await settleCollection(order, collection, store);
    return reply(200, { ...settlement });
  } catch (err) {
    if (err instanceof LencoError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 403) {
      // Something about this request Lenco can explain, such as a bad number.
      return reply(422, { error: 'provider_rejected', message: err.message });
    }
    console.error('lenco charge failed', order.id, err);
    return reply(502, { error: 'provider_unavailable', message: GENERIC });
  }
}
