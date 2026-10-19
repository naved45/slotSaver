import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { api } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { Badge, Button, EmptyState, ErrorState, Pagination, PageHeader, Select, Skeleton, Card } from '../../components/ui.jsx';
import { whenText } from '../../lib/format.js';

const PAGE = 20;

export default function AppointmentsPage() {
  const { org } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const list = useApi(() => api.get(`/orgs/${org.id}/appointments`, { params: { page, pageSize: PAGE, ...(status ? { status } : {}) } }).then((r) => ({ items: r.data.data, meta: r.data.meta })), [org.id, page, status]);

  return (
    <>
      <PageHeader title="Appointments" description="Filter by status. Open an appointment to reschedule, cancel, or mark it complete." actions={<Link to="/app/appointments/new"><Button>New appointment</Button></Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="status-filter" className="text-sm font-medium">Status</label>
        <Select id="status-filter" className="w-48" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">All</option>
          {['confirmed', 'completed', 'cancelled', 'no_show'].map((s) => <option key={s} value={s}>{s.replace('_', '-')}</option>)}
        </Select>
      </div>
      <Card>
        {list.loading && <Skeleton rows={5} />}
        {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
        {list.data && list.data.items.length === 0 && <EmptyState title="No appointments match" body="Try another status, or create one." />}
        {list.data && list.data.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">Appointments</caption>
                <thead className="text-xs uppercase text-slate-600">
                  <tr><th scope="col" className="py-2 pr-4">When</th><th scope="col" className="pr-4">Customer</th><th scope="col" className="pr-4">Service</th><th scope="col" className="pr-4">Staff</th><th scope="col">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {list.data.items.map((a) => (
                    <tr key={a._id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/app/appointments/${a._id}`)}>
                      <td className="py-3 pr-4"><Link className="font-medium text-indigo-700 underline" to={`/app/appointments/${a._id}`}>{whenText(a.startAt, org.timezone)}</Link></td>
                      <td className="pr-4">{a.customer?.fullName}</td>
                      <td className="pr-4">{a.service?.name}</td>
                      <td className="pr-4">{a.staff?.displayName}</td>
                      <td><Badge status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE} total={list.data.meta.total} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
