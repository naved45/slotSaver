import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, errorInfo, fieldErrors } from '../../lib/api.js';
import { customerSchema } from '../../lib/schemas.js';
import { money, whenText, todayIn } from '../../lib/format.js';
import { useApi } from '../../hooks/useApi.js';
import { Alert, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Skeleton } from '../../components/ui.jsx';

const bookingSchema = customerSchema.extend({
  consentEmail: z.boolean(),
});

/**
 * Public booking: choose service → date → time → details → confirm. Availability comes from the
 * server; the browser never decides what is free.
 */
export default function BookingPage() {
  const { slug, serviceSlug } = useParams();
  const [step, setStep] = useState(serviceSlug ? 'date' : 'service');
  const [service, setService] = useState(null);
  const [date, setDate] = useState(todayIn('UTC', 1));
  const [slot, setSlot] = useState(null);
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const business = useApi(() => api.get(`/public/businesses/${slug}`).then((r) => r.data.data), [slug]);
  const tz = business.data?.organization?.timezone ?? 'UTC';
  const services = business.data?.services ?? [];
  const chosen = service ?? services.find((s) => s.slug === serviceSlug) ?? null;

  const availability = useApi(
    () => (chosen && date ? api.get(`/public/businesses/${slug}/services/${chosen.slug}/availability`, { params: { from: date, to: date } }).then((r) => r.data.data) : Promise.resolve(null)),
    [chosen?.slug, date, slug]
  );

  const form = useForm({ resolver: zodResolver(bookingSchema), defaultValues: { fullName: '', email: '', phone: '', consentEmail: true } });

  const submit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const { data } = await api.post(`/public/businesses/${slug}/services/${chosen.slug}/bookings`, {
        startAt: slot.startAt,
        staffId: slot.staffIds[0],
        customer: { fullName: values.fullName, email: values.email, phone: values.phone || '' },
        consent: { email: values.consentEmail },
        idempotencyKey: crypto.randomUUID().replace(/-/g, '').slice(0, 24),
      });
      setResult(data.data);
      setStep('done');
    } catch (err) {
      const info = errorInfo(err);
      const fe = fieldErrors(info);
      Object.entries(fe).forEach(([k, v]) => form.setError(k.replace(/^customer\./, ''), { message: v }));
      setSubmitError(info.status === 409 ? 'That time was just taken. Please pick another time.' : info.message);
      if (info.status === 409) setStep('time');
    }
  });

  if (business.loading) return <div className="mx-auto max-w-2xl p-8"><Skeleton rows={5} /></div>;
  if (business.error?.status === 404) return <div className="mx-auto max-w-2xl p-8"><EmptyState title="Booking page not found" body="This business may have moved or closed its booking page." /></div>;
  if (business.error) return <div className="mx-auto max-w-2xl p-8"><ErrorState error={business.error} onRetry={business.reload} /></div>;

  const slots = availability.data?.slots ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <PageHeader title={business.data.organization.name} description={`Book an appointment · times shown in ${tz}`} />
      <ol className="flex flex-wrap gap-2 text-xs font-medium text-slate-600" aria-label="Booking steps">
        {['service', 'date', 'time', 'details', 'done'].map((s, i) => (
          <li key={s} aria-current={s === step ? 'step' : undefined} className={s === step ? 'font-bold text-indigo-700' : ''}>{i + 1}. {s === 'done' ? 'Confirmed' : s[0].toUpperCase() + s.slice(1)}</li>
        ))}
      </ol>

      {step === 'service' && (
        <Card title="Choose a service">
          {services.length === 0 ? (
            <EmptyState title="No services are available yet" body="Please check back later." />
          ) : (
            <ul className="space-y-3">
              {services.map((s) => (
                <li key={s.slug}>
                  <button className="w-full rounded-xl p-4 text-left ring-1 ring-slate-300 hover:ring-indigo-500" onClick={() => { setService(s); setStep('date'); }}>
                    <span className="block font-semibold">{s.name}</span>
                    <span className="text-sm text-slate-600">{s.durationMinutes} min · {money(s.priceMinor, s.currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {step === 'date' && chosen && (
        <Card title={`${chosen.name}: choose a date`}>
          <Field label="Date" hint="Choose a day up to 60 days ahead.">
            {(p) => <Input type="date" {...p} value={date} min={todayIn(tz, 0)} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <div className="mt-4 flex justify-between">
            <Button variant="ghost" onClick={() => setStep('service')}>Back</Button>
            <Button onClick={() => setStep('time')} disabled={!date}>See times</Button>
          </div>
        </Card>
      )}

      {step === 'time' && chosen && (
        <Card title={`Times on ${date}`}>
          {availability.loading && <Skeleton rows={3} />}
          {availability.error && <ErrorState error={availability.error} onRetry={availability.reload} />}
          {!availability.loading && !availability.error && slots.length === 0 && (
            <EmptyState title="No times free on this day" body="Try another date." action={<Button variant="secondary" onClick={() => setStep('date')}>Choose another date</Button>} />
          )}
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Available times">
            {slots.map((s) => (
              <li key={s.startAt}>
                <button
                  className="w-full rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-slate-300 hover:ring-indigo-600 focus-visible:outline-indigo-600"
                  onClick={() => { setSlot(s); setStep('details'); }}
                  aria-label={`Book ${s.localTime} with ${s.staffNames.join(' or ')}`}
                >
                  {s.localTime}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4"><Button variant="ghost" onClick={() => setStep('date')}>Back</Button></div>
        </Card>
      )}

      {step === 'details' && chosen && slot && (
        <Card title="Your details">
          <p className="mb-4 text-sm text-slate-700">{chosen.name} · {whenText(slot.startAt, tz)} · {slot.staffNames[0]} · {money(chosen.priceMinor, chosen.currency)}</p>
          {submitError && <div className="mb-4"><Alert tone="error">{submitError}</Alert></div>}
          <form onSubmit={submit} noValidate className="space-y-4">
            <Field label="Full name" error={form.formState.errors.fullName?.message}>{(p) => <Input autoComplete="name" {...p} {...form.register('fullName')} />}</Field>
            <Field label="Email" error={form.formState.errors.email?.message}>{(p) => <Input type="email" autoComplete="email" {...p} {...form.register('email')} />}</Field>
            <Field label="Phone (optional)" error={form.formState.errors.phone?.message}>{(p) => <Input type="tel" autoComplete="tel" {...p} {...form.register('phone')} />}</Field>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" {...form.register('consentEmail')} />
              <span>Email me my confirmation and appointment reminders. You can still cancel or reschedule from the link we send.</span>
            </label>
            <div className="flex justify-between">
              <Button variant="ghost" type="button" onClick={() => setStep('time')}>Back</Button>
              <Button type="submit" loading={form.formState.isSubmitting}>Confirm booking</Button>
            </div>
          </form>
        </Card>
      )}

      {step === 'done' && result && (
        <Card title="You are booked">
          <Alert tone="success">Your appointment is confirmed for {whenText(result.appointment.startAt, tz)}.</Alert>
          <p className="mt-4 text-sm text-slate-700">{result.message}</p>
        </Card>
      )}
    </div>
  );
}

