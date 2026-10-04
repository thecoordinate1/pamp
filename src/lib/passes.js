// The signed-in person's passes, grouped and summarised for the UI, plus a copy
// kept on the phone so a pass can still be shown at the door with no signal.
import { safeStorage } from './safeStorage';

const STORAGE_PREFIX = 'pamp:passes:';

export function groupPassesByEvent(passes = []) {
  const byEvent = new Map();
  for (const pass of passes) {
    const list = byEvent.get(pass.eventId);
    if (list) list.push(pass);
    else byEvent.set(pass.eventId, [pass]);
  }
  return byEvent;
}

export function summarisePasses(passes = []) {
  const checkedIn = passes.filter((p) => p.status === 'checked_in').length;
  return {
    count: passes.length,
    checkedIn,
    attended: checkedIn > 0,
    allIn: passes.length > 0 && checkedIn === passes.length,
  };
}

const storageKey = (userId) => `${STORAGE_PREFIX}${userId}`;

export function readStoredPasses(userId, storage = safeStorage()) {
  if (!userId || !storage) return undefined;
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(userId)) ?? 'null');
    return Array.isArray(parsed?.passes) && Number.isFinite(parsed?.savedAt) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function storePasses(userId, passes, storage = safeStorage(), now = Date.now()) {
  if (!userId || !storage) return;
  try {
    storage.setItem(storageKey(userId), JSON.stringify({ savedAt: now, passes }));
  } catch {
    // Storage full or blocked: the copy from the network still works.
  }
}

// Called on sign-out, so the next person on a shared phone never sees them.
export function forgetStoredPasses(storage = safeStorage()) {
  if (!storage) return;
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  } catch {
    // Nothing stored, or storage blocked.
  }
}
