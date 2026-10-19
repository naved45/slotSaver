import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorInfo } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { Alert, Button, Card, PageHeader, Skeleton } from '../../components/ui.jsx';

/**
 * Guided setup after signup. Each step shows whether it is done (from the server) and offers one
 * action. Nothing is marked done unless the server confirms it.
 */
export default function OnboardingPage() {
  const { org } = useAuth();
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const state = useApi(async () => {
    const [hours, services, staff] = await Promise.all([
      api.get(`/orgs/${org.id}/business-hours`),
      api.get(`/orgs/${org.id}/services`),
      api.get(`/orgs/${org.id}/staff`),
    ]);
    return { hours: hours.data.data.length, services: services.data.data.length, staff: staff.data.data.length };
  }, [org.id]);

  const setHours = async () => {
    setErr(null);
    try {
      await api.put(`/orgs/${org.id}/business-hours`, { days: [1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, openMinute: 540, closeMinute: 1080, breaks: [] })) });
      setMsg('Opening hours saved: Monday to Saturday, 09:00 to 18:00. Change them any time in Settings.');
      state.reload();
    } catch (e) { setErr(errorInfo(e).message); }
  };

  if (state.loading) return <Skeleton rows={3} />;
  const s = state.data ?? { hours: 0, services: 0, staff: 0 };
  const steps = [
    { done: s.hours > 0, title: 'Set opening hours', action: <Button onClick={setHours}>Use Mon–Sat 9–6</Button> },
    { done: s.services > 0, title: 'Add a service', action: <Link to="/app/services"><Button variant="secondary">Add service</Button></Link> },
    { done: s.staff > 0, title: 'Add staff', action: <Link to="/app/staff"><Button variant="secondary">Add staff</Button></Link> },
    { done: false, title: 'Share your booking link', action: <Link to={`/book/${org.slug}`}><Button variant="secondary">Preview booking page</Button></Link> },
  ];

  return (
    <>
      <PageHeader title={`Welcome to ${org.name}`} description="Finish these steps so customers can book." actions={<Link to="/app"><Button variant="secondary">Go to dashboard</Button></Link>} />
      {msg && <div className="mb-4"><Alert tone="success">{msg}</Alert></div>}
      {err && <div className="mb-4"><Alert tone="error">{err}</Alert></div>}
      <ol className="space-y-4">
        {steps.map((st, i) => (
          <li key={st.title}>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-600">Step {i + 1} {st.done ? '· done' : ''}</p>
                  <p className="font-semibold">{st.title}</p>
                </div>
                {!st.done && st.action}
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </>
  );
}
