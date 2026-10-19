import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorInfo } from '../../lib/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Alert, Button, Card } from '../../components/ui.jsx';

export default function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { status, user, refresh } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true); setError(null);
    try {
      await api.post('/invitations/accept', { token });
      await refresh();
      navigate('/app', { replace: true });
    } catch (err) { setError(errorInfo(err).message); }
    finally { setBusy(false); }
  };

  if (!token) return <div className="mx-auto max-w-md p-8"><Alert tone="error">This invitation link is incomplete.</Alert></div>;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card title="Join your team">
        {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
        {status !== 'ready' || !user ? (
          <p className="text-sm text-slate-700">Sign in with the email address this invitation was sent to, then return to this link. <Link className="underline" to={`/login`}>Sign in</Link></p>
        ) : (
          <Button onClick={accept} loading={busy}>Accept invitation</Button>
        )}
      </Card>
    </div>
  );
}
