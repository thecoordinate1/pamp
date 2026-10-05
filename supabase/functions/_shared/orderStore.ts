// The database side of OrderStore, using the service role. Not imported by tests.
import type { OrderRow, OrderStore } from './lenco.ts';

// Just the part of the supabase-js client used here.
type Db = {
  from(table: string): any;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
};

export function createOrderStore(db: Db): OrderStore {
  return {
    async getOrder(id): Promise<OrderRow | null> {
      const { data, error } = await db
        .from('orders')
        .select('id, user_id, status, total_ngwee, method, msisdn, expires_at')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async markPaid(id, reference) {
      const { error } = await db.rpc('mark_order_paid', { p_order: id, p_provider_reference: reference });
      if (error) throw error;
    },
    async markFailed(id) {
      // Only a pending order can fail. Moving it also returns any points spent on
      // it, through the orders_refund_points trigger.
      const { error } = await db.from('orders').update({ status: 'failed' }).eq('id', id).eq('status', 'pending');
      if (error) throw error;
    },
  };
}
