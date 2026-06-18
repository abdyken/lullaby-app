/**
 * Supabase client setup — Expo-safe and optional.
 *
 * Lullaby ships as a fully working LOCAL demo. Supabase is an additive layer for
 * real caregiver sync; the app must run with no backend at all. So this module
 * reads the public env vars and only constructs a client when BOTH are present.
 * When they are absent (the default demo), `supabase` is null and the whole
 * sync layer transparently falls back to the local AsyncStorage flow.
 *
 * Env vars (must be statically referenced via process.env dot-notation so Expo
 * can inline them at build time — see https://docs.expo.dev/guides/environment-variables/):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY
 *
 * These are the publishable anon key + URL only — never a service-role secret.
 * Row Level Security (see supabase/migrations) is what actually protects data.
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True only when both public env vars are set — i.e. real sync is possible. */
export const isSupabaseConfigured =
  typeof supabaseUrl === 'string' &&
  supabaseUrl.length > 0 &&
  typeof supabaseAnonKey === 'string' &&
  supabaseAnonKey.length > 0;

/**
 * The shared Supabase client, or null in local-only demo mode. Session is
 * persisted in AsyncStorage (same store as the local night state) so a returning
 * caregiver stays signed in. URL detection is off — this is a native app, not a
 * web OAuth redirect flow.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
