import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { Badge, Card, ErrorState, PageHeader, Skeleton } from '../../components/ui.jsx';
import { whenText } from '../../lib/format.js';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const { org } = useAuth();
  const d = useApi(() => api.get(`/orgs/${org.id}/customers/${id}`).then((r) => r.data.data), [id, org.id]);
  if (d.loading) return <Skeleton rows={4} />;
  if (d.error) return <ErrorState error={d.error} onRetry={d.reload} />;
  const c = d.data.customer;
  return (
    <>
      <PageHeader title={c.fullName} description={`${c.email}${c.phone ? ` · ${c.phone}` : ''}`} actions={<Link className="text-sm font-medium text-indigo-700 underline" to="/app/customers">All customers</Link>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Summary">
          <p className="text-sm">Cancellations: {d.data.cancellations}</p>
          <p className="text-sm">No-shows: {d.data.noShows}</p>
          <p className="text-sm">Email consent: {c.consent?.email ? 'yes' : 'no'}</p>
          <p className="text-sm">On waitlist: {d.data.waitlist.filter((w) => w.status === 'active').length} entries</p>
        </Card>
        <Card title="Upcoming" className="lg:col-span-2">
          {d.data.upcoming.length === 0 ? <p className="text-sm text-slate-700">Nothing upcoming.</p> : (
            <ul className="divide-y divide-slate-200 text-sm">{d.data.upcoming.map((a) => <li key={a._id} className="flex justify-between py-2"><Link className="text-indigo-700 underline" to={`/app/appointments/${a._id}`}>{whenText(a.startAt, org.timezone)} · {a.service?.name}</Link><Badge status={a.status} /></li>)}</ul>
          )}
        </Card>
        <Card title="History" className="lg:col-span-3">
          <ul className="divide-y divide-slate-200 text-sm">{d.data.history.map((a) => <li key={a._id} className="flex justify-between py-2"><span>{whenText(a.startAt, org.timezone)} · {a.service?.name} · {a.staff?.displayName}</span><Badge status={a.status} /></li>)}</ul>
        </Card>
      </div>
    </>
  );
}
