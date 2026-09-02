import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { accessTokenKey } from '../api/client.js';
import { login, logout, register, getMe } from '../api/auth.js';

const authSnapshot = () => Boolean(localStorage.getItem(accessTokenKey));
const subscribeAuth = (callback: () => void) => {
  window.addEventListener('leadguard-auth-changed', callback);
  return () => window.removeEventListener('leadguard-auth-changed', callback);
};

export function useAuth() {
  const authenticated = useSyncExternalStore(subscribeAuth, authSnapshot, () => false);

  // The JWT itself carries no privilege claims (see apps/api/src/auth.ts), so
  // platformAdmin can only come from a live server read — this is that read,
  // cached per session. It is a UI convenience only: every admin-only route
  // and mutation is still authorized server-side by requirePlatformAdmin().
  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
    enabled: authenticated,
    staleTime: 60_000,
    retry: false,
  });

  return {
    authenticated,
    login,
    register,
    logout,
    platformAdmin: meQuery.data?.user.platformAdmin ?? false,
    isPlatformAdminKnown: !authenticated || meQuery.isSuccess || meQuery.isError,
  };
}
