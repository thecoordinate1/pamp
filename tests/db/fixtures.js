// Small builders shared by the database tests. They run as the superuser, which
// Supabase's own service code also does, so they are not subject to RLS.
import { asUser } from './harness.js';

export async function makeEvent(db, hostId, { price = 0, capacity = null, name = 'Test party' } = {}) {
  const { rows } = await db.query(
    `insert into public.events (host_id, name, starts_on, start_time, area, ticket_price_ngwee, capacity)
     values ($1, $2, current_date, '21:00', 'Kabulonga', $3, $4) returning id`,
    [hostId, name, price, capacity]
  );
  return rows[0].id;
}

// create_order as the given user, committed, returning the order row.
export async function order(db, userId, eventId, quantity = 1, method = 'free') {
  return asUser(
    db,
    userId,
    async (tx) =>
      (
        await tx.query(
          'select * from public.create_order($1::uuid, $2::int, $3::public.payment_method)',
          [eventId, quantity, method]
        )
      ).rows[0],
    { commit: true }
  );
}

export async function ticketsOf(db, userId, eventId) {
  const { rows } = await db.query(
    `select code, status, checked_in_at from public.tickets
      where user_id = $1 and event_id = $2 order by created_at, code`,
    [userId, eventId]
  );
  return rows;
}

export async function checkIn(db, hostId, code) {
  return asUser(
    db,
    hostId,
    async (tx) => (await tx.query('select * from public.check_in_ticket($1)', [code])).rows[0],
    { commit: true }
  );
}

export async function undoCheckIn(db, hostId, code) {
  return asUser(
    db,
    hostId,
    async (tx) => (await tx.query('select public.undo_check_in($1) as ok', [code])).rows[0].ok,
    { commit: true }
  );
}

export async function eventCounts(db, eventId) {
  const { rows } = await db.query(
    'select rsvp_count, attended_count from public.events where id = $1',
    [eventId]
  );
  return rows[0];
}
