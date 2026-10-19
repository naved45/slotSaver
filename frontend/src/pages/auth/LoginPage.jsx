import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../../auth/AuthContext.jsx';
import { loginSchema } from '../../lib/schemas.js';
import { errorInfo, fieldErrors } from '../../lib/api.js';
import { Alert, Button, Field, Input, PasswordInput } from '../../components/ui.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState(null);
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const account = await login(values.email, values.password);
      const dest = location.state?.from ?? (account.memberships.length ? '/app' : '/onboarding');
      navigate(dest, { replace: true });
    } catch (err) {
      const info = errorInfo(err);
      const fe = fieldErrors(info);
      Object.entries(fe).forEach(([k, v]) => form.setError(k, { message: v }));
      setServerError(info.code === 'EMAIL_NOT_VERIFIED' ? 'Verify your email first. Check your inbox for the link.' : info.message);
    }
  });

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">Sign in to SlotSaver</h1>
      <p className="mt-1 text-sm text-slate-700">New here? <Link className="font-medium text-indigo-700 underline" to="/signup">Create an account</Link></p>
      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <Field label="Email" error={errors.email?.message}>{(p) => <Input type="email" autoComplete="email" {...p} {...form.register('email')} />}</Field>
        <Field label="Password" error={errors.password?.message}>{(p) => <PasswordInput autoComplete="current-password" {...p} {...form.register('password')} />}</Field>
        <div className="flex items-center justify-between text-sm">
          <Link to="/forgot-password" className="font-medium text-indigo-700 underline">Forgot password?</Link>
        </div>
        <Button type="submit" className="w-full" loading={isSubmitting}>Sign in</Button>
      </form>
    </div>
  );
}
