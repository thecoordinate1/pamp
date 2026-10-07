// What the signed-in PAMP app asks about the person's UniHair link: link with a
// code, see both balances, pull UniHair points into PAMP, or unlink. Only
// UniHair is asked to move points out; PAMP credits itself only after UniHair
// confirms the debit.
import { type BridgeClient, BridgeError, isRefusal, normaliseLinkCode } from '../_shared/bridge.ts';

export type Link = { unihairProfileId: string; unihairName: string };
export type Transfer = { ref: string; points: number; createdAt: string };

// The database side, backed by the service role in index.ts and faked in tests.
export type LinkStore = {
  getLink(userId: string): Promise<Link | null>;
  link(userId: string, profileId: string, name: string): Promise<void>;
  unlink(userId: string): Promise<void>;
  balance(userId: string): Promise<number>;
  // What a PAMP point is worth in ngwee (platform_settings.point_value_ngwee).
  pointValue(): Promise<number>;
  beginTransfer(userId: string, points: number): Promise<Transfer>;
  finishTransfer(ref: string, taken: boolean): Promise<number>;
  pendingTransfers(userId: string): Promise<Transfer[]>;
};

// UniHair refuses a debit issued more than 90 seconds ago, so a pull still
// unanswered after three minutes can be called off safely.
export const GIVE_UP_AFTER_MS = 3 * 60 * 1000;

const MESSAGES: Record<string, string> = {
  invalid_code: 'That code is wrong or has expired. Get a new one in UniHair.',
  too_many_attempts: 'Too many wrong codes. Wait a few minutes, then get a new code in UniHair.',
  rates_differ: 'UniHair points cannot be used here right now. Try again later.',
  already_linked: 'That UniHair account is already linked to another PAMP account.',
  not_linked: 'Your UniHair account is no longer linked. Link it again with a new code.',
  insufficient:
    'Your UniHair account does not have that many points to use here. Points from bookings and delivered orders count; sign-up and referral bonuses stay in UniHair.',
  relink_cooldown: 'This PAMP account linked another UniHair account recently. You can link a different one a week after that.',
  suspended: 'Your UniHair account is suspended, so its points cannot be moved.',
  daily_limit: 'That is more UniHair points than can be moved in one day. Try fewer.',
};

const json = (status: number, body: Record<string, unknown>, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } });

// Pulls that never got an answer: ask UniHair what happened to each one.
export async function settlePending(
  userId: string,
  { store, bridge, now }: { store: LinkStore; bridge: BridgeClient; now: () => number }
) {
  for (const t of await store.pendingTransfers(userId)) {
    try {
      const { taken } = await bridge.check({ ref: t.ref });
      if (taken) await store.finishTransfer(t.ref, true);
      else if (now() - Date.parse(t.createdAt) > GIVE_UP_AFTER_MS) await store.finishTransfer(t.ref, false);
    } catch (err) {
      // UniHair is unreachable: leave it for next time.
      console.error('could not settle transfer', t.ref, err);
    }
  }
}

export async function handleUnihairLink(
  req: Request,
  {
    userId,
    store,
    bridge,
    now = () => Date.now(),
  }: { userId: string; store: LinkStore; bridge: BridgeClient; now?: () => number },
  headers: Record<string, string> = {}
): Promise<Response> {
  const reply = (status: number, body: Record<string, unknown>) => json(status, body, headers);
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  let body: { action?: unknown; code?: unknown; points?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'bad_request' });
  }

  const refused = (err: BridgeError) =>
    reply(409, { error: err.code, message: MESSAGES[err.code] ?? 'UniHair said no. Try again.' });
  const unreachable = () =>
    reply(502, { error: 'unreachable', message: 'UniHair is not answering right now. Try again in a moment.' });

  try {
    switch (body.action) {
      case 'status': {
        const link = await store.getLink(userId);
        const pamp = await store.balance(userId);
        if (!link) return reply(200, { linked: false, pamp });
        await settlePending(userId, { store, bridge, now });
        try {
          // What can be used on PAMP, not everything the UniHair account holds.
          const { transferable: unihair } = await bridge.balance({ profileId: link.unihairProfileId, pampUser: userId });
          return reply(200, { linked: true, name: link.unihairName, pamp: await store.balance(userId), unihair });
        } catch (err) {
          if (err instanceof BridgeError && err.code === 'not_linked') {
            // Unlinked from the UniHair side: forget it here too.
            await store.unlink(userId);
            return reply(200, { linked: false, pamp });
          }
          // Still linked, but the UniHair figure is unknown for now.
          return reply(200, { linked: true, name: link.unihairName, pamp: await store.balance(userId), unihair: null });
        }
      }

      case 'link': {
        const code = normaliseLinkCode(body.code);
        if (!code) {
          return reply(400, { error: 'bad_code', message: 'Enter the 8-character code from UniHair, like K7QX-4M2P.' });
        }
        if (await store.getLink(userId)) {
          return reply(409, { error: 'already_linked_here', message: 'This PAMP account is already linked. Unlink it first.' });
        }
        const { profileId, name } = await bridge.claim({ code, pampUser: userId });
        await store.link(userId, profileId, name);
        const unihair = await bridge
          .balance({ profileId, pampUser: userId })
          .then((r) => r.transferable)
          .catch(() => null);
        return reply(200, { linked: true, name, pamp: await store.balance(userId), unihair });
      }

      case 'pull': {
        const points = body.points;
        if (typeof points !== 'number' || !Number.isInteger(points) || points < 1 || points > 100000) {
          return reply(400, { error: 'bad_points', message: 'Choose how many points to move.' });
        }
        const link = await store.getLink(userId);
        if (!link) return reply(409, { error: 'not_linked', message: MESSAGES.not_linked });

        // A point has to be worth the same in both apps, or moving them would
        // make or lose money. Checked before anything moves.
        const remote = await bridge.balance({ profileId: link.unihairProfileId, pampUser: userId });
        if (remote.pointValueNgwee !== (await store.pointValue())) {
          console.error('point values differ', remote.pointValueNgwee);
          return refused(new BridgeError('rates_differ', 409));
        }
        if (remote.transferable < points) return refused(new BridgeError('insufficient', 409));

        const transfer = await store.beginTransfer(userId, points);
        let unihair: number;
        try {
          unihair = await bridge.take({
            profileId: link.unihairProfileId,
            pampUser: userId,
            points,
            ref: transfer.ref,
            issuedAt: transfer.createdAt,
          });
        } catch (err) {
          if (isRefusal(err)) {
            await store.finishTransfer(transfer.ref, false);
            if ((err as BridgeError).code === 'not_linked') await store.unlink(userId);
            return refused(err as BridgeError);
          }
          // No answer: the debit may or may not have happened. settlePending
          // finds out on the next status call.
          console.error('pull unanswered', transfer.ref, err);
          return unreachable();
        }
        const pamp = await store.finishTransfer(transfer.ref, true);
        return reply(200, { moved: points, pamp, unihair });
      }

      case 'unlink': {
        const link = await store.getLink(userId);
        if (link) {
          try {
            await bridge.unlink({ profileId: link.unihairProfileId, pampUser: userId });
          } catch (err) {
            // UniHair checks the link on every request, so a stale one there
            // cannot move points; it is cleared the next time the person links.
            console.error('could not tell UniHair about the unlink', err);
          }
          await store.unlink(userId);
        }
        return reply(200, { linked: false });
      }

      default:
        return reply(400, { error: 'bad_request' });
    }
  } catch (err) {
    if (isRefusal(err)) return refused(err as BridgeError);
    if (err instanceof BridgeError) return unreachable();
    throw err;
  }
}
