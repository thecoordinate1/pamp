// Secrets, set with `supabase secrets set`:
//   LENCO_API_TOKEN  Lenco secret API key. Also derives the webhook signing key.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase itself.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createLencoClient } from '../_shared/lenco.ts';
import { createOrderStore } from '../_shared/orderStore.ts';
import { handleWebhook } from './handler.ts';

const apiToken = Deno.env.get('LENCO_API_TOKEN') ?? '';
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const store = createOrderStore(supabase);
const lenco = createLencoClient({ token: apiToken, baseUrl: Deno.env.get('LENCO_API_URL') || undefined });

Deno.serve(async (req) => {
  if (!apiToken) {
    console.error('LENCO_API_TOKEN is not set');
    return new Response('not configured', { status: 503 });
  }
  try {
    return await handleWebhook(req, { apiToken, store, lenco });
  } catch (err) {
    // A 500 makes Lenco retry, and the handler is safe to run again.
    console.error('lenco webhook failed', err);
    return new Response('error', { status: 500 });
  }
});
