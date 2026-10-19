import { useState } from 'react';
import { api, errorInfo } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, Input, Field } from '../../components/ui.jsx';

const LABEL = { scheduled: 'Scheduled', sent: 'Sent', failed: 'Failed', cancelled: 'Cancelled', logged_dev: 'Development preview (not delivered)' };

export default function RemindersPage() {
  const { org } = useAuth();
  const isOwner = org.role === 'owner';
  const settings = useApi(() => api.get(`/orgs/${org.id}/reminder-settings`).then((r) => r.data.data), [org.id]);
  const notes = useApi(() => api.get(`/orgs/${org.id}/notifications`, { params: { pageSize: 30 } }).then((r) => ({ items: r.data.data, counts: r.data.counts })), [org.id]);
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const current = draft ?? settings.data;
  const save = async () => {
    setError(null); setMessage(null);
    try {
      await api.put(`/orgs/${org.id}/reminder-settings`, { reminderOffsetsMinutes: current.reminderOffsetsMinutes, confirmationEmails: current.confirmationEmails });
      setMessage('Reminder settings saved. Pending reminders are updated when appointments change.'); setDraft(null); settings.reload();
    } catch (err) { setError(errorInfo(err).message); }
  };

  if (settings.loading) return <Skeleton rows={3} />;
  if (settings.error) return <ErrorState error={settings.error} onRetry={settings.reload} />;

  return (
    <>
      <PageHeader title="Reminders" description="When customers are reminded before an appointment, and what happened to each email." />
      {message && <div className="mb-4"><Alert tone="success">{message}</Alert></div>}
      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Settings">
          <Field label="Reminder times (minutes before)" hint="Comma-separated, for example 1440, 120 for 24 hours and 2 hours before.">
            {(p) => (
              <Input {...p} disabled={!isOwner} value={current.reminderOffsetsMinutes.join(', ')} onChange={(e) => setDraft({ ...current, reminderOffsetsMinutes: e.target.value.split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x) && x > 0) })} />
            )}
          </Field>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" disabled={!isOwner} checked={current.confirmationEmails} onChange={(e) => setDraft({ ...current, confirmationEmails: e.target.checked })} />
            Send booking confirmations
          </label>
          {isOwner ? <div className="mt-4"><Button onClick={save} disabled={!draft}>Save settings</Button></div> : <p className="mt-4 text-xs text-slate-600">Only the owner can change reminder settings.</p>}
          <p className="mt-4 text-xs text-slate-600">Without SMTP configured, emails are recorded as development previews and are not delivered.</p>
        </Card>
        <Card title="Delivery status">
          {notes.loading && <Skeleton rows={3} />}
          {notes.error && <ErrorState error={notes.error} onRetry={notes.reload} />}
          {notes.data && (
            <>
              <ul className="mb-4 flex flex-wrap gap-2 text-sm">
                {Object.entries(notes.data.counts).map(([k, v]) => <li key={k} className="rounded-full bg-slate-100 px-3 py-1">{LABEL[k] ?? k}: {v}</li>)}
              </ul>
              {notes.data.items.length === 0 ? <EmptyState title="No emails yet" body="Confirmations and reminders appear here." /> : (
                <ul className="divide-y divide-slate-200 text-sm">
                  {notes.data.items.map((n) => (
                    <li key={n._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>{n.type.replace(/_/g, ' ')} · {n.recipientEmail.replace(/^(.).*@/, '$1***@')}</span>
                      <Badge status={n.status === 'sent' ? 'confirmed' : n.status === 'failed' ? 'cancelled' : n.status === 'logged_dev' ? 'pending' : 'requested'} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
