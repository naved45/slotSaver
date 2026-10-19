import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, errorInfo, fieldErrors } from '../../lib/api.js';
import { signupSchema } from '../../lib/schemas.js';
import { Alert, Button, Field, Input, PasswordInput, Select } from '../../components/ui.jsx';

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];

export default function SignupPage() {
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState(null);
  const form = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '', businessName: '', businessType: 'dental', timezone: 'Asia/Kolkata', termsAccepted: false },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api.post('/auth/signup', values);
      setDone(true);
    } catch (err) {
      const info = errorInfo(err);
      Object.entries(fieldErrors(info)).forEach(([k, v]) => form.setError(k, { message: v }));
      setServerError(info.status === 429 ? 'Too many sign-up attempts. Please wait an hour and try again.' : info.message);
    }
  });

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 space-y-4">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <Alert tone="success">We sent a verification link. It expires in 24 hours. Open it, then sign in.</Alert>
        <Button variant="secondary" onClick={() => navigate('/login')}>Go to sign in</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold">Start your free trial</h1>
      <p className="mt-1 text-sm text-slate-700">Already registered? <Link className="font-medium text-indigo-700 underline" to="/login">Sign in</Link></p>
      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <Field label="Full name" error={errors.fullName?.message}>{(p) => <Input autoComplete="name" {...p} {...form.register('fullName')} />}</Field>
        <Field label="Work email" error={errors.email?.message}>{(p) => <Input type="email" autoComplete="email" {...p} {...form.register('email')} />}</Field>
        <Field label="Password" hint="At least 10 characters." error={errors.password?.message}>{(p) => <PasswordInput autoComplete="new-password" {...p} {...form.register('password')} />}</Field>
        <Field label="Confirm password" error={errors.confirmPassword?.message}>{(p) => <PasswordInput autoComplete="new-password" {...p} {...form.register('confirmPassword')} />}</Field>
        <Field label="Business name" error={errors.businessName?.message}>{(p) => <Input {...p} {...form.register('businessName')} />}</Field>
        <Field label="Business type" error={errors.businessType?.message}>{(p) => (
          <Select {...p} {...form.register('businessType')}>
            {['dental', 'salon', 'physiotherapy', 'wellness', 'consulting', 'other'].map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
          </Select>
        )}</Field>
        <Field label="Business timezone" error={errors.timezone?.message}>{(p) => (
          <Select {...p} {...form.register('timezone')}>{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</Select>
        )}</Field>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4" {...form.register('termsAccepted')} />
          <span>I accept the <Link className="underline" to="/terms">Terms of Service</Link> and <Link className="underline" to="/privacy">Privacy Policy</Link>.</span>
        </label>
        {errors.termsAccepted && <p role="alert" className="text-sm text-red-700">{errors.termsAccepted.message}</p>}
        <Button type="submit" className="w-full" loading={isSubmitting}>Create account</Button>
      </form>
    </div>
  );
}
