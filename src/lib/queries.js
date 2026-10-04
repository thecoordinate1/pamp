import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import {
  eventToRow,
  rowToAttendee,
  rowToEvent,
  rowToGuestRequest,
  rowToPass,
  rowToPrivateDetails,
  rowToSharedPass,
} from './mappers';
import { readStoredPasses, storePasses } from './passes';

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const LEGACY_EVENT_COLUMNS =
  'id, host_id, name, category, status, starts_on, start_time, city, area, vibe,' +
  ' dress_code, description, image_url, host_display_name, organization,' +
  ' ticket_price_ngwee, currency, capacity, rsvp_count, vibe_score,' +
  ' area_latitude, area_longitude';
const EVENT_COLUMNS = `${LEGACY_EVENT_COLUMNS}, attended_count`;

// attended_count arrives with migration 20261004000100. If the app is deployed
// before that migration has run, PostgREST rejects the whole select (42703,
// undefined column), so fall back to the columns that exist rather than take
// the event list down. Postgres checks the list before writing anything, so
// retrying an insert or update this way never applies it twice.
let eventColumns = EVENT_COLUMNS;
async function withEventColumns(run) {
  const result = await run(eventColumns);
  if (result.error?.code === '42703' && eventColumns !== LEGACY_EVENT_COLUMNS) {
    eventColumns = LEGACY_EVENT_COLUMNS;
    return run(eventColumns);
  }
  return result;
}

// Enough of an event to open its passes with no signal.
const PASS_EVENT_COLUMNS =
  'id, name, category, starts_on, start_time, city, area, image_url, host_display_name,' +
  ' ticket_price_ngwee, currency';
const LEGACY_PASS_COLUMNS = `id, code, status, checked_in_at, event_id, order_id, created_at, events:event_id (${PASS_EVENT_COLUMNS})`;
// shared_at arrives with migration 20261004000300: same fallback as events.
const PASS_COLUMNS = `${LEGACY_PASS_COLUMNS}, shared_at`;
let passColumns = PASS_COLUMNS;
async function withPassColumns(run) {
  const result = await run(passColumns);
  if (result.error?.code === '42703' && passColumns !== LEGACY_PASS_COLUMNS) {
    passColumns = LEGACY_PASS_COLUMNS;
    return run(passColumns);
  }
  return result;
}

const PROFILE_EMBED =
  'profiles:user_id (display_name, headline, looking_for, social_platform, social_handle, avatar_path)';

export const keys = {
  events: ['events'],
  event: (id) => ['events', id],
  eventPrivate: (id) => ['events', id, 'private'],
  attendees: (id) => ['events', id, 'attendees'],
  requests: (id) => ['events', id, 'requests'],
  myRsvps: ['me', 'rsvps'],
  myProfile: ['me', 'profile'],
  // Keyed by user so one account's passes can never be served to the next
  // person who signs in on the same phone.
  passes: ['passes'],
  myPasses: (userId) => ['passes', userId],
  myReferral: (userId) => ['referral', userId],
};

export function useEvents() {
  return useQuery({
    queryKey: keys.events,
    queryFn: async () =>
      unwrap(
        await withEventColumns((columns) =>
          supabase
            .from('events')
            .select(columns)
            .eq('status', 'published')
            .order('starts_on', { ascending: true })
        )
      ).map(rowToEvent),
  });
}

// Exact address and host contact. RLS returns nothing unless the viewer is the
// host, an approved guest or a ticket holder, so an empty result is a legitimate
// "not allowed yet" rather than an error.
export function useEventPrivate(eventId, enabled = true) {
  return useQuery({
    queryKey: keys.eventPrivate(eventId),
    enabled: Boolean(eventId) && enabled,
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from('event_private')
          .select('full_address, latitude, longitude, host_whatsapp')
          .eq('event_id', eventId)
          .limit(1)
      );
      return rows.length ? rowToPrivateDetails(rows[0]) : null;
    },
  });
}

export function useAttendees(eventId) {
  return useQuery({
    queryKey: keys.attendees(eventId),
    enabled: Boolean(eventId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('event_rsvps')
          .select(`user_id, show_publicly, featured_by_host, ${PROFILE_EMBED}`)
          .eq('event_id', eventId)
      ).map(rowToAttendee),
  });
}

