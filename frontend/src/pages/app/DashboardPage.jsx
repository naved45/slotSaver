import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { api } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, Button } from '../../components/ui.jsx';

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export default function DashboardPage() {
  const { org } = useAuth();
  const d = useApi(() => api.get(`/orgs/${org.id}/dashboard`).then((r) => r.data.data), [org.id]);
  const isManager = org.role === 'owner' || org.role === 'admin';

  if (!isManager) {
    return (
      <>
        <PageHeader title="Your schedule" description="Appointments assigned to you." actions={<Link to="/app/appointments"><Button>All appointments</Button></Link>} />
        <Card title="Next up"><p className="text-sm text-slate-700">Open Appointments to see your list.</p></Card>
      </>
    );
  }
  if (d.loading) return <Skeleton rows={6} />;
  if (d.error) return <ErrorState error={d.error} onRetry={d.reload} />;
  const s = d.data.last30Days;
  const empty = s.bookings === 0 && d.data.upcoming.length === 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${d.data.organization.name} · last 30 days · times in ${d.data.organization.timezone}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/app/appointments/new"><Button>New appointment</Button></Link>
            <Link to="/app/waitlist"><Button variant="secondary">Manage waitlist</Button></Link>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Appointments today" value={d.data.today.appointments} />
        <StatCard label="Bookings, last 30 days" value={s.bookings} />
        <StatCard label="Cancellation rate" value={pct(s.cancellationRate)} hint={`${s.cancellations} cancelled in the last 30 days`} />
        <StatCard label="No-show rate" value={pct(s.noShowRate)} hint={`${s.noShows} no-shows`} />
        <StatCard label="Recovered bookings" value={s.recoveredBookings} hint="Filled from the waitlist" />
        <StatCard label="Estimated recovered value" value={new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(s.estimatedRecoveredValueMinor / 100)} hint="Booked value, not collected revenue" />
        <StatCard label="Active waitlist" value={d.data.waitlist.active} hint={`${d.data.waitlist.openOffers} offers open`} />
        <StatCard label="Offer acceptance" value={pct(s.offerAcceptanceRate)} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Upcoming this week">
          {empty ? (
            <EmptyState title="No appointments yet" body="Add services and staff, then share your booking link." action={<Link to="/onboarding"><Button variant="secondary">Finish setup</Button></Link>} />
          ) : d.data.upcoming.length === 0 ? (
            <p className="text-sm text-slate-700">No upcoming appointments in the next 7 days.</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {d.data.upcoming.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span><span className="font-medium">{a.startText}</span> · {a.service} · {a.customer}</span>
                  <Badge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent activity">
          {d.data.recentActivity.length === 0 ? <p className="text-sm text-slate-700">Nothing yet.</p> : (
            <ul className="space-y-2 text-sm">
              {d.data.recentActivity.map((e) => <li key={e._id}>{new Date(e.at).toLocaleString('en-GB')} · {e.action}</li>)}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
