import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import {
  eventToRow,
  rowToAttendee,
  rowToEvent,
  rowToGuestRequest,
  rowToPrivateDetails,
} from './mappers';

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const EVENT_COLUMNS =
  'id, host_id, name, category, status, starts_on, start_time, city, area, vibe,' +
  ' dress_code, description, image_url, host_display_name, organization,' +
  ' ticket_price_ngwee, currency, capacity, rsvp_count, vibe_score,' +
  ' area_latitude, area_longitude';

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
  myTickets: ['me', 'tickets'],
};

export function useEvents() {
  return useQuery({
    queryKey: keys.events,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('events')
          .select(EVENT_COLUMNS)
          .eq('status', 'published')
          .order('starts_on', { ascending: true })
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
        await supabase.from('events').insert(eventToRow(evt, userId)).select(EVENT_COLUMNS)
      );
      const created = rowToEvent(rows[0]);
      if (evt.fullAddress || evt.whatsapp) {
        unwrap(
          await supabase.from('event_private').insert({
            event_id: created.id,
            full_address: evt.fullAddress ?? '',
            host_whatsapp: evt.whatsapp || null,
          })
        );
      }
      return created;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.events }),
  });
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
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: keys.myTickets });
      qc.invalidateQueries({ queryKey: keys.myRsvps });
      qc.invalidateQueries({ queryKey: keys.events });
      if (order?.event_id) {
        qc.invalidateQueries({ queryKey: keys.attendees(order.event_id) });
      }
    },
  });
}

export function useOrderTickets(orderId) {
  return useQuery({
    queryKey: ['orders', orderId, 'tickets'],
    enabled: Boolean(orderId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('tickets')
          .select('id, code, status, event_id, order_id')
          .eq('order_id', orderId)
          .order('created_at', { ascending: true })
      ),
  });
}

export function useMyTickets(userId) {
  return useQuery({
    queryKey: keys.myTickets,
    enabled: Boolean(userId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('tickets')
          .select('id, code, status, checked_in_at, events:event_id (id, name, starts_on, start_time, area, image_url)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      ),
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
