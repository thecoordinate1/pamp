// The points bridge between PAMP and UniHair, as plain functions with no Deno
// or Supabase imports, so Vitest can run them. UniHair's pamp-bridge function
// carries a copy of the signing half; keep the two in step.
//
// Every request is signed with HMAC-SHA256 over "<unix seconds>.<body>", using a
// secret both projects hold as POINTS_BRIDGE_SECRET. The secret itself never
// travels, and a captured request stops working after five minutes.
//
// Only UniHair answers bridge requests in this direction. PAMP asks it to link
// an account, read a balance, debit points (take) or say what happened to an
// earlier debit (check). Nothing can ask PAMP to add points: PAMP credits its
// own ledger only after UniHair confirms a debit, so a leaked secret could
// burn points but never create them.

export const UNIHAIR_BRIDGE_URL = 'https://mswbdibtcnilsvxxtrdy.supabase.co/functions/v1/pamp-bridge';
export const SIGNATURE_HEADER = 'x-bridge-signature';
export const MAX_SKEW_SECONDS = 300;

const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export async function signBridgeRequest(body: string, secret: string, nowSeconds: number): Promise<string> {
  return `t=${nowSeconds},v1=${await hmac(secret, `${nowSeconds}.${body}`)}`;
}

// True when the header is a signature of exactly this body, made with the
// secret, within MAX_SKEW_SECONDS of now.
export async function verifyBridgeRequest(
  body: string,
  header: string | null,
  secret: string,
  nowSeconds: number
): Promise<boolean> {
  if (!header || !secret || secret.length < 32) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const t = Number(parts.t);
  if (!Number.isInteger(t) || Math.abs(nowSeconds - t) > MAX_SKEW_SECONDS) return false;
  if (typeof parts.v1 !== 'string') return false;
  return safeEqual(parts.v1.toLowerCase(), await hmac(secret, `${t}.${body}`));
}

// --- Client -------------------------------------------------------------------

export class BridgeError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.name = 'BridgeError';
    this.code = code;
    this.status = status;
  }
}

// A definite answer from UniHair, as opposed to it being unreachable. A pull
// that gets a definite "no" can be marked failed at once; one that gets no
// answer has to be settled later.
export const isRefusal = (err: unknown) => err instanceof BridgeError && err.status >= 400 && err.status < 500;

// Link codes are 8 characters from the same alphabet as PAMP's invite codes
// (no 0/O or 1/I), shown as XXXX-XXXX. About 10^12 of them, single use, five
// minutes, with failed guesses throttled by UniHair: guessing one is not a way
// to link to a stranger's points.
export function normaliseLinkCode(typed: unknown): string | null {
  if (typeof typed !== 'string') return null;
  const code = typed.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-HJ-NP-Z2-9]{8}$/.test(code) ? code : null;
}

export type BridgeClient = {
  claim(input: { code: string; pampUser: string }): Promise<{ profileId: string; name: string }>;
  // UniHair's balance, how much of it may move to PAMP (points earned by using
  // UniHair, not sign-up or referral bonuses), and what a point is worth in ngwee.
  balance(input: {
    profileId: string;
    pampUser: string;
  }): Promise<{ balance: number; transferable: number; pointValueNgwee: number }>;
  take(input: { profileId: string; pampUser: string; points: number; ref: string; issuedAt: string }): Promise<number>;
  check(input: { ref: string }): Promise<{ taken: boolean; points: number | null }>;
  unlink(input: { profileId: string; pampUser: string }): Promise<void>;
};

export function createBridgeClient({
  secret,
  url = UNIHAIR_BRIDGE_URL,
  fetchFn = fetch,
  now = () => Math.floor(Date.now() / 1000),
}: {
  secret: string;
  url?: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}): BridgeClient {
  async function call(action: string, payload: Record<string, unknown>) {
    const body = JSON.stringify({ action, ...payload });
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: await signBridgeRequest(body, secret, now()) },
        body,
      });
    } catch (err) {
      throw new BridgeError('unreachable', 503, (err as Error)?.message);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.ok !== true) {
      throw new BridgeError(json?.error ?? 'bad_response', res.ok ? 502 : res.status, json?.message);
    }
    return json;
  }

  return {
    async claim({ code, pampUser }) {
      const r = await call('claim', { code, pamp_user: pampUser });
      return { profileId: r.profile_id, name: r.name ?? '' };
    },
    async balance({ profileId, pampUser }) {
      const r = await call('balance', { profile_id: profileId, pamp_user: pampUser });
      return {
        balance: Number(r.balance),
        transferable: Number(r.transferable ?? 0),
        pointValueNgwee: Number(r.point_value_ngwee),
      };
    },
    async take({ profileId, pampUser, points, ref, issuedAt }) {
      const r = await call('take', { profile_id: profileId, pamp_user: pampUser, points, ref, issued_at: issuedAt });
      return Number(r.balance);
    },
    async check({ ref }) {
      const r = await call('check', { ref });
      return { taken: r.taken === true, points: r.points ?? null };
    },
    async unlink({ profileId, pampUser }) {
      await call('unlink', { profile_id: profileId, pamp_user: pampUser });
    },
  };
}
