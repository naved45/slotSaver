import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Button, ErrorState, Skeleton } from './ui.jsx';

/** Guards /app routes. The server is still the real gate: this only improves navigation. */
export default function RequireAuth() {
  const { status, user, org, error, refresh } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <div className="mx-auto max-w-3xl p-8"><Skeleton rows={4} /></div>;
  if (status === 'error') return <div className="mx-auto max-w-xl p-8"><ErrorState error={error} onRetry={refresh} /></div>;
  if (status !== 'ready' || !user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!user.emailVerified) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-8">
        <h1 className="text-2xl font-bold">Verify your email to continue</h1>
        <p className="text-slate-700">We sent a link to {user.email}. Open it on this device, then reload this page.</p>
        <Button variant="secondary" onClick={refresh}>I have verified my email</Button>
      </div>
    );
  }
  if (!org) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
