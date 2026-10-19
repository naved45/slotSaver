import { z } from 'zod';

/** Client-side rules mirror the server. The server always re-validates. */
export const emailSchema = z.string().trim().min(1, 'Enter your email').email('Enter a valid email address');
export const passwordSchema = z.string().min(10, 'Use at least 10 characters').max(128);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

export const signupSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name').max(120),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    businessName: z.string().trim().min(2, 'Enter your business name').max(120),
    businessType: z.enum(['dental', 'salon', 'physiotherapy', 'wellness', 'consulting', 'other']),
    timezone: z.string().min(1, 'Choose a timezone'),
    termsAccepted: z.literal(true, { message: 'You must accept the terms to continue' }),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

export const resetSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

export const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,80}$/, 'Use lowercase letters, numbers and hyphens'),
  durationMinutes: z.coerce.number().int().min(5, 'At least 5 minutes').max(480),
  bufferMinutes: z.coerce.number().int().min(0).max(240),
  priceRupees: z.coerce.number().min(0, 'Price cannot be negative'),
});

export const customerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the customer name').max(120),
  email: emailSchema,
  phone: z.string().trim().max(30).optional().or(z.literal('')),
});

export const staffSchema = z.object({
  displayName: z.string().trim().min(2, 'Enter a display name').max(120),
});

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(['admin', 'staff']),
});
