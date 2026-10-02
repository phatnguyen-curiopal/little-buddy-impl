import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearSession, hasSession, onSessionChange } from './api.js';

const AuthContext = createContext(null);

// status: loading (a stored session is being restored) | signedIn | signedOut
export function AuthProvider({ children }) {
  const [state, setState] = useState(() => ({ status: hasSession() ? 'loading' : 'signedOut', me: null }));

  useEffect(() => {
    if (state.status !== 'loading') return;
    api.me()
      .then((me) => setState({ status: 'signedIn', me }))
      .catch(() => {
        clearSession();
        setState({ status: 'signedOut', me: null });
      });
    // Runs once for the stored session only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A failed refresh anywhere (for example a revoked session) signs out here.
  useEffect(() => onSessionChange(() => {
    if (!hasSession()) setState({ status: 'signedOut', me: null });
  }), []);

  const login = useCallback(async (email, password) => {
    const out = await api.login({ email, password });
    setState({ status: 'signedIn', me: { parent: out.parent, family: out.family } });
  }, []);

  const register = useCallback(async (body) => {
    const out = await api.register(body);
    setState({ status: 'signedIn', me: { parent: out.parent, family: out.family } });
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setState({ status: 'signedOut', me: null });
  }, []);

  const value = useMemo(() => ({ ...state, login, register, logout }), [state, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
