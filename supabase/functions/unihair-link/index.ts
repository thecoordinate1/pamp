// Called by the signed-in app. Secrets, set in the dashboard (Edge Functions,
// Secrets) or with `supabase secrets set`:
//   POINTS_BRIDGE_SECRET  shared with UniHair's pamp-bridge function; at least
//                         32 characters. Until it is set, linking is switched off.
//   UNIHAIR_BRIDGE_URL    optional, to point at a different UniHair project
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createBridgeClient } from '../_shared/bridge.ts';
import { createLinkStore } from '../_shared/linkStore.ts';
import { handleUnihairLink } from './handler.ts';

const secret = Deno.env.get('POINTS_BRIDGE_SECRET') ?? '';
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const store = createLinkStore(supabase);
const bridge = createBridgeClient({ secret, url: Deno.env.get('UNIHAIR_BRIDGE_URL') || undefined });

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (secret.length < 32) {
    console.error('POINTS_BRIDGE_SECRET is not set');
    return reply(503, { error: 'not_configured', message: 'Linking UniHair is not switched on yet.' });
  }

  // The gateway has checked the token's signature (verify_jwt); this asks Auth
  // whose it is.
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) return reply(401, { error: 'unauthorized', message: 'Sign in first.' });

  try {
    return await handleUnihairLink(req, { userId: data.user.id, store, bridge }, cors);
  } catch (err) {
    console.error('unihair-link crashed', err);
    return reply(500, { error: 'error', message: 'Something went wrong. Try again.' });
  }
});
