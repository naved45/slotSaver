import { describe, it, expect } from 'vitest';
import { money, minutesToHHMM, hhmmToMinutes, STATUS_LABEL } from '../lib/format.js';
import { loginSchema, signupSchema, customerSchema } from '../lib/schemas.js';

describe('money and time helpers', () => {
  it('formats minor units as rupees without decimals', () => {
    expect(money(50000, 'INR')).toContain('500');
    expect(money(0, 'INR')).toContain('0');
  });
  it('converts between minutes and HH:MM', () => {
    expect(minutesToHHMM(540)).toBe('09:00');
    expect(hhmmToMinutes('18:30')).toBe(1110);
  });
  it('labels no-show clearly for screen readers', () => {
    expect(STATUS_LABEL.no_show).toBe('No-show');
  });
});

describe('client validation mirrors the server', () => {
  it('requires an email and password on sign-in', () => {
    const r = loginSchema.safeParse({ email: 'not-an-email', password: '' });
    expect(r.success).toBe(false);
    expect(r.error.issues.map((i) => i.path[0]).sort()).toEqual(['email', 'password']);
  });

  it('rejects mismatched passwords at sign-up', () => {
    const base = {
      fullName: 'Asha Verma', email: 'asha@example.com', password: 'long-enough-password', confirmPassword: 'different-long-one',
      businessName: 'Maple Dental', businessType: 'dental', timezone: 'Asia/Kolkata', termsAccepted: true,
    };
    const r = signupSchema.safeParse(base);
    expect(r.success).toBe(false);
    expect(r.error.issues[0].path).toEqual(['confirmPassword']);
  });

  it('requires terms acceptance at sign-up', () => {
    const r = signupSchema.safeParse({
      fullName: 'Asha Verma', email: 'asha@example.com', password: 'long-enough-password', confirmPassword: 'long-enough-password',
      businessName: 'Maple Dental', businessType: 'dental', timezone: 'Asia/Kolkata', termsAccepted: false,
    });
    expect(r.success).toBe(false);
  });

  it('validates customer contact details', () => {
    expect(customerSchema.safeParse({ fullName: 'A', email: 'x@y.co' }).success).toBe(false);
    expect(customerSchema.safeParse({ fullName: 'Asha V', email: 'asha@example.com', phone: '' }).success).toBe(true);
  });
});