export function useMyRsvps(userId) {
  return useQuery({
    queryKey: keys.myRsvps,
    enabled: Boolean(userId),
    queryFn: async () => {
      const rows = unwrap(
        await supabase.from('event_rsvps').select('event_id').eq('user_id', userId)
      );
      return new Set(rows.map((r) => r.event_id));
    },
  });
}

export function useToggleRsvp(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, isAttending }) => {
      if (isAttending) {
        return unwrap(
          await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('user_id', userId)
        );
      }
      return unwrap(
        await supabase.from('event_rsvps').insert({ event_id: eventId, user_id: userId })
      );
    },
    onSuccess: (_data, { eventId }) => {
      qc.invalidateQueries({ queryKey: keys.myRsvps });
      qc.invalidateQueries({ queryKey: keys.events });
      qc.invalidateQueries({ queryKey: keys.attendees(eventId) });
    },
  });
}

// The attendee's own opt-in. The host's featured_by_host flag is a separate
// mutation because the database blocks each side from writing the other's column.
export function useSetAttendeeVisibility(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, showPublicly }) =>
      unwrap(
        await supabase
          .from('event_rsvps')
          .update({ show_publicly: showPublicly })
          .eq('event_id', eventId)
          .eq('user_id', userId)
      ),
    onSuccess: (_d, { eventId }) => qc.invalidateQueries({ queryKey: keys.attendees(eventId) }),
  });
}

export function useFeatureAttendee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, attendeeId, featured }) =>
      unwrap(
        await supabase
          .from('event_rsvps')
          .update({ featured_by_host: featured })
          .eq('event_id', eventId)
          .eq('user_id', attendeeId)
      ),
    onSuccess: (_d, { eventId }) => qc.invalidateQueries({ queryKey: keys.attendees(eventId) }),
  });
}

export function useCreateEvent(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (evt) => {
      const rows = unwrap(
        await withEventColumns((columns) =>
          supabase.from('events').insert(eventToRow(evt, userId)).select(columns)
        )
      );
      const created = rowToEvent(rows[0]);
      const details = privateDetailsRow(evt);
      if (details) {
        unwrap(await supabase.from('event_private').insert({ event_id: created.id, ...details }));
      }
      return created;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.events }),
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, changes }) => {
      const rows = unwrap(
        await withEventColumns((columns) =>
          supabase
            .from('events')
            .update(eventToRow(changes, changes.hostId))
            .eq('id', id)
            .select(columns)
        )
      );
      // Upsert private details so the host can add or change the location later.
      // Only fields the host filled in are sent, so a blank never wipes one.
      const details = privateDetailsRow(changes);
      if (details) {
        unwrap(
          await supabase
            .from('event_private')
            .upsert({ event_id: id, ...details }, { onConflict: 'event_id' })
        );
      }
      return rowToEvent(rows[0]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.events }),
  });
}

// The exact location and host contact as columns, leaving out anything blank.
// Coordinates written here also move the event's public, rounded point.
function privateDetailsRow({ fullAddress, whatsapp, coordinates } = {}) {
  const row = {};
  if (fullAddress?.trim()) row.full_address = fullAddress.trim();
  if (whatsapp?.trim()) row.host_whatsapp = whatsapp.trim();
  if (Array.isArray(coordinates) && coordinates.length === 2) {
    [row.latitude, row.longitude] = coordinates;
  }
  return Object.keys(row).length ? row : null;
}

export function useGuestRequests(eventIds) {
  return useQuery({
    queryKey: ['requests', eventIds],
    enabled: Array.isArray(eventIds) && eventIds.length > 0,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('guest_requests')
          .select(`id, event_id, user_id, status, reason, selfie_path, created_at, ${PROFILE_EMBED}`)
          .in('event_id', eventIds)
          .order('created_at', { ascending: false })
      ).map(rowToGuestRequest),
  });
}

export function useCreateGuestRequest(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, reason, selfiePath }) =>
      unwrap(
        await supabase.from('guest_requests').insert({
          event_id: eventId,
          user_id: userId,
          reason: reason ?? '',
          selfie_path: selfiePath ?? null,
        })
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  });
}

