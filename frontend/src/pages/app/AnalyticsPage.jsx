import { useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { api } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, Skeleton, StatCard } from '../../components/ui.jsx';
import { todayIn } from '../../lib/format.js';

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export default function AnalyticsPage() {
  const { org } = useAuth();
  const [from, setFrom] = useState(todayIn(org.timezone, -29));
  const [to, setTo] = useState(todayIn(org.timezone, 0));
  const [range, setRange] = useState({ from, to });
  const a = useApi(() => api.get(`/orgs/${org.id}/analytics`, { params: range }).then((r) => r.data.data), [org.id, range.from, range.to]);
  const exportUrl = `${api.defaults.baseURL}/orgs/${org.id}/analytics/export.csv?from=${range.from}&to=${range.to}`;

  return (
    <>
      <PageHeader title="Analytics" description="Every number is computed from your appointment and waitlist records for the range you choose." actions={<a href={exportUrl} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-navy-900 ring-1 ring-slate-300 hover:bg-slate-50">Export CSV</a>} />
      <form className="mb-6 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setRange({ from, to }); }}>
        <Input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        <Input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
        <Button type="submit" variant="secondary">Apply</Button>
      </form>
      {a.loading && <Skeleton rows={6} />}
      {a.error && <ErrorState error={a.error} onRetry={a.reload} />}
      {a.data && (
        <>
          {a.data.summary.bookings === 0 && <div className="mb-4"><EmptyState title="No bookings in this range" body="Try a wider date range." /></div>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Bookings" value={a.data.summary.bookings} />
            <StatCard label="Cancellation rate" value={pct(a.data.summary.cancellationRate)} hint="Cancelled ÷ bookings" />
            <StatCard label="No-show rate" value={pct(a.data.summary.noShowRate)} hint="No-shows ÷ (completed + no-shows)" />
            <StatCard label="Recovered bookings" value={a.data.summary.recoveredBookings} hint={`Offer acceptance ${pct(a.data.summary.offerAcceptanceRate)}`} />
            <StatCard label="Avg. minutes to rebook" value={a.data.summary.avgMinutesToRebook ?? '—'} hint="From cancellation to recovered booking" />
            <StatCard label="Reminder failure rate" value={pct(a.data.summary.reminderFailureRate)} hint={`${a.data.summary.remindersLoggedDev} previews, not delivered`} />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="Bookings by day">
              <div className="h-64" role="img" aria-label="Bar chart of bookings by day">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={a.data.daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="bookings" fill="#4F46E5" name="Bookings" /><Bar dataKey="recovered" fill="#16A34A" name="Recovered" /></BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="No-shows by day">
              <div className="h-64" role="img" aria-label="Line chart of no-shows by day">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={a.data.daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="noShows" stroke="#DC2626" name="No-shows" /></LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Top services">
              {a.data.topServices.length === 0 ? <p className="text-sm">No data.</p> : (
                <ul className="divide-y divide-slate-200 text-sm">{a.data.topServices.map((s) => <li key={s.name} className="flex justify-between py-2"><span>{s.name}</span><span>{s.bookings}</span></li>)}</ul>
              )}
            </Card>
            <Card title="Staff utilization" >
              <ul className="divide-y divide-slate-200 text-sm">
                {a.data.staffUtilization.map((s) => <li key={s.staffId} className="flex justify-between py-2"><span>{s.name}</span><span>{pct(s.utilization)} · {s.bookedMinutes} of {s.availableMinutes} min</span></li>)}
              </ul>
              <p className="mt-3 text-xs text-slate-600">Closures are not subtracted from available time yet.</p>
            </Card>
          </div>
          <p className="mt-6 text-xs text-slate-600">Estimated recovered value (₹{Math.round(a.data.summary.estimatedRecoveredValueMinor / 100)}) is booked value from recovered appointments, not collected revenue. Peak hours: {a.data.peakHours.map((p) => `${p.hour}:00`).join(', ') || '—'}.</p>
          <span className="sr-only">{a.data.truncated ? 'Results were truncated to the most recent records.' : ''}</span>
        </>
      )}
    </>
  );
}
