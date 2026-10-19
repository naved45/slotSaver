import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, errorInfo } from '../../lib/api.js';
import { resetSchema } from '../../lib/schemas.js';
import { Alert, Button, Field, PasswordInput } from '../../components/ui.jsx';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  const form = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirmPassword: '' } });
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const { data } = await api.post('/auth/reset-password', { token, password: v.password, confirmPassword: v.confirmPassword });
      setDone(data.data.message);
    } catch (err) { setError(errorInfo(err).message); }
  });
  if (!token) return <div className="mx-auto max-w-md p-8"><Alert tone="error">This reset link is incomplete. Request a new one.</Alert></div>;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      {done ? (
        <div className="mt-6 space-y-4"><Alert tone="success">{done}</Alert><Link className="font-medium text-indigo-700 underline" to="/login">Sign in</Link></div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="New password" hint="At least 10 characters." error={form.formState.errors.password?.message}>{(p) => <PasswordInput autoComplete="new-password" {...p} {...form.register('password')} />}</Field>
          <Field label="Confirm new password" error={form.formState.errors.confirmPassword?.message}>{(p) => <PasswordInput autoComplete="new-password" {...p} {...form.register('confirmPassword')} />}</Field>
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>Save password</Button>
        </form>
      )}
    </div>
  );
}
