// Invite links: https://<site>/?event=<event id>&ref=<referral code>
//
// Opening one may happen long before the visitor signs up, and confirming an
// email returns them to the bare site, so the invite is kept on the phone until
// it has been used. Both parts are optional: a profile invite carries only ref.

import { safeStorage } from './safeStorage';

const STORAGE_KEY = 'pamp:invite';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// Mirrors the referral_code format check in the database.
export const REFERRAL_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function inviteUrl({ origin = globalThis.location?.origin, eventId, code } = {}) {
  const url = new URL('/', origin);
  if (eventId) url.searchParams.set('event', eventId);
  if (code) url.searchParams.set('ref', code);
  return url.toString();
}

export function readInvite(storage = safeStorage(), now = Date.now()) {
  if (!storage) return null;
  try {
    const invite = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
    if (!invite || !Number.isFinite(invite.at)) return null;
    if (now - invite.at > MAX_AGE_MS) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return invite;
  } catch {
    return null;
  }
}

// Best effort: where storage is blocked the invite still works for this visit,
// because the app keeps its own copy in memory.
export function saveInvite(invite, storage = safeStorage()) {
  if (!storage) return;
  try {
    if (invite?.eventId || invite?.ref) storage.setItem(STORAGE_KEY, JSON.stringify(invite));
    else storage.removeItem(STORAGE_KEY);
  } catch {
    // Full or blocked.
  }
}

// The invite without one of its parts, or null once nothing useful is left.
export function withoutInvitePart(invite, part) {
  if (!invite) return null;
  const next = { ...invite };
  delete next[part];
  return next.eventId || next.ref ? next : null;
}

// Reads ?event= and ?ref= from the address the app opened on, keeps them, and
// removes them from the address bar so a visitor who shares the page does not
// pass someone else's code along.
export function captureInvite({
  location = globalThis.location,
  history = globalThis.history,
  storage = safeStorage(),
  now = Date.now(),
} = {}) {
  if (!location) return null;
  const params = new URLSearchParams(location.search);
  const eventId = params.get('event');
  const ref = params.get('ref')?.trim().toUpperCase();

  if (params.has('event') || params.has('ref')) {
    params.delete('event');
    params.delete('ref');
    const query = params.toString();
    history?.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  }

  const found = {};
  if (eventId && UUID_RE.test(eventId)) found.eventId = eventId;
  if (ref && REFERRAL_CODE_RE.test(ref)) found.ref = ref;

  const stored = readInvite(storage, now);
  if (!found.eventId && !found.ref) return stored;

  // The newest link wins for whatever it carries, and is shown again even if
  // an earlier invite was dismissed.
  const invite = { ...stored, ...found, at: now };
  delete invite.dismissedAt;
  saveInvite(invite, storage);
  return invite;
}

// What signUp sends as options.data, for handle_new_user to record.
export function referralMetadata(invite) {
  if (!invite?.ref) return undefined;
  return invite.eventId
    ? { referral_code: invite.ref, referral_event: invite.eventId }
    : { referral_code: invite.ref };
}
