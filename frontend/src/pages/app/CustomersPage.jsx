import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { Button, Card, EmptyState, ErrorState, Input, Pagination, PageHeader, Skeleton } from '../../components/ui.jsx';

export default function CustomersPage() {
  const { org } = useAuth();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const list = useApi(() => api.get(`/orgs/${org.id}/customers`, { params: { page, pageSize: 20, ...(term ? { q: term } : {}) } }).then((r) => ({ items: r.data.data, meta: r.data.meta })), [org.id, page, term]);
  const exportUrl = `${api.defaults.baseURL}/orgs/${org.id}/customers/export.csv`;

  return (
    <>
      <PageHeader title="Customers" description="Contact details and consent for scheduling. No medical records." actions={<a href={exportUrl} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-navy-900 ring-1 ring-slate-300 hover:bg-slate-50">Export CSV</a>} />
      <form className="mb-4 flex gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setPage(1); setTerm(q.trim()); }}>
        <label htmlFor="cust-search" className="sr-only">Search customers</label>
        <Input id="cust-search" type="search" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <Card>
        {list.loading && <Skeleton rows={4} />}
        {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
        {list.data && list.data.items.length === 0 && <EmptyState title="No customers found" body="Customers appear here when they book or join the waitlist." />}
        {list.data?.items.length > 0 && (
          <>
            <ul className="divide-y divide-slate-200">
              {list.data.items.map((c) => (
                <li key={c._id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <Link to={`/app/customers/${c._id}`} className="font-medium text-indigo-700 underline">{c.fullName}</Link>
                  <span className="text-slate-600">{c.email} · email consent: {c.consent?.email ? 'yes' : 'no'}</span>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={20} total={list.data.meta.total} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
