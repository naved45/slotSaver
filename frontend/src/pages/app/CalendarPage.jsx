import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { api } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { Badge, Card, EmptyState, ErrorState, Input, PageHeader, Skeleton, Button } from '../../components/ui.jsx';
import { timeOnly, todayIn } from '../../lib/format.js';

/**
 * Calendar view. A grouped list is shown by default, which works for screen readers and phones.
 * Each day is a labelled section, and every appointment is a link.
 */
export default function CalendarPage() {
  const { org } = useAuth();
  const [from, setFrom] = useState(todayIn(org.timezone, 0));
  const [days, setDays] = useState(7);
  const to = new Date(new Date(from).getTime() + (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const list = useApi(() => api.get(`/orgs/${org.id}/appointments`, { params: { from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z`, pageSize: 100, sort: 'asc' } }).then((r) => r.data.data), [org.id, from, days]);

  const byDay = {};
  for (const a of list.data ?? []) {
    const key = new Intl.DateTimeFormat('en-GB', { timeZone: org.timezone, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(a.startAt));
    (byDay[key] ??= []).push(a);
  }

  return (
    <>
      <PageHeader title="Calendar" description={`Times in ${org.timezone}. Switch to any day range below.`} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium" htmlFor="cal-from">Start date</label>
        <Input id="cal-from" type="date" className="w-44" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Button variant="secondary" onClick={() => setDays(7)} aria-pressed={days === 7}>7 days</Button>
        <Button variant="secondary" onClick={() => setDays(1)} aria-pressed={days === 1}>1 day</Button>
      </div>
      {list.loading && <Skeleton rows={4} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data && list.data.length === 0 && <EmptyState title="Nothing booked in this range" />}
      <div className="space-y-4">
        {Object.entries(byDay).map(([day, items]) => (
          <Card key={day} title={day}>
            <ul className="divide-y divide-slate-200">
              {items.map((a) => (
                <li key={a._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Link className="text-indigo-700 underline" to={`/app/appointments/${a._id}`}>
                    <time dateTime={a.startAt}>{timeOnly(a.startAt, org.timezone)}</time> · {a.service?.name} · {a.customer?.fullName} · {a.staff?.displayName}
                  </Link>
                  <Badge status={a.status} />
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
