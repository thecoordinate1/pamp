// The database speaks snake_case and stores money in ngwee; the UI speaks
// camelCase and shows kwacha. Every conversion between the two lives here so the
// components never have to know which side they are talking to.

export const ngweeToZmw = (ngwee) => (ngwee ?? 0) / 100;
export const zmwToNgwee = (zmw) => Math.round((Number(zmw) || 0) * 100);

export function rowToEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    hostId: row.host_id,
    name: row.name,
    category: row.category,
    status: row.status,
    date: row.starts_on,
    time: row.start_time,
    city: row.city,
    area: row.area,
    vibe: row.vibe,
    dressCode: row.dress_code,
    description: row.description,
    image: row.image_url,
    host: row.host_display_name,
    organization: row.organization,
    ticketPrice: ngweeToZmw(row.ticket_price_ngwee),
    currency: row.currency,
    capacity: row.capacity,
    rsvpCount: row.rsvp_count ?? 0,
    vibeScore: row.vibe_score,
    // Neighbourhood-level only. The exact point lives in event_private and is
    // fetched separately by people who are allowed to see it.
    coordinates:
      row.area_latitude != null && row.area_longitude != null
        ? [row.area_latitude, row.area_longitude]
        : null,
  };
}

export function eventToRow(evt, hostId) {
  return {
    host_id: hostId,
    name: evt.name,
    category: evt.category,
    starts_on: evt.date,
    start_time: evt.time,
    city: evt.city,
    area: evt.area,
    vibe: evt.vibe,
    dress_code: evt.dressCode ?? '',
    description: evt.description ?? '',
    image_url: evt.image ?? '',
    host_display_name: evt.host ?? '',
    organization: evt.organization || null,
    ticket_price_ngwee: zmwToNgwee(evt.ticketPrice),
  };
}

export function rowToPrivateDetails(row) {
  if (!row) return null;
  return {
    fullAddress: row.full_address,
    whatsapp: row.host_whatsapp,
    coordinates:
      row.latitude != null && row.longitude != null ? [row.latitude, row.longitude] : null,
  };
}

const socialUrl = (platform, handle) => {
  if (!platform || !handle) return null;
  const h = handle.replace(/^@/, '');
  switch (platform) {
    case 'instagram': return `https://instagram.com/${h}`;
    case 'tiktok': return `https://tiktok.com/@${h}`;
    case 'x': return `https://x.com/${h}`;
    case 'snapchat': return `https://snapchat.com/add/${h}`;
    case 'facebook': return `https://facebook.com/${h}`;
    case 'whatsapp': return `https://wa.me/${h.replace(/[^0-9]/g, '')}`;
    default: return null;
  }
};

export function rowToAttendee(row) {
  const p = row.profiles ?? {};
  return {
    userId: row.user_id,
    name: p.display_name || 'Guest',
    role: p.headline || '',
    lookingToConnect: p.looking_for || '',
    socialPlatform: p.social_platform || null,
    socialHandle: p.social_handle || null,
    socialUrl: socialUrl(p.social_platform, p.social_handle),
    avatarPath: p.avatar_path || null,
    showPublicly: row.show_publicly,
    featuredByHost: row.featured_by_host,
  };
}

export function rowToGuestRequest(row) {
  const p = row.profiles ?? {};
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    status: row.status,
    reason: row.reason || '',
    selfiePath: row.selfie_path || null,
    createdAt: row.created_at,
    userName: p.display_name || 'Guest',
    userRole: p.headline || '',
    userSocial: socialUrl(p.social_platform, p.social_handle),
  };
}
