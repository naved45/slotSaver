import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, errorInfo, fieldErrors } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { customerSchema } from '../../lib/schemas.js';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, PageHeader, Select, Skeleton } from '../../components/ui.jsx';

const schema = customerSchema.extend({ serviceId: z.string().min(1, 'Choose a service'), consent: z.boolean() });

export default function WaitlistPage() {
  const { org } = useAuth();
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [removing, setRemoving] = useState(null);
  const entries = useApi(() => api.get(`/orgs/${org.id}/waitlist`, { params: { pageSize: 50 } }).then((r) => r.data.data), [org.id]);
  const offers = useApi(() => api.get(`/orgs/${org.id}/slot-offers`, { params: { status: 'pending', pageSize: 50 } }).then((r) => r.data.data), [org.id]);
  const services = useApi(() => api.get(`/orgs/${org.id}/services`).then((r) => r.data.data), [org.id]);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { fullName: '', email: '', phone: '', serviceId: '', consent: false } });

  const add = form.handleSubmit(async (v) => {
    setError(null); setMessage(null);
    try {
      await api.post(`/orgs/${org.id}/waitlist`, { serviceId: v.serviceId, customer: { fullName: v.fullName, email: v.email, phone: v.phone || '' }, anyStaff: true, consent: { email: v.consent } });
      setMessage('Added to the waitlist. They will be offered a matching slot when one opens.');
      form.reset({ ...form.getValues(), fullName: '', email: '', phone: '', consent: false });
      entries.reload();
    } catch (err) {
      const info = errorInfo(err);
      Object.entries(fieldErrors(info)).forEach(([k, m]) => form.setError(k.replace(/^customer\./, ''), { message: m }));
      setError(info.message);
    }
  });

  const remove = async () => {
    try { await api.delete(`/orgs/${org.id}/waitlist/${removing}`); setMessage('Removed from the waitlist.'); }
    catch (err) { setError(errorInfo(err).message); }
    setRemoving(null); entries.reload(); offers.reload();
  };

  return (
    <>
      <PageHeader title="Waitlist" description="Customers who want a slot. When a cancellation frees a matching time, the best eligible person is offered it first." />
      {message && <div className="mb-4"><Alert tone="success">{message}</Alert></div>}
      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Add to waitlist" className="lg:col-span-1">
          <form onSubmit={add} noValidate className="space-y-4">
            <Field label="Service" error={form.formState.errors.serviceId?.message}>{(p) => (
              <Select {...p} {...form.register('serviceId')}>
                <option value="">Choose a service</option>
                {(services.data ?? []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </Select>
            )}</Field>
            <Field label="Customer name" error={form.formState.errors.fullName?.message}>{(p) => <Input {...p} {...form.register('fullName')} />}</Field>
            <Field label="Email" error={form.formState.errors.email?.message}>{(p) => <Input type="email" {...p} {...form.register('email')} />}</Field>
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" {...form.register('consent')} /><span>The customer agreed to email offers for this service.</span></label>
            <Button type="submit" loading={form.formState.isSubmitting}>Add to waitlist</Button>
          </form>
        </Card>
        <Card title="Waiting" className="lg:col-span-2">
          {entries.loading && <Skeleton rows={4} />}
          {entries.error && <ErrorState error={entries.error} onRetry={entries.reload} />}
          {entries.data && entries.data.length === 0 && <EmptyState title="The waitlist is empty" body="Customers you add here are offered freed slots automatically." />}
          {entries.data?.length > 0 && (
            <ul className="divide-y divide-slate-200">
              {entries.data.map((e) => (
                <li key={e._id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span><span className="font-medium">{e.customer?.fullName}</span> · {e.service?.name} · requested {new Date(e.requestedAt).toLocaleDateString('en-GB')}</span>
                  <span className="flex items-center gap-2"><Badge status={e.status} />
                    {e.status === 'active' && <Button variant="secondary" onClick={() => setRemoving(e._id)}>Remove</Button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-6 text-sm font-semibold">Open offers</h3>
          {offers.data?.length ? (
            <ul className="mt-2 text-sm">{offers.data.map((o) => <li key={o._id}>Offer to a waitlisted customer, ends {new Date(o.expiresAt).toLocaleString('en-GB')}</li>)}</ul>
          ) : <p className="mt-2 text-sm text-slate-700">No offers are open right now.</p>}
        </Card>
      </div>
      <ConfirmDialog open={Boolean(removing)} title="Remove from waitlist?" body="Any open offer for this customer will also be withdrawn." confirmLabel="Remove" danger onCancel={() => setRemoving(null)} onConfirm={remove} />
    </>
  );
}
