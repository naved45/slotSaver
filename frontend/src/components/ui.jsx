import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

const cx = (...c) => c.filter(Boolean).join(' ');

export function Button({ variant = 'primary', loading = false, disabled, className, children, ...props }) {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'bg-white text-navy-900 ring-1 ring-slate-300 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-indigo-700 hover:bg-indigo-50',
  };
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50',
        styles[variant],
        className
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Label, input, and linked error text. The id wiring keeps screen readers announcing errors. */
export function Field({ label, error, hint, children, id: idProp }) {
  const auto = useId();
  const id = idProp ?? auto;
  const child = typeof children === 'function' ? children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined }) : children;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-navy-900">{label}</label>
      {child}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-slate-600">{hint}</p>}
      {error && <p id={`${id}-err`} className="text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}

const inputCls = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900 placeholder:text-slate-500 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200 aria-[invalid=true]:border-red-600';

export function Input({ className, ...props }) {
  return <input {...props} className={cx(inputCls, className)} />;
}

export function Select({ className, children, ...props }) {
  return <select {...props} className={cx(inputCls, className)}>{children}</select>;
}

export function Textarea({ className, ...props }) {
  return <textarea {...props} className={cx(inputCls, className)} />;
}

export function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={cx(inputCls, 'pr-16')} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-indigo-700 hover:underline"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

export function Card({ title, actions, children, className }) {
  return (
    <section className={cx('rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200', className)}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-navy-900">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-bold text-navy-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const BADGE = {
  confirmed: 'bg-green-100 text-green-800',
  completed: 'bg-slate-200 text-slate-800',
  requested: 'bg-amber-100 text-amber-900',
  pending: 'bg-amber-100 text-amber-900',
  cancelled: 'bg-red-100 text-red-800',
  no_show: 'bg-red-100 text-red-800',
  expired: 'bg-slate-200 text-slate-700',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-slate-200 text-slate-700',
  active: 'bg-indigo-100 text-indigo-800',
  booked: 'bg-green-100 text-green-800',
};
const BADGE_LABEL = { no_show: 'No-show' };

/** Status is always shown as text, never by colour alone. */
export function Badge({ status }) {
  return (
    <span className={cx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', BADGE[status] ?? 'bg-slate-100 text-slate-700')}>
      {BADGE_LABEL[status] ?? status?.replace(/_/g, ' ')}
    </span>
  );
}

export function Alert({ tone = 'info', children }) {
  const tones = { info: 'bg-indigo-50 text-indigo-900 ring-indigo-200', success: 'bg-green-50 text-green-900 ring-green-200', error: 'bg-red-50 text-red-900 ring-red-200', warn: 'bg-amber-50 text-amber-900 ring-amber-200' };
  return <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-lg p-3 text-sm ring-1', tones[tone])}>{children}</div>;
}

export function Skeleton({ rows = 3 }) {
  return (
    <div className="space-y-3" aria-label="Loading" role="status">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-200" />)}
    </div>
  );
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 p-8 text-center">
      <Inbox className="h-8 w-8 text-slate-500" aria-hidden="true" />
      <p className="font-semibold text-navy-900">{title}</p>
      {body && <p className="max-w-sm text-sm text-slate-600">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl bg-red-50 p-5 ring-1 ring-red-200">
      <div className="flex items-center gap-2 font-semibold text-red-900">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" /> Something went wrong
      </div>
      <p className="text-sm text-red-900">{error?.message ?? 'Please try again.'}</p>
      {error?.requestId && <p className="text-xs text-red-800">Reference: {error.requestId}</p>}
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      <span className="text-slate-600">Page {page} of {pages} · {total} total</span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</Button>
      </div>
    </nav>
  );
}

/** Accessible confirmation dialog: traps focus, closes on Escape, restores focus on close. */
export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel, loading }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    ref.current?.querySelector('button')?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4" role="presentation">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="confirm-title" className="text-lg font-semibold">{title}</h2>
        {body && <p className="mt-2 text-sm text-slate-700">{body}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>Keep it</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-navy-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
