// Entry point for the payment provider's webhook. Secrets, set with
// `supabase secrets set`:
//   PAYMENT_WEBHOOK_SECRET  shared with the provider, signs every request
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase itself.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handlePayment, type OrderStore } from './logic.ts';

const secret = Deno.env.get('PAYMENT_WEBHOOK_SECRET') ?? '';
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const store: OrderStore = {
  async getOrder(id) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, total_ngwee')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  async markPaid(id, reference) {
    const { error } = await supabase.rpc('mark_order_paid', {
      p_order: id,
      p_provider_reference: reference,
    });
    if (error) throw error;
  },
  async markFailed(id) {
    // Only a pending order can fail. Moving it also returns any points spent on
    // it, through the orders_refund_points trigger.
    const { error } = await supabase
      .from('orders')
      .update({ status: 'failed' })
      .eq('id', id)
      .eq('status', 'pending');
    if (error) throw error;
  },
};

Deno.serve(async (req) => {
  if (!secret) {
    console.error('PAYMENT_WEBHOOK_SECRET is not set');
    return new Response('not configured', { status: 503 });
  }
  try {
    return await handlePayment(req, { secret, store });
  } catch (err) {
    // A 500 makes the provider retry, and the handler is safe to run again.
    console.error('payment webhook failed', err);
    return new Response('error', { status: 500 });
  }
});
