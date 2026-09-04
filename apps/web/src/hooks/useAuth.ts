import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { accessTokenKey } from '../api/client.js';
import { login, logout, register, getMe } from '../api/auth.js';

const authSnapshot = () => Boolean(localStorage.getItem(accessTokenKey));
const subscribeAuth = (callback: () => void) => {
  window.addEventListener('leadguard-auth-changed', callback);
  return () => window.removeEventListener('leadguard-auth-changed', callback);
};

// UI-side mirror of apps/api/src/middleware/rbac.ts's ROLE_CAPABILITIES —
// display/navigation convenience only. Keep in sync by hand; the server is
// the only real enforcement point (requirePlatformCapability()).
const ROLE_CAPABILITIES: Record<string, string[]> = {
  OWNER: ['FINANCE_VIEW', 'REFUND_ISSUE', 'OPERATIONS_VIEW', 'OPERATIONS_MANAGE', 'CUSTOMER_360_VIEW', 'SECURITY_VIEW', 'PLATFORM_VIEW', 'CUSTOMER_VIEW', 'CUSTOMER_MANAGE', 'AUDIT_LOG_VIEW', 'PLATFORM_ROLE_MANAGE'],
  FINANCE: ['FINANCE_VIEW', 'REFUND_ISSUE', 'PLATFORM_VIEW'],
  OPERATIONS: ['OPERATIONS_VIEW', 'OPERATIONS_MANAGE', 'PLATFORM_VIEW'],
  SECURITY: ['SECURITY_VIEW', 'AUDIT_LOG_VIEW', 'PLATFORM_VIEW'],
  SUPPORT: ['CUSTOMER_VIEW', 'CUSTOMER_360_VIEW', 'PLATFORM_VIEW'],
  ANALYST: ['PLATFORM_VIEW', 'FINANCE_VIEW', 'CUSTOMER_360_VIEW'],
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

  const explicitCapabilities = meQuery.data?.user.platformCapabilities ?? [];
  const platformRole = meQuery.data?.user.platformRole ?? null;
  const roleCapabilities = platformRole ? (ROLE_CAPABILITIES[platformRole] ?? []) : [];
  const effectiveCapabilities = new Set([...explicitCapabilities, ...roleCapabilities]);

  return {
    authenticated,
    login,
    register,
    logout,
    platformAdmin: meQuery.data?.user.platformAdmin ?? false,
    isPlatformAdminKnown: !authenticated || meQuery.isSuccess || meQuery.isError,
    platformCapabilities: [...effectiveCapabilities],
    platformRole,
    // UI convenience only — every capability-gated route is still enforced
    // server-side by requirePlatformCapability().
    hasPlatformCapability: (capability: string) => effectiveCapabilities.has(capability),
  };
}
