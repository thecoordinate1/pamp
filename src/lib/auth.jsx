import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { AuthContext } from './authContext';
import { forgetStoredPasses } from './passes';
import { safeStorage } from './safeStorage';

// The account last signed in on this phone, from supabase-js's own saved
// session. When that session cannot be refreshed offline, getSession() reports
// no session even though nobody signed out; this id is then used only to show
// the passes saved on this phone, never to fetch anything. Signing out deletes
// the saved session, so it is gone for the next person.
function savedSessionUserId() {
  try {
    const raw = safeStorage()?.getItem(supabase.auth.storageKey);
    return JSON.parse(raw ?? 'null')?.user?.id ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [offlineUserId, setOfflineUserId] = useState(null);
  const queryClient = useQueryClient();
  const lastUserId = useRef(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (lastUserId.current === undefined) lastUserId.current = data.session?.user?.id ?? null;
      setSession(data.session);
      setOfflineUserId(data.session ? null : savedSessionUserId());
      setLoading(false);
    });

    // Fires on sign-in, sign-out, token refresh and on the OAuth redirect back.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      const nextId = next?.user?.id ?? null;
      // Phones get shared. When an account signs out or another takes its
      // place, drop every cached query and the passes kept for offline use, so
      // the next person never sees the last one's profile, passes or addresses.
      if (lastUserId.current && lastUserId.current !== nextId) {
        // Deferred: supabase-js holds its auth lock while this callback runs,
        // and the refetches this triggers need that lock to attach a token.
        setTimeout(() => {
          forgetStoredPasses();
          queryClient.resetQueries();
        }, 0);
      }
      lastUserId.current = nextId;
      setSession(next);
      setOfflineUserId(next ? null : savedSessionUserId());
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      offlineUserId,
      loading,
      configured: isSupabaseConfigured,
      signInWithGoogle: () =>
        supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        }),
      // Confirmation is on, so signUp returns a user with no session until the
      // emailed link is clicked. The caller uses that to decide what to show.
      // `metadata` carries an invite's referral code; handle_new_user records it.
      // `redirectTo` brings an invited person back to the event after they
      // confirm, even in another browser or on another phone.
      signUpWithEmail: (email, password, { metadata, redirectTo } = {}) =>
        supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectTo ?? window.location.origin,
            ...(metadata ? { data: metadata } : {}),
          },
        }),
      signInWithEmail: (email, password) =>
        supabase.auth.signInWithPassword({ email, password }),
      resendConfirmation: (email) =>
        supabase.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: window.location.origin },
        }),
      resetPassword: (email) =>
        supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }),
      signOut: () => supabase.auth.signOut(),
    }),
    [session, loading, offlineUserId]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

