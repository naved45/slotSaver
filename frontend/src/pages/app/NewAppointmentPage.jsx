import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, errorInfo, fieldErrors } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { customerSchema } from '../../lib/schemas.js';
import { todayIn, whenText } from '../../lib/format.js';
import { Alert, Button, Card, Field, Input, PageHeader, Select, Skeleton, ErrorState } from '../../components/ui.jsx';
import { z } from 'zod';

const schema = customerSchema.extend({ consent: z.boolean() });

/** Staff/owner booking uses the same server-side availability as the public page. */
export default function NewAppointmentPage() {
  const { org } = useAuth();
  const navigate = useNavigate();
  const [serviceSlug, setServiceSlug] = useState('');
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState(todayIn(org.timezone, 0));
  const [slot, setSlot] = useState(null);
  const [error, setError] = useState(null);
  const [business, setBusiness] = useState(null);

  const meta = useApi(async () => {
    const [svc, staff] = await Promise.all([api.get(`/orgs/${org.id}/services`), api.get(`/orgs/${org.id}/staff`)]);
    const pub = await api.get(`/public/businesses/${org.slug}`);
    setBusiness(pub.data.data);
    return { services: svc.data.data, staff: staff.data.data };
  }, [org.id]);

  const avail = useApi(
    () => (serviceSlug && date ? api.get(`/public/businesses/${org.slug}/services/${serviceSlug}/availability`, { params: { from: date, to: date, ...(staffId ? { staffId } : {}) } }).then((r) => r.data.data.slots) : Promise.resolve([])),
    [serviceSlug, staffId, date, org.slug]
  );

  const form = useForm({ resolver: zodResolver(schema), defaultValues: { fullName: '', email: '', phone: '', consent: false } });

  const submit = form.handleSubmit(async (v) => {
    setError(null);
    const service = meta.data?.services.find((s) => s.slug === serviceSlug);
    try {
      await api.post(`/orgs/${org.id}/appointments`, {
        serviceId: service._id,
        staffId: slot.staffIds[0],
        startAt: slot.startAt,
        customer: { fullName: v.fullName, email: v.email, phone: v.phone || '' },
        consent: { email: v.consent },
      });
      navigate('/app/appointments', { replace: true });
    } catch (err) {
      const info = errorInfo(err);
      Object.entries(fieldErrors(info)).forEach(([k, m]) => form.setError(k.replace(/^customer\./, ''), { message: m }));
      setError(info.status === 409 ? 'That time is no longer free. Choose another time.' : info.message);
    }
  });

  if (meta.loading) return <Skeleton rows={5} />;
  if (meta.error) return <ErrorState error={meta.error} onRetry={meta.reload} />;
  const services = meta.data.services.filter((s) => s.active !== false);
  const slots = avail.data ?? [];
  void business;

  return (
    <>
      <PageHeader title="New appointment" description={`Times are in ${org.timezone}.`} />
      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="1. Service, staff and time">
          <div className="space-y-4">
            <Field label="Service">{(p) => (
              <Select {...p} value={serviceSlug} onChange={(e) => { setServiceSlug(e.target.value); setSlot(null); }}>
                <option value="">Choose a service</option>
                {services.map((s) => <option key={s._id} value={s.slug}>{s.name}</option>)}
              </Select>
            )}</Field>
            <Field label="Staff member" hint="Leave as 'Any' to use whoever is free first.">{(p) => (
              <Select {...p} value={staffId} onChange={(e) => { setStaffId(e.target.value); setSlot(null); }}>
                <option value="">Any</option>
                {meta.data.staff.filter((s) => s.active).map((s) => <option key={s._id} value={s._id}>{s.displayName}</option>)}
              </Select>
            )}</Field>
            <Field label="Date">{(p) => <Input type="date" {...p} value={date} onChange={(e) => { setDate(e.target.value); setSlot(null); }} />}</Field>
            {!serviceSlug && <p className="text-sm text-slate-700">Choose a service to see times.</p>}
            {serviceSlug && avail.loading && <Skeleton rows={2} />}
            {serviceSlug && avail.error && <ErrorState error={avail.error} onRetry={avail.reload} />}
            {serviceSlug && !avail.loading && slots.length === 0 && <p className="text-sm text-slate-700">No free times on this day.</p>}
            <ul className="grid grid-cols-3 gap-2" aria-label="Free times">
              {slots.map((s) => (
                <li key={s.startAt}>
                  <Button variant={slot?.startAt === s.startAt ? 'primary' : 'secondary'} className="w-full" onClick={() => setSlot(s)} aria-pressed={slot?.startAt === s.startAt}>
                    {s.localTime}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </Card>
        <Card title="2. Customer">
          {!slot ? <p className="text-sm text-slate-700">Pick a time first.</p> : (
            <form onSubmit={submit} noValidate className="space-y-4">
              <p className="text-sm text-slate-700">{whenText(slot.startAt, org.timezone)} · {slot.staffNames[0]}</p>
              <Field label="Customer name" error={form.formState.errors.fullName?.message}>{(p) => <Input {...p} {...form.register('fullName')} />}</Field>
              <Field label="Email" error={form.formState.errors.email?.message}>{(p) => <Input type="email" {...p} {...form.register('email')} />}</Field>
              <Field label="Phone (optional)">{(p) => <Input type="tel" {...p} {...form.register('phone')} />}</Field>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4" {...form.register('consent')} />
                <span>The customer agreed to receive email confirmations and reminders.</span>
              </label>
              <Button type="submit" loading={form.formState.isSubmitting}>Book appointment</Button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
