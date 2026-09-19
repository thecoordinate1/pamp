import { Activity, CalendarDays, Ticket, TrendingUp, Users, Wallet } from 'lucide-react';
import { ngweeToZmw } from '../lib/mappers';
import { usePlatformEvents, usePlatformSignups, usePlatformStats } from '../lib/queries';

const kwacha = (ngwee) =>
  `K${ngweeToZmw(ngwee).toLocaleString('en-ZM', { maximumFractionDigits: 2 })}`;

const CATEGORY_LABEL = {
  party: 'Party',
  tech_business: 'Tech & business',
  creative_arts: 'Creative',
  vip_lounge: 'VIP',
};

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center gap-2 text-text-muted">
        <Icon className="w-4 h-4" />
        <span className="text-[13px]">{label}</span>
      </div>
      <p className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white truncate">{value}</p>
      {sub && <p className="mt-0.5 text-[13px] text-text-muted truncate">{sub}</p>}
    </div>
  );
}

// A plain bars-in-a-row chart. Nothing here is worth a charting library.
function SignupTrend({ rows }) {
  const peak = Math.max(1, ...rows.map((r) => Number(r.signups)));
  const total = rows.reduce((sum, r) => sum + Number(r.signups), 0);

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold text-white">Signups</h3>
        <p className="text-[13px] text-text-muted">{total} in {rows.length} days</p>
      </div>
      {total === 0 ? (
        <p className="mt-6 text-sm text-text-muted">No signups yet.</p>
      ) : (
        <div className="mt-5 flex items-end gap-[3px] h-24" role="img" aria-label={`${total} signups over ${rows.length} days`}>
          {rows.map((r) => (
            <div
              key={r.day}
              title={`${r.day}: ${r.signups}`}
              style={{ height: `${Math.max(3, (Number(r.signups) / peak) * 100)}%` }}
              className={`flex-1 rounded-t-[2px] ${Number(r.signups) > 0 ? 'brand-gradient' : 'bg-white/8'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { data: stats, isLoading, isError, error } = usePlatformStats(true);
  const { data: events = [] } = usePlatformEvents(true);
  const { data: signups = [] } = usePlatformSignups(true, 30);

  if (isError) {
    return (
      <div className="card max-w-md mx-auto p-8 text-center">
        <h3 className="text-lg font-semibold text-white">Could not load platform data</h3>
        <p className="mt-1 text-text-secondary">{error?.message ?? 'Try again.'}</p>
      </div>
    );
  }

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card h-28 animate-pulse bg-white/[0.03]" />
        ))}
      </div>
    );
  }

  const issued = Number(stats.tickets_issued);
  const checkedIn = Number(stats.tickets_checked_in);
  const checkInRate = issued > 0 ? Math.round((checkedIn / issued) * 100) : 0;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          icon={Users}
          label="Users"
          value={Number(stats.total_users).toLocaleString()}
          sub={`${stats.new_users_7d} in the last 7 days`}
        />
        <StatCard
          icon={CalendarDays}
          label="Events"
          value={Number(stats.published_events).toLocaleString()}
          sub={`${stats.upcoming_events} still upcoming`}
        />
        <StatCard
          icon={Ticket}
          label="Passes issued"
          value={issued.toLocaleString()}
          sub={`${checkedIn} checked in (${checkInRate}%)`}
        />
        <StatCard
          icon={Wallet}
          label="Gross paid"
          value={kwacha(stats.gross_ngwee)}
          sub={`${kwacha(stats.fees_ngwee)} in platform fees`}
        />
        <StatCard
          icon={Activity}
          label="RSVPs"
          value={Number(stats.total_rsvps).toLocaleString()}
          sub={`${stats.pending_requests} requests awaiting a host`}
        />
        <StatCard
          icon={TrendingUp}
          label="Orders held"
          value={Number(stats.orders_pending).toLocaleString()}
          sub={`${stats.orders_paid} paid`}
        />
      </div>

      {Number(stats.orders_pending) > 0 && (
        <p className="rounded-2xl bg-amber/10 px-4 py-3 text-sm text-amber">
          {stats.orders_pending} order{Number(stats.orders_pending) === 1 ? '' : 's'} are held pending
          payment. No mobile money provider is connected yet, so these cannot settle.
        </p>
      )}

      <SignupTrend rows={signups} />

      <div>
        <h3 className="font-semibold text-white mb-3">Every event</h3>
        {events.length === 0 ? (
          <div className="card p-8 text-center text-text-secondary">No events on the platform yet.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[13px] text-text-muted">
                  <th scope="col" className="font-medium px-4 py-3">Event</th>
                  <th scope="col" className="font-medium px-4 py-3">Host</th>
                  <th scope="col" className="font-medium px-4 py-3">Date</th>
                  <th scope="col" className="font-medium px-4 py-3 text-right">RSVPs</th>
                  <th scope="col" className="font-medium px-4 py-3 text-right">Passes</th>
                  <th scope="col" className="font-medium px-4 py-3 text-right">In</th>
                  <th scope="col" className="font-medium px-4 py-3 text-right">Gross</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {events.map((e) => (
                  <tr key={e.event_id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white truncate max-w-[220px]">{e.name}</p>
                      <p className="text-[13px] text-text-muted">
                        {CATEGORY_LABEL[e.category] ?? e.category}
                        {e.status !== 'published' && ` · ${e.status}`}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-text-secondary truncate max-w-[140px]">{e.host_name}</td>
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{e.starts_on}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white">{e.rsvps}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white">{e.tickets_sold}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white">{e.checked_in}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white whitespace-nowrap">
                      {kwacha(e.gross_ngwee)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