export function useDecideGuestRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }) =>
      unwrap(
        await supabase
          .from('guest_requests')
          .update({ status, decided_at: new Date().toISOString() })
          .eq('id', id)
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  });
}

export function useMyProfile(userId) {
  return useQuery({
    queryKey: keys.myProfile,
    enabled: Boolean(userId),
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from('profiles')
          .select('id, display_name, headline, looking_for, social_platform, social_handle, avatar_path, host_status')
          .eq('id', userId)
          .limit(1)
      );
      return rows[0] ?? null;
    },
  });
}

// Ordering runs through a SECURITY DEFINER function: clients can read orders and
// tickets but never write them, so price, fees and paid status are set by the
// database rather than trusted from the browser.
export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, quantity, method, msisdn }) => {
      const { data, error } = await supabase.rpc('create_order', {
        p_event_id: eventId,
        p_quantity: quantity,
        p_method: method ?? 'free',
        p_msisdn: msisdn ?? null,
      });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
    // Returned so mutateAsync resolves only once the new pass has been fetched,
    // which lets the sheet go straight to showing it.
    onSuccess: (order) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.passes }),
        qc.invalidateQueries({ queryKey: keys.myRsvps }),
        qc.invalidateQueries({ queryKey: keys.events }),
        order?.event_id ? qc.invalidateQueries({ queryKey: keys.attendees(order.event_id) }) : null,
      ]),
  });
}

// Everything this person holds a pass for, each with enough of its event to
// open it. The last copy fetched is kept on the phone and shown straight away,
// so a pass still opens at the door with no signal and no event list. With
// `watchEventId`, it polls while any pass for that event is still unscanned,
// so the host's scan shows on the guest's phone within seconds. `fetch: false`
// shows only the saved copy: for someone whose session could not be refreshed
// offline, where a fetch would come back empty and overwrite it.
export function useMyPasses(userId, { watchEventId, fetch = true } = {}) {
  return useQuery({
    queryKey: keys.myPasses(userId),
    enabled: Boolean(userId) && fetch,
    queryFn: async () => {
      const passes = unwrap(
        await withPassColumns((columns) =>
          supabase
            .from('tickets')
            .select(columns)
            .eq('user_id', userId)
            .neq('status', 'void')
            .order('created_at', { ascending: true })
        )
      ).map(rowToPass);
      storePasses(userId, passes);
      return passes;
    },
    initialData: () => readStoredPasses(userId)?.passes,
    initialDataUpdatedAt: () => readStoredPasses(userId)?.savedAt,
    refetchInterval: watchEventId
      ? (query) => {
          const waiting = (query.state.data ?? []).some(
            (p) => p.eventId === watchEventId && p.status !== 'checked_in'
          );
          return waiting ? 5000 : false;
        }
      : false,
  });
}

// The private link for one of this person's unused passes. The same pass always
// gives the same link until it is taken back.
export function useSharePass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code) => {
      const { data, error } = await supabase.rpc('share_pass', { p_code: code });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.passes });
    },
  });
}

// For a pass sent to the wrong person: a new code, so the link and QR already
// sent stop working.
export function useReclaimPass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code) => {
      const { data, error } = await supabase.rpc('reclaim_pass', { p_code: code });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.passes }),
  });
}

// A pass someone sent this person, by its link token. Works signed out, and
// polls until the pass is used, so the card turns over when the door scans it.
export function useSharedPass(token, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['shared-pass', token],
    enabled: Boolean(token) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('view_shared_pass', { p_token: token });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ? rowToSharedPass(row) : null;
    },
    refetchInterval: (query) => (query.state.data?.pass.status === 'valid' ? 5000 : false),
  });
}

// Exact locations for the given events. RLS returns rows only where this person
// may see them (host, approved guest, pass holder), so asking is always safe.
export function useRevealedLocations(eventIds, enabled) {
  const ids = [...eventIds].sort();
  return useQuery({
    queryKey: ['revealed-locations', ids],
    enabled: Boolean(enabled) && ids.length > 0,
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from('event_private')
          .select('event_id, full_address, latitude, longitude')
          .in('event_id', ids)
      );
      return new Map(rows.map((r) => [r.event_id, rowToPrivateDetails(r)]));
    },
  });
}

