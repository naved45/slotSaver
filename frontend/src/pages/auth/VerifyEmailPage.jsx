import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorInfo } from '../../lib/api.js';
import { Alert, Skeleton } from '../../components/ui.jsx';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState({ loading: Boolean(token), message: null, error: token ? null : 'This link is incomplete.' });

  useEffect(() => {
    if (!token) return;
    api.post('/auth/verify-email', { token })
      .then(({ data }) => setState({ loading: false, message: data.data.message, error: null }))
      .catch((err) => setState({ loading: false, message: null, error: errorInfo(err).message }));
  }, [token]);

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-12">
      <h1 className="text-2xl font-bold">Verify your email</h1>
      {state.loading && <Skeleton rows={1} />}
      {state.message && <><Alert tone="success">{state.message}</Alert><Link className="font-medium text-indigo-700 underline" to="/login">Sign in</Link></>}
      {state.error && <Alert tone="error">{state.error} You can request a new link by signing in.</Alert>}
    </div>
  );
}
