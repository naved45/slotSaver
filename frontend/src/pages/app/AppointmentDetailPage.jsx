import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorInfo } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { Alert, Badge, Button, Card, ConfirmDialog, ErrorState, PageHeader, Skeleton } from '../../components/ui.jsx';
import { whenText, money } from '../../lib/format.js';

export default function AppointmentDetailPage() {
  const { id } = useParams();
  const { org } = useAuth();
  const detail = useApi(() => api.get(`/orgs/${org.id}/appointments/${id}`).then((r) => r.data.data), [id, org.id]);
  const [confirm, setConfirm] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn, okText) => {
    setBusy(true); setError(null);
    try { await fn(); setMessage(okText); setConfirm(null); detail.reload(); }
    catch (err) { setError(errorInfo(err).message); setConfirm(null); }
    finally { setBusy(false); }
  };

  if (detail.loading) return <Skeleton rows={5} />;
  if (detail.error?.status === 404) return <ErrorState error={{ message: 'This appointment was not found.' }} />;
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />;
  const a = detail.data;
  const active = a.status === 'confirmed' || a.status === 'requested';

  return (
    <>
      <PageHeader title={`${a.service?.name ?? 'Appointment'} · ${a.customer?.fullName ?? ''}`} description={whenText(a.startAt, org.timezone)} actions={<Link to="/app/appointments"><Button variant="secondary">Back to list</Button></Link>} />
      {message && <div className="mb-4"><Alert tone="success">{message}</Alert></div>}
      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-slate-600">Status</dt><dd className="col-span-2"><Badge status={a.status} /></dd>
            <dt className="text-slate-600">Staff</dt><dd className="col-span-2">{a.staff?.displayName}</dd>
            <dt className="text-slate-600">Customer email</dt><dd className="col-span-2">{a.customer?.email}</dd>
            <dt className="text-slate-600">Phone</dt><dd className="col-span-2">{a.customer?.phone || '—'}</dd>
            <dt className="text-slate-600">Price</dt><dd className="col-span-2">{money(a.priceMinor, a.currency)}</dd>
            <dt className="text-slate-600">Booked via</dt><dd className="col-span-2">{a.source}</dd>
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            {active && <Button variant="danger" onClick={() => setConfirm('cancel')} disabled={busy}>Cancel appointment</Button>}
            {active && <Button variant="secondary" onClick={() => setConfirm('complete')} disabled={busy}>Mark completed</Button>}
            {active && <Button variant="secondary" onClick={() => setConfirm('noshow')} disabled={busy}>Mark no-show</Button>}
          </div>
        </Card>
        <Card title="History">
          <ol className="space-y-3 text-sm">
            {a.history.map((h) => (
              <li key={h._id}><span className="font-medium">{h.fromStatus ? `${h.fromStatus} → ` : ''}{h.toStatus}</span><br /><span className="text-slate-600">{new Date(h.at).toLocaleString('en-GB')} · {h.reason}</span></li>
            ))}
          </ol>
        </Card>
      </div>
      <ConfirmDialog
        open={confirm === 'cancel'}
        title="Cancel this appointment?"
        body="The slot will be offered to the best eligible person on the waitlist, and the customer will be emailed."
        confirmLabel="Cancel appointment"
        danger
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => api.post(`/orgs/${org.id}/appointments/${id}/cancel`, { reason: 'Cancelled by business' }), 'Appointment cancelled. The slot has been offered to the waitlist if someone is eligible.')}
      />
      <ConfirmDialog
        open={confirm === 'complete' || confirm === 'noshow'}
        title={confirm === 'complete' ? 'Mark as completed?' : 'Mark as no-show?'}
        confirmLabel="Confirm"
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => api.post(`/orgs/${org.id}/appointments/${id}/status`, { status: confirm === 'complete' ? 'completed' : 'no_show' }), 'Status updated.')}
      />
    </>
  );
}
