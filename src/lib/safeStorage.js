// localStorage, or null where it is unavailable. Merely reading
// window.localStorage throws when a browser blocks site data (Safari's "Block
// All Cookies", some in-app browsers), so every caller goes through here and
// copes with null rather than taking the whole app down.
export function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
