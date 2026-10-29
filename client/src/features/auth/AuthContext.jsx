import { createContext, useContext, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setCsrf } from '../../lib/api';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const cache = useQueryClient();
  const session = useQuery({ queryKey: ['session'], retry: false, queryFn: async () => {
    try {
      const [me, csrf] = await Promise.all([api('/auth/me'), api('/auth/csrf')]);
      setCsrf(csrf.data.csrfToken); return me.data;
    } catch (error) { if (error.status === 401) return null; throw error; }
  } });
  useEffect(() => {
    function expired() { setCsrf(null); cache.cancelQueries(); cache.removeQueries({ predicate: query => query.queryKey[0] !== 'session' }); cache.setQueryData(['session'], null); }
    window.addEventListener('session-expired', expired); return () => window.removeEventListener('session-expired', expired);
  }, [cache]);
  async function authenticate(path, body) {
    const result = await api(path, { method: 'POST', body });
    await cache.cancelQueries(); cache.removeQueries({ predicate: query => query.queryKey[0] !== 'session' });
    setCsrf(result.data.csrfToken); cache.setQueryData(['session'], result.data.user);
    return result.data.user;
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    await cache.cancelQueries(); setCsrf(null); cache.removeQueries({ predicate: query => query.queryKey[0] !== 'session' }); cache.setQueryData(['session'], null);
  }
  return <AuthContext.Provider value={{ user: session.data, loading: session.isPending, error: session.error, retry: session.refetch, login: body => authenticate('/auth/login', body), register: body => authenticate('/auth/register', body), logout }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
