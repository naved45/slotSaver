import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorInfo } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { Alert, Button, Card, EmptyState, ErrorState, Skeleton } from '../../components/ui.jsx';

/** Accept or decline a waitlist slot. The first valid acceptance reserves the slot. */
export default function OfferPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const offer = useApi(() => api.get(`/public/slot-offers/${token}`).then((r) => r.data.data), [token]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const accept = async () => {
    setBusy(true); setError(null);
    try {
      const { data } = await api.post(`/public/slot-offers/${token}/accept`);
      setResult({ ok: true, message: data.data.message });
    } catch (err) {
      const info = errorInfo(err);
      setError(info.status === 410 ? 'Sorry, this offer has expired or was already taken.' : info.message);
      if (info.status === 410) offer.reload();
    } finally { setBusy(false); }
  };

  const decline = async () => {
    setBusy(true); setError(null);
    try {
      await api.post(`/public/slot-offers/${token}/decline`);
      setResult({ ok: false, message: 'You declined this slot. Thank you for letting us know.' });
    } catch (err) { setError(errorInfo(err).message); }
    finally { setBusy(false); }
  };

  if (offer.loading) return <div className="mx-auto max-w-xl p-8"><Skeleton rows={3} /></div>;
  if (offer.error?.status === 404) return <div className="mx-auto max-w-xl p-8"><EmptyState title="This offer link is not valid" /></div>;
  if (offer.error) return <div className="mx-auto max-w-xl p-8"><ErrorState error={offer.error} onRetry={offer.reload} /></div>;

  const o = offer.data;
  const live = o.status === 'pending';

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold">A slot opened up</h1>
      {result && <Alert tone={result.ok ? 'success' : 'info'}>{result.message}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <Card>
        <p className="font-semibold">{o.serviceName}</p>
        <p className="text-sm text-slate-700">{o.organization} · {o.startText}</p>
        {live && !result ? (
          <>
            <p className="mt-3 text-sm text-slate-700">This offer ends {o.expiresText}. First come, first served.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={accept} loading={busy}>Accept this slot</Button>
              <Button variant="secondary" onClick={decline} disabled={busy}>No thanks</Button>
            </div>
          </>
        ) : (
          !result && <Alert tone="warn">This offer is {o.status}. {o.status === 'expired' ? 'It has ended.' : ''}</Alert>
        )}
        {result?.ok && <Button className="mt-4" variant="secondary" onClick={() => navigate('/')}>Back to home</Button>}
      </Card>
    </div>
  );
}
