// Mirrors public.is_valid_username in 20261005000200: 3 to 20 of a-z, 0-9, _
// and ., not starting or ending with a dot, no two dots together, and nothing
// that could pass for PAMP, UniHair or staff. The database has the final say.
const SHAPE = /^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/;
const RESERVED = new Set([
  'admin', 'administrator', 'support', 'help', 'host', 'hosts', 'official',
  'team', 'staff', 'moderator', 'mod', 'root', 'system', 'null', 'undefined',
  'me', 'everyone', 'verified',
]);

// What someone types, reduced to what a username can hold: lower case, no @,
// and only the characters allowed.
export const cleanUsername = (typed) =>
  (typed ?? '').trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);

export function usernameProblem(name) {
  if (!name) return null;
  if (name.length < 3) return 'Use at least 3 characters.';
  if (!SHAPE.test(name) || name.includes('..')) {
    return 'Use letters, numbers, _ and single dots, not at the start or end.';
  }
  if (/(pamp|unihair)/.test(name) || RESERVED.has(name)) return 'That name is reserved.';
  return null;
}
