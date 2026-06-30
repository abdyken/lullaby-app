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

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { secureSessionStorage } from './secureSessionStore';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True only when both public env vars are set — i.e. real sync is possible. */
export const isSupabaseConfigured =
  typeof supabaseUrl === 'string' &&
  supabaseUrl.length > 0 &&
  typeof supabaseAnonKey === 'string' &&
  supabaseAnonKey.length > 0;

/**
 * The shared Supabase client, or null in local-only demo mode. The auth session
 * is persisted through a secure, chunked SecureStore adapter on native (web/dev
 * fall back to AsyncStorage) so a returning caregiver stays signed in without
 * tokens sitting in plaintext. URL detection is off — this is a native app, not
 * a web OAuth redirect flow.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // PKCE flow: OAuth + email links return to lullaby://auth-callback with a
        // `?code=` in the QUERY (exchanged via exchangeCodeForSession), rather than
        // implicit `#access_token=…` tokens in the FRAGMENT. This matters on native:
        // Android routinely drops the URL fragment when delivering a custom-scheme
        // deep link, so an implicit redirect arrives with no credentials and the
        // callback can never complete (the endless-loading bug). A query code
        // survives intent delivery. App-side only — no credential/dashboard change.
        flowType: 'pkce',
      },
    })
  : null;
