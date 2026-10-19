import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, errorInfo } from '../../lib/api.js';
import { emailSchema } from '../../lib/schemas.js';
import { Alert, Button, Field, Input } from '../../components/ui.jsx';

const schema = z.object({ email: emailSchema });

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const { data } = await api.post('/auth/forgot-password', v);
      setMessage(data.data.message);
    } catch (err) { setError(errorInfo(err).message); }
  });
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">Reset your password</h1>
      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        {message && <Alert tone="success">{message}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Email" error={form.formState.errors.email?.message}>{(p) => <Input type="email" {...p} {...form.register('email')} />}</Field>
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>Send reset link</Button>
      </form>
    </div>
  );
}
