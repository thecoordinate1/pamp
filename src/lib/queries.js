import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import {
  eventToRow,
  rowToAttendee,
  rowToEvent,
  rowToGuestRequest,
  rowToMyRequest,
  rowToPass,
  rowToPointEntry,
  rowToPrivateDetails,
  rowToSharedPass,
} from './mappers';
import { readStoredPasses, storePasses } from './passes';
import { uploadSelfie } from './storage';
import { zambiaDateString } from './format';

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// Columns a migration adds may not exist yet, because the app can ship before
// the migration runs. PostgREST then rejects the whole select (42703, undefined
// column), so fall back to the columns that exist rather than take the screen
// down. Postgres checks the list before writing anything, so retrying an insert
// or update this way never applies it twice.
function withFallback(current, legacy) {
  let columns = current;
  return async (run) => {
    const result = await run(columns);
    if (result.error?.code === '42703' && columns !== legacy) {
      columns = legacy;
      return run(columns);
    }
    return result;
  };
}

const LEGACY_EVENT_COLUMNS =
  'id, host_id, name, category, status, starts_on, start_time, city, area, vibe,' +
  ' dress_code, description, image_url, host_display_name, organization,' +
  ' ticket_price_ngwee, currency, capacity, rsvp_count, vibe_score,' +
  ' area_latitude, area_longitude';
// attended_count arrives with migration 20261004000100.
const EVENT_COLUMNS = `${LEGACY_EVENT_COLUMNS}, attended_count`;
const withEventColumns = withFallback(EVENT_COLUMNS, LEGACY_EVENT_COLUMNS);

// Enough of an event to open its passes with no signal.
const PASS_EVENT_COLUMNS =
  'id, name, category, starts_on, start_time, city, area, image_url, host_display_name,' +
  ' ticket_price_ngwee, currency';
const LEGACY_PASS_COLUMNS = `id, code, status, checked_in_at, event_id, order_id, created_at, events:event_id (${PASS_EVENT_COLUMNS})`;
// shared_at arrives with migration 20261004000300.
const PASS_COLUMNS = `${LEGACY_PASS_COLUMNS}, shared_at`;
const withPassColumns = withFallback(PASS_COLUMNS, LEGACY_PASS_COLUMNS);

const LEGACY_PROFILE_FIELDS = 'display_name, headline, looking_for, social_platform, social_handle, avatar_path';
// username and the verified badge arrive with migration 20261005000200.
const PROFILE_FIELDS = `${LEGACY_PROFILE_FIELDS}, username, identity_verified_at`;
const withProfileFields = withFallback(PROFILE_FIELDS, LEGACY_PROFILE_FIELDS);
const profileEmbed = (fields) => `profiles:user_id (${fields})`;

const LEGACY_SETTINGS = 'fee_percent_bps, fee_fixed_ngwee';
const SETTINGS = `${LEGACY_SETTINGS}, points_per_attendance, points_per_referral, point_value_ngwee`;
const withSettingsColumns = withFallback(SETTINGS, LEGACY_SETTINGS);

// PostgREST's answers for a function or table a migration has not created yet.
const MISSING_FUNCTION = 'PGRST202';
const isMissingTable = (error) => error?.code === 'PGRST205' || error?.code === '42P01';

export const keys = {
  events: ['events'],
  event: (id) => ['events', id],
  eventPrivate: (id) => ['events', id, 'private'],
  attendees: (id) => ['events', id, 'attendees'],
  requests: (id) => ['events', id, 'requests'],
  // Keyed by user so one account's data can never be served to the next
  // person who signs in on the same phone.
  myRsvps: (userId) => ['me', userId, 'rsvps'],
  myProfile: (userId) => ['me', userId, 'profile'],
  passes: ['passes'],
  myPasses: (userId) => ['passes', userId],
  myReferral: (userId) => ['referral', userId],
  myPoints: (userId) => ['me', userId, 'points'],
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
            .gte('starts_on', zambiaDateString(-1))
            .order('starts_on', { ascending: true })
        )
      ).map(rowToEvent),
  });
}

