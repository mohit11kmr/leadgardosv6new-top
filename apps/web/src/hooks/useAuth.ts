import { useSyncExternalStore } from 'react';
import { accessTokenKey } from '../api/client.js';
import { login, logout, register } from '../api/auth.js';

const authSnapshot = () => Boolean(localStorage.getItem(accessTokenKey));
const subscribeAuth = (callback: () => void) => {
  window.addEventListener('leadguard-auth-changed', callback);
  return () => window.removeEventListener('leadguard-auth-changed', callback);
};

export function useAuth() {
  const authenticated = useSyncExternalStore(subscribeAuth, authSnapshot, () => false);

  return {
    authenticated,
    login,
    register,
    logout,
  };
}
