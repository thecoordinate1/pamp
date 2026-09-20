import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-supabase-url.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

if (!isSupabaseConfigured) {
  // Vite inlines VITE_* at build time, so a deployment missing these keeps the
  // placeholders until it is rebuilt. Setting them on the host is not enough on
  // its own: the build has to run again afterwards.
  console.error(
    'PAMP: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing from this build. ' +
      'Set them in the hosting environment variables, then redeploy.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper function for local persistence fallback
export const getLocalStore = (key, fallbackValue) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallbackValue;
  } catch (e) {
    console.warn(`Error reading ${key} from localStorage:`, e);
    return fallbackValue;
  }
};

export const setLocalStore = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Error writing ${key} to localStorage:`, e);
  }
};
