import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/**
 * Centralized API client. Sends the session cookie (HttpOnly, never readable by JS) and the
 * CSRF header required on every mutation. No tokens are stored in localStorage.
 */
export const api = axios.create({
  baseURL: `${BASE}/api/v1`,
  withCredentials: true,
  timeout: 15000,
  headers: { 'X-Requested-With': 'SlotSaver' },
});

/** Normalizes any failure into one shape the UI can show. */
export function errorInfo(err) {
  const body = err?.response?.data?.error;
  const status = err?.response?.status ?? 0;
  if (!err?.response) {
    return { status, code: 'NETWORK', message: 'Cannot reach SlotSaver right now. Check your connection and try again.', requestId: null, details: [] };
  }
  return {
    status,
    code: body?.code ?? 'ERROR',
    message: body?.message ?? 'Something went wrong. Please try again.',
    requestId: body?.requestId ?? null,
    details: body?.details ?? [],
  };
}

/** Field-level message map for react-hook-form setError. */
export function fieldErrors(info) {
  return Object.fromEntries((info.details ?? []).filter((d) => d.path).map((d) => [d.path, d.message]));
}
