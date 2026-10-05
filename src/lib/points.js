// Points maths, matching create_order and compute_fee in the database so the
// checkout can show the price before the order exists. All amounts in ngwee.

// round(subtotal * bps / 10000) + fixed, in whole numbers: Postgres rounds
// half away from zero, which for a positive amount is this.
export function feeFor(subtotalNgwee, { feePercentBps = 0, feeFixedNgwee = 0 } = {}) {
  if (subtotalNgwee <= 0) return 0;
  return Math.floor((subtotalNgwee * feePercentBps + 5000) / 10000) + feeFixedNgwee;
}

// What an order costs with points put towards it: never more points than the
// order needs, and never more than the person holds.
export function quoteWithPoints({ subtotalNgwee, balance, pointValueNgwee, settings }) {
  const fee = feeFor(subtotalNgwee, settings);
  const due = subtotalNgwee + fee;
  if (subtotalNgwee <= 0 || !pointValueNgwee || balance <= 0) {
    return { fee, due, points: 0, discount: 0, total: due };
  }
  const points = Math.min(balance, Math.ceil(due / pointValueNgwee));
  const discount = Math.min(due, points * pointValueNgwee);
  return { fee, due, points, discount, total: due - discount };
}

export const pointsWorthNgwee = (points, pointValueNgwee) => (points ?? 0) * (pointValueNgwee ?? 0);

// One line of someone's points history.
export function describePointEntry({ kind, eventName }) {
  const at = eventName ? ` at ${eventName}` : '';
  const forEvent = eventName ? ` for ${eventName}` : '';
  switch (kind) {
    case 'attended': return `Checked in${at}`;
    case 'attended_undone': return `Check-in undone${at}`;
    case 'referral': return `A friend you invited went to their first event`;
    case 'referral_undone': return `Invite reward taken back`;
    case 'pass_discount': return `Spent on a pass${forEvent}`;
    case 'pass_discount_refund': return `Returned from an unpaid order`;
    case 'adjustment': return 'Adjusted by PAMP';
    default: return 'Points';
  }
}