// Every event this person hosts, whatever its date or status, for the host
// dashboard. The public list only carries upcoming published events.
export function useHostEvents(userId) {
  return useQuery({
    queryKey: ['events', 'hosted', userId],
    enabled: Boolean(userId),
    queryFn: async () =>
      unwrap(
        await withEventColumns((columns) =>
          supabase
            .from('events')
            .select(columns)
            .eq('host_id', userId)
            .order('starts_on', { ascending: false })
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
        await withProfileFields((fields) =>
          supabase
            .from('event_rsvps')
            .select(`user_id, show_publicly, featured_by_host, ${profileEmbed(fields)}`)
            .eq('event_id', eventId)
        )
      ).map(rowToAttendee),
  });
}

export function useMyRsvps(userId) {
  return useQuery({
    queryKey: keys.myRsvps(userId),
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
      qc.invalidateQueries({ queryKey: keys.myRsvps(userId) });
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
        await withProfileFields((fields) =>
          supabase
            .from('guest_requests')
            .select(`id, event_id, user_id, status, reason, selfie_path, created_at, ${profileEmbed(fields)}`)
            .in('event_id', eventIds)
            .order('created_at', { ascending: false })
        )
      ).map(rowToGuestRequest),
  });
}

// The requests this person has sent, with enough of each event to show it.
export function useMyGuestRequests(userId) {
  return useQuery({
    queryKey: ['requests', 'mine', userId],
    enabled: Boolean(userId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('guest_requests')
          .select(`id, event_id, status, reason, created_at, decided_at, events:event_id (${PASS_EVENT_COLUMNS})`)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      ).map(rowToMyRequest),
  });
}

// Signed links for photos in the private selfies bucket: profile pictures and
// the selfies sent with requests. Storage policies decide which come back, so
// a photo this person may not see is simply missing from the map.
export function usePhotoUrls(paths) {
  const list = [...new Set(paths.filter(Boolean))].sort();
  return useQuery({
    queryKey: ['photo-urls', list],
    enabled: list.length > 0,
    // Links last an hour; refresh well before they expire.
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('selfies').createSignedUrls(list, 3600);
      if (error) throw error;
      return new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
    },
  });
}

// What hosts have actually been paid for their passes, in ngwee: paid orders
// only, before PAMP's fee.
export function useHostRevenue(eventIds) {
  return useQuery({
    queryKey: ['host-revenue', eventIds],
    enabled: Array.isArray(eventIds) && eventIds.length > 0,
    queryFn: async () =>
      unwrap(
        await supabase.from('orders').select('subtotal_ngwee').in('event_id', eventIds).eq('status', 'paid')
      ).reduce((sum, r) => sum + (r.subtotal_ngwee ?? 0), 0),
  });
}

// Just the display name, which hosts see on requests and guest lists.
export function useSetDisplayName(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (displayName) =>
      unwrap(await supabase.from('profiles').update({ display_name: displayName }).eq('id', userId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.myProfile(userId) }),
  });
}

// Makes a new photo this person's profile picture. Changing it takes off the
// verified badge until an admin checks the new one.
export function useSetAvatar(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file) => {
      const path = await uploadSelfie(file, userId);
      unwrap(await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId));
      return path;
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['me', userId] }),
        // Lists that show this person's picture.
        qc.invalidateQueries({ queryKey: ['events'] }),
        qc.invalidateQueries({ queryKey: ['requests'] }),
      ]),
  });
}

// Null while the check is not available yet, so the form does not claim
// either way.
export function useUsernameAvailable(name) {
  return useQuery({
    queryKey: ['username-available', name],
    enabled: Boolean(name),
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('username_available', { p_username: name });
      if (error?.code === MISSING_FUNCTION) return null;
      if (error) throw error;
      return Boolean(data);
    },
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
    queryKey: keys.myProfile(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const rows = unwrap(
        await withProfileFields((fields) =>
          supabase.from('profiles').select(`id, host_status, ${fields}`).eq('id', userId).limit(1)
        )
      );
      return rows[0] ?? null;
    },
  });
}

// The photo an admin last looked at. When it is the current one and there is
// no badge, the check found no match.
export function useMyPhotoReview(userId) {
  return useQuery({
    queryKey: ['me', userId, 'photo-review'],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_private')
        .select('avatar_reviewed_path')
        .eq('user_id', userId)
        .limit(1);
      if (error?.code === '42703') return null;
      if (error) throw error;
      return data[0]?.avatar_reviewed_path ?? null;
    },
  });
}

