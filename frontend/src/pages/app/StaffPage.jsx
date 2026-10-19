import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, errorInfo } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { staffSchema } from '../../lib/schemas.js';
import { Alert, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Skeleton } from '../../components/ui.jsx';

export default function StaffPage() {
  const { org } = useAuth();
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const staff = useApi(() => api.get(`/orgs/${org.id}/staff`).then((r) => r.data.data), [org.id]);
  const services = useApi(() => api.get(`/orgs/${org.id}/services`).then((r) => r.data.data), [org.id]);
  const form = useForm({ resolver: zodResolver(staffSchema), defaultValues: { displayName: '' } });
  const [assign, setAssign] = useState({});

  const add = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post(`/orgs/${org.id}/staff`, { displayName: v.displayName, serviceIds: [] });
      form.reset(); setMessage('Staff member added. Assign services and working hours below.'); staff.reload();
    } catch (err) { setError(errorInfo(err).message); }
  });

  const saveServices = async (s) => {
    setError(null); setMessage(null);
    try {
      await api.patch(`/orgs/${org.id}/staff/${s._id}`, { serviceIds: assign[s._id] ?? s.serviceIds });
      setMessage(`Saved services for ${s.displayName}.`); staff.reload();
    } catch (err) { setError(errorInfo(err).message); }
  };

  const toggleService = (s, serviceId) => {
    const current = assign[s._id] ?? s.serviceIds.map(String);
    setAssign({ ...assign, [s._id]: current.includes(serviceId) ? current.filter((x) => x !== serviceId) : [...current, serviceId] });
  };

  const setHours = async (s) => {
    setError(null);
    try {
      const days = [1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startMinute: 540, endMinute: 1080, breaks: [] }));
      await api.put(`/orgs/${org.id}/staff/${s._id}/availability`, { days });
      setMessage(`Working hours saved for ${s.displayName} (Mon–Sat, 09:00–18:00).`);
    } catch (err) { setError(errorInfo(err).message); }
  };

  return (
    <>
      <PageHeader title="Staff" description="Who can provide which services, and when they work." />
      {message && <div className="mb-4"><Alert tone="success">{message}</Alert></div>}
      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Add staff member" className="lg:col-span-1">
          <form onSubmit={add} noValidate className="space-y-4">
            <Field label="Display name" error={form.formState.errors.displayName?.message}>{(p) => <Input {...p} {...form.register('displayName')} />}</Field>
            <Button type="submit" loading={form.formState.isSubmitting}>Add staff member</Button>
          </form>
          <p className="mt-4 text-xs text-slate-600">To give a staff member their own sign-in, invite them from Settings.</p>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          {staff.loading && <Skeleton rows={3} />}
          {staff.error && <ErrorState error={staff.error} onRetry={staff.reload} />}
          {staff.data?.length === 0 && <EmptyState title="No staff yet" body="Add the people who take appointments." />}
          {(staff.data ?? []).map((s) => (
            <Card key={s._id} title={s.displayName} actions={<Button variant="secondary" onClick={() => setHours(s)}>Set Mon–Sat 9–6</Button>}>
              <fieldset>
                <legend className="text-sm font-medium">Services offered</legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  {(services.data ?? []).map((svc) => {
                    const checked = (assign[s._id] ?? s.serviceIds.map(String)).includes(String(svc._id));
                    return (
                      <label key={svc._id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="h-4 w-4" checked={checked} onChange={() => toggleService(s, String(svc._id))} />
                        {svc.name}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <div className="mt-4"><Button variant="secondary" onClick={() => saveServices(s)}>Save services</Button></div>
              <p className="mt-3 text-xs text-slate-600">{s.availability.length} working days set.</p>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
