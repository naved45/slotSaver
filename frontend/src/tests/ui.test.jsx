import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorState, EmptyState, ConfirmDialog, Badge, PasswordInput, Field, Input } from '../components/ui.jsx';

describe('shared UI states', () => {
  it('shows an error with a retry button and the support reference', () => {
    const onRetry = vi.fn();
    render(<ErrorState error={{ message: 'Cannot reach SlotSaver', requestId: 'req-42' }} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach SlotSaver');
    expect(screen.getByText(/req-42/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state with a title', () => {
    render(<EmptyState title="No appointments yet" body="Add one to get started." />);
    expect(screen.getByText('No appointments yet')).toBeInTheDocument();
  });

  it('labels statuses in words, not colour alone', () => {
    render(<Badge status="no_show" />);
    expect(screen.getByText('No-show')).toBeInTheDocument();
  });
});

describe('forms', () => {
  it('toggles password visibility with an accessible label', () => {
    render(<PasswordInput aria-label="Password" defaultValue="secret-value-1" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });

  it('links a field error to its input for screen readers', () => {
    render(
      <Field label="Email" error="Enter a valid email address">
        {(p) => <Input type="email" {...p} />}
      </Field>
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
  });
});

describe('confirmation dialog', () => {
  it('closes on Escape and does not confirm', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="Cancel appointment?" confirmLabel="Yes" onCancel={onCancel} onConfirm={onConfirm} />);
    expect(screen.getByRole('dialog', { name: 'Cancel appointment?' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
