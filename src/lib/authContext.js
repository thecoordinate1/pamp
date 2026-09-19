import { createContext, useContext } from 'react';

// Kept apart from auth.jsx so that file only exports a component, which is what
// React Fast Refresh needs to reload it reliably.
export const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
