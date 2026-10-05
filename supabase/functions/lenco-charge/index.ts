// Called by the app, signed in. Secrets, set with `supabase secrets set`:
//   LENCO_API_TOKEN  Lenco secret API key
//   LENCO_API_URL    optional, only to point at a different Lenco base URL
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createLencoClient } from '../_shared/lenco.ts';
import { createOrderStore } from '../_shared/orderStore.ts';
import { handleCharge } from './handler.ts';

const apiToken = Deno.env.get('LENCO_API_TOKEN') ?? '';
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const store = createOrderStore(supabase);
const lenco = createLencoClient({ token: apiToken, baseUrl: Deno.env.get('LENCO_API_URL') || undefined });

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!apiToken) {
    console.error('LENCO_API_TOKEN is not set');
    return new Response(JSON.stringify({ error: 'not_configured', message: 'Payments are not switched on yet.' }), {
      status: 503,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  // The gateway has already checked the token's signature (verify_jwt); this
  // asks Auth who it belongs to.
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) {
    return new Response(JSON.stringify({ error: 'unauthorized', message: 'Sign in to pay.' }), {
      status: 401,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  try {
    return await handleCharge(req, { userId: data.user.id, store, lenco }, cors);
  } catch (err) {
    console.error('lenco charge crashed', err);
    return new Response(JSON.stringify({ error: 'error', message: 'Something went wrong. Try again.' }), {
      status: 500,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
});
