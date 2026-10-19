import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, errorInfo } from '../lib/api.js';

const AuthContext = createContext(null);

/**
 * Session state comes from the server (/auth/me). The browser never stores the session token.
 * `org` is the user's first active organization, which is the single business in the MVP.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', account: null, error: null });

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setState({ status: 'ready', account: data.data, error: null });
      return data.data;
    } catch (err) {
      const info = errorInfo(err);
      if (info.status === 401) setState({ status: 'anonymous', account: null, error: null });
      else setState({ status: 'error', account: null, error: info });
      return null;
    }
  }, []);

  // Restoring the session on load is an intentional one-time fetch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setState({ status: 'ready', account: data.data, error: null });
    return data.data;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* session may already be gone */ }
    setState({ status: 'anonymous', account: null, error: null });
  }, []);

  const membership = state.account?.memberships?.[0] ?? null;
  const value = useMemo(() => ({
    status: state.status,
    error: state.error,
    user: state.account?.user ?? null,
    account: state.account,
    org: membership
      ? { id: membership.organizationId, role: membership.role, name: membership.organization?.name, slug: membership.organization?.slug, timezone: membership.organization?.timezone ?? 'UTC', staffProfileId: membership.staffProfileId ?? null }
      : null,
    refresh,
    login,
    logout,
  }), [state, membership, refresh, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