// Fees and points rules. Everyone may read them.
export function usePlatformSettings(enabled = true) {
  return useQuery({
    queryKey: ['platform-settings'],
    enabled,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const rows = unwrap(
        await withSettingsColumns((columns) =>
          supabase.from('platform_settings').select(columns).eq('id', 1).limit(1)
        )
      );
      const r = rows[0] ?? {};
      return {
        feePercentBps: r.fee_percent_bps ?? 0,
        feeFixedNgwee: r.fee_fixed_ngwee ?? 0,
        pointsPerAttendance: r.points_per_attendance ?? null,
        pointsPerReferral: r.points_per_referral ?? null,
        pointValueNgwee: r.point_value_ngwee ?? null,
      };
    },
  });
}

// This person's points balance. Null until the points migration has run.
export function useMyPoints(userId) {
  return useQuery({
    queryKey: keys.myPoints(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_points');
      if (error?.code === MISSING_FUNCTION) return null;
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ? { balance: row.balance ?? 0, pointValueNgwee: row.point_value_ngwee ?? 10 } : null;
    },
  });
}

export function usePointHistory(userId, enabled = true) {
  return useQuery({
    queryKey: ['me', userId, 'points', 'history'],
    enabled: Boolean(userId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('point_entries')
        .select('id, kind, points, created_at, events:event_id (name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (isMissingTable(error)) return [];
      if (error) throw error;
      return data.map(rowToPointEntry);
    },
  });
}

// Ordering runs through a SECURITY DEFINER function: clients can read orders and
// tickets but never write them, so price, fees and paid status are set by the
// database rather than trusted from the browser.
export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, quantity, method, msisdn, points = 0 }) => {
      const args = {
        p_event_id: eventId,
        p_quantity: quantity,
        p_method: method ?? 'free',
        p_msisdn: msisdn ?? null,
      };
      // Sent only when used, so ordering still works before the points
      // migration adds the parameter.
      if (points > 0) args.p_points = points;
      const { data, error } = await supabase.rpc('create_order', args);
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
    // Returned so mutateAsync resolves only once the new pass has been fetched,
    // which lets the sheet go straight to showing it.
    onSuccess: (order) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.passes }),
        // Prefix invalidation: catches ['me', <userId>, 'rsvps'] for whoever
        // is signed in, without needing to know the userId here.
        qc.invalidateQueries({ queryKey: ['me'] }),
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

// The protect_profile_columns trigger blocks id, host_status, created_at and
// the verified badge for ordinary callers, so only the fields a person owns are
// sent here. The username is sent only when it changed, so saving still works
// before the migration that adds it.
export function useUpdateProfile(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) => {
      const changes = {
        display_name: fields.displayName ?? '',
        headline: fields.headline ?? '',
        looking_for: fields.lookingFor ?? '',
        social_platform: fields.socialPlatform || null,
        social_handle: fields.socialHandle ? fields.socialHandle.replace(/^@/, '') : null,
      };
      if (fields.username !== undefined) changes.username = fields.username || null;
      const rows = unwrap(
        await withProfileFields((columns) =>
          supabase.from('profiles').update(changes).eq('id', userId).select(`id, host_status, ${columns}`)
        )
      );
      return rows[0] ?? null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.myProfile(userId) });
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
        await withProfileFields((fields) =>
          supabase
            .from('tickets')
            .select(`id, code, status, checked_in_at, event_id, user_id, ${profileEmbed(fields)}`)
            .in('event_id', eventIds)
            .order('created_at', { ascending: false })
        )
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

// Profiles with a photo no admin has checked yet. Null until the migration runs.
export function useProfilesToVerify(enabled) {
  return useQuery({
    queryKey: ['admin', 'profiles-to-verify'],
    enabled: Boolean(enabled),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('profiles_to_verify');
      if (error?.code === MISSING_FUNCTION) return null;
      if (error) throw error;
      return data ?? [];
    },
  });
}

// True when recorded; false when the person changed their photo since the
// admin looked, so the queue reloads with the new one.
export function useReviewProfilePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, avatarPath, matches }) => {
      const { data, error } = await supabase.rpc('review_profile_photo', {
        p_user: userId,
        p_avatar_path: avatarPath,
        p_matches: matches,
      });
      if (error) throw error;
      return Boolean(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'profiles-to-verify'] }),
  });
}