// The person's own invite code, and how many people have joined with it.
export function useMyReferral(userId) {
  return useQuery({
    queryKey: keys.myReferral(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const rows = unwrap(
        await supabase.from('account_private').select('referral_code').eq('user_id', userId).limit(1)
      );
      const { count, error } = await supabase
        .from('referrals')
        .select('referred_id', { count: 'exact', head: true })
        .eq('referrer_id', userId);
      if (error) throw error;
      return { code: rows[0]?.referral_code ?? null, joined: count ?? 0 };
    },
  });
}

// The protect_profile_columns trigger blocks id, host_status and created_at for
// ordinary callers, so only the fields a person owns are sent here.
export function useUpdateProfile(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) => {
      const rows = unwrap(
        await supabase
          .from('profiles')
          .update({
            display_name: fields.displayName ?? '',
            headline: fields.headline ?? '',
            looking_for: fields.lookingFor ?? '',
            social_platform: fields.socialPlatform || null,
            social_handle: fields.socialHandle ? fields.socialHandle.replace(/^@/, '') : null,
          })
          .eq('id', userId)
          .select('id, display_name, headline, looking_for, social_platform, social_handle, avatar_path, host_status')
      );
      return rows[0] ?? null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.myProfile });
      // Attendee lists render these fields, so they are now stale.
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

// Check-in goes through a SECURITY DEFINER function because clients hold only
// SELECT on tickets. The function verifies the caller hosts the event.
export function useCheckInTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code) => {
      const { data, error } = await supabase.rpc('check_in_ticket', { p_code: code });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('No pass with that code');
      return row;
    },
    // Not awaited: the result shows at the door straight away, and the counts
    // catch up behind it.
    onSuccess: () => {
      invalidateAttendance(qc);
    },
  });
}

export function useUndoCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code) => {
      const { data, error } = await supabase.rpc('undo_check_in', { p_code: code });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateAttendance(qc);
    },
  });
}

// A check-in moves the door list, the event's attended count, and the pass
// itself when hosts scan their own.
function invalidateAttendance(qc) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['event-tickets'] }),
    qc.invalidateQueries({ queryKey: keys.events }),
    qc.invalidateQueries({ queryKey: keys.passes }),
  ]);
}

// Hosts can read tickets for their own events, so the door list is a plain query.
export function useEventTickets(eventIds) {
  return useQuery({
    queryKey: ['event-tickets', eventIds],
    enabled: Array.isArray(eventIds) && eventIds.length > 0,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('tickets')
          .select(`id, code, status, checked_in_at, event_id, user_id, ${PROFILE_EMBED}`)
          .in('event_id', eventIds)
          .order('created_at', { ascending: false })
      ),
  });
}

// The admin flag lives on account_private, which useMyProfile does not read.
// RLS lets a user read their own row, so no special privilege is needed here.
export function useIsAdmin(userId) {
  return useQuery({
    queryKey: ['me', 'is-admin'],
    enabled: Boolean(userId),
    queryFn: async () => {
      const rows = unwrap(
        await supabase.from('account_private').select('is_admin').eq('user_id', userId).limit(1)
      );
      return Boolean(rows[0]?.is_admin);
    },
  });
}

// These three raise 'Admins only' for anyone else, so they are only enabled
// once the flag has come back true.
export function usePlatformStats(enabled) {
  return useQuery({
    queryKey: ['admin', 'stats'],
    enabled: Boolean(enabled),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('platform_stats');
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
  });
}

export function usePlatformEvents(enabled) {
  return useQuery({
    queryKey: ['admin', 'events'],
    enabled: Boolean(enabled),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('platform_event_breakdown');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePlatformSignups(enabled, days = 30) {
  return useQuery({
    queryKey: ['admin', 'signups', days],
    enabled: Boolean(enabled),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('platform_signups', { p_days: days });
      if (error) throw error;
      return data ?? [];
    },
  });
}
