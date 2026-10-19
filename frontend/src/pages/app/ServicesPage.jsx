import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, errorInfo, fieldErrors } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { serviceSchema } from '../../lib/schemas.js';
import { money } from '../../lib/format.js';
import { Alert, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Skeleton, Badge } from '../../components/ui.jsx';

export default function ServicesPage() {
  const { org } = useAuth();
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const list = useApi(() => api.get(`/orgs/${org.id}/services`).then((r) => r.data.data), [org.id]);
  const form = useForm({ resolver: zodResolver(serviceSchema), defaultValues: { name: '', slug: '', durationMinutes: 30, bufferMinutes: 0, priceRupees: 0 } });
  const manager = org.role === 'owner' || org.role === 'admin';

  const create = form.handleSubmit(async (v) => {
    setError(null); setMessage(null);
    try {
      await api.post(`/orgs/${org.id}/services`, { name: v.name, slug: v.slug, durationMinutes: v.durationMinutes, bufferMinutes: v.bufferMinutes, priceMinor: Math.round(v.priceRupees * 100), currency: org.currency ?? 'INR' });
      setMessage('Service added.');
      form.reset();
      list.reload();
    } catch (err) {
      const info = errorInfo(err);
      Object.entries(fieldErrors(info)).forEach(([k, m]) => form.setError(k.replace(/^body\./, ''), { message: m }));
      setError(info.code === 'DUPLICATE_KEY' || info.status === 409 ? 'A service with that short name already exists.' : info.message);
    }
  });

  const toggle = async (s) => {
    try { await api.patch(`/orgs/${org.id}/services/${s._id}`, { active: !s.active }); list.reload(); }
    catch (err) { setError(errorInfo(err).message); }
  };

  return (
    <>
      <PageHeader title="Services" description="Duration, buffer, and price for each service. Prices are stored by the server; the booking page shows what the server returns." />
      {message && <div className="mb-4"><Alert tone="success">{message}</Alert></div>}
      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        {manager && (
          <Card title="Add a service" className="lg:col-span-1">
            <form onSubmit={create} noValidate className="space-y-4">
              <Field label="Name" error={form.formState.errors.name?.message}>{(p) => <Input {...p} {...form.register('name')} />}</Field>
              <Field label="Short name for links" hint="Lowercase letters, numbers and hyphens." error={form.formState.errors.slug?.message}>{(p) => <Input {...p} {...form.register('slug')} />}</Field>
              <Field label="Duration (minutes)" error={form.formState.errors.durationMinutes?.message}>{(p) => <Input type="number" {...p} {...form.register('durationMinutes')} />}</Field>
              <Field label="Buffer after (minutes)" hint="Time kept free after each appointment." error={form.formState.errors.bufferMinutes?.message}>{(p) => <Input type="number" {...p} {...form.register('bufferMinutes')} />}</Field>
              <Field label="Price (₹)" error={form.formState.errors.priceRupees?.message}>{(p) => <Input type="number" step="1" {...p} {...form.register('priceRupees')} />}</Field>
              <Button type="submit" loading={form.formState.isSubmitting}>Add service</Button>
            </form>
          </Card>
        )}
        <Card title="Your services" className={manager ? 'lg:col-span-2' : 'lg:col-span-3'}>
          {list.loading && <Skeleton rows={3} />}
          {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
          {list.data?.length === 0 && <EmptyState title="No services yet" body="Add the first service to start taking bookings." />}
          <ul className="divide-y divide-slate-200">
            {(list.data ?? []).map((s) => (
              <li key={s._id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span><span className="font-semibold">{s.name}</span> · {s.durationMinutes} min + {s.bufferMinutes} min buffer · {money(s.priceMinor, s.currency)}</span>
                <span className="flex items-center gap-2"><Badge status={s.active ? 'active' : 'expired'} />
                  {manager && <Button variant="secondary" onClick={() => toggle(s)}>{s.active ? 'Pause' : 'Activate'}</Button>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
