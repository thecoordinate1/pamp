// The database side of the UniHair link, using the service role. The functions
// it calls are revoked from browsers (20261007000100). Not imported by tests.
import type { LinkStore, Transfer } from '../unihair-link/handler.ts';

// Just the part of the supabase-js client used here.
type Db = {
  from(table: string): any;
  rpc(fn: string, args?: Record<string, unknown>): any;
};

const fail = (error: { message: string } | null) => {
  if (error) throw error;
};

const toTransfer = (row: { ref: string; points: number; created_at: string }): Transfer => ({
  ref: row.ref,
  points: row.points,
  createdAt: row.created_at,
});

export function createLinkStore(db: Db): LinkStore {
  return {
    async getLink(userId) {
      const { data, error } = await db
        .from('unihair_links')
        .select('unihair_profile_id, unihair_name')
        .eq('user_id', userId)
        .maybeSingle();
      fail(error);
      return data ? { unihairProfileId: data.unihair_profile_id, unihairName: data.unihair_name } : null;
    },
    async link(userId, profileId, name) {
      const { error } = await db.rpc('link_unihair_account', {
        p_user: userId,
        p_unihair_profile: profileId,
        p_name: name,
      });
      fail(error);
    },
    async unlink(userId) {
      const { error } = await db.rpc('unlink_unihair_account', { p_user: userId });
      fail(error);
    },
    async balance(userId) {
      const { data, error } = await db.from('point_wallets').select('balance').eq('user_id', userId).maybeSingle();
      fail(error);
      return data?.balance ?? 0;
    },
    async pointValue() {
      const { data, error } = await db.from('platform_settings').select('point_value_ngwee').eq('id', 1).single();
      fail(error);
      return data.point_value_ngwee;
    },
    async beginTransfer(userId, points) {
      const { data, error } = await db.rpc('begin_unihair_transfer', { p_user: userId, p_points: points });
      fail(error);
      return toTransfer(Array.isArray(data) ? data[0] : data);
    },
    async finishTransfer(ref, taken) {
      const { data, error } = await db.rpc('finish_unihair_transfer', { p_ref: ref, p_taken: taken });
      fail(error);
      return data ?? 0;
    },
    async pendingTransfers(userId) {
      const { data, error } = await db.rpc('pending_unihair_transfers', { p_user: userId });
      fail(error);
      return (data ?? []).map(toTransfer);
    },
  };
}
