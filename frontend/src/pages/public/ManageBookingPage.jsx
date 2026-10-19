import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, errorInfo } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, PageHeader, Skeleton } from '../../components/ui.jsx';
import { todayIn, whenText } from '../../lib/format.js';

/** Guest self-service. The token in the URL is the only credential; it is never shown back. */
export default function ManageBookingPage() {
  const { token } = useParams();
  const view = useApi(() => api.get(`/public/guest/appointments/${token}`).then((r) => r.data.data), [token]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState(todayIn('UTC', 1));
  const [slots, setSlots] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (view.loading) return <div className="mx-auto max-w-xl p-8"><Skeleton rows={4} /></div>;
  if (view.error?.status === 404) return <div className="mx-auto max-w-xl p-8"><EmptyState title="This link is not valid" body="It may have expired after the appointment started, or a newer link was sent to you." /></div>;
  if (view.error) return <div className="mx-auto max-w-xl p-8"><ErrorState error={view.error} onRetry={view.reload} /></div>;

  const appt = view.data;
  const tz = appt.organization.timezone;

  const loadSlots = async () => {
    setError(null);
    try {
      const { data } = await api.get(`/public/businesses/${appt.slug}/services/${appt.serviceSlug}/availability`, { params: { from: date, to: date } });
      setSlots(data.data.slots);
    } catch (err) { setError(errorInfo(err).message); }
  };

  const cancel = async () => {
    setBusy(true); setError(null);
    try {
      await api.post(`/public/guest/appointments/${token}/cancel`);
      setMessage('Your appointment has been cancelled.');
      setConfirmCancel(false);
      view.reload();
    } catch (err) { setError(errorInfo(err).message); setConfirmCancel(false); }
    finally { setBusy(false); }
  };

  const move = async (startAt) => {
    setBusy(true); setError(null);
    try {
      const { data } = await api.post(`/public/guest/appointments/${token}/reschedule`, { startAt });
      setMessage('Your appointment has been moved. The old link no longer works; use the new link in your email.');
      setRescheduling(false);
      if (data.data.manageToken) window.history.replaceState(null, '', `/manage/${data.data.manageToken}`);
      view.reload();
    } catch (err) { setError(errorInfo(err).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <PageHeader title="Your appointment" description={appt.organization.name} />
      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <Card>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <dt className="text-slate-600">Service</dt><dd className="col-span-2 font-medium">{appt.service.name}</dd>
          <dt className="text-slate-600">When</dt><dd className="col-span-2 font-medium">{appt.startText}</dd>
          <dt className="text-slate-600">Status</dt><dd className="col-span-2"><Badge status={appt.status} /></dd>
        </dl>
        {appt.canChange ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => { setRescheduling(true); loadSlots(); }}>Reschedule</Button>
            <Button variant="danger" onClick={() => setConfirmCancel(true)}>Cancel appointment</Button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-slate-700">Changes are closed for this appointment. Please contact the business directly.</p>
        )}
      </Card>

      {rescheduling && (
        <Card title="Choose a new time">
          <Field label="Date">{(p) => <Input type="date" {...p} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <div className="mt-3"><Button variant="secondary" onClick={loadSlots}>Show times</Button></div>
          <ul className="mt-4 grid grid-cols-3 gap-2" aria-label="New times">
            {(slots ?? []).map((s) => (
              <li key={s.startAt}><Button variant="secondary" className="w-full" disabled={busy} onClick={() => move(s.startAt)} aria-label={`Move to ${s.localTime} on ${s.localDate}`}>{s.localTime}</Button></li>
            ))}
          </ul>
          {slots && slots.length === 0 && <p className="mt-3 text-sm text-slate-700">No times are free on that day.</p>}
        </Card>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this appointment?"
        body={`${appt.service.name} on ${appt.startText}. The time will be offered to someone on the waitlist.`}
        confirmLabel="Yes, cancel"
        danger
        loading={busy}
        onConfirm={cancel}
        onCancel={() => setConfirmCancel(false)}
      />
      <span className="sr-only">{whenText(appt.startAt, tz)}</span>
    </div>
  );
}
