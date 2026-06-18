/**
 * Auth/session foundation.
 *
 * The ONLY question this slice asks of auth: "is there a Supabase session?" If
 * the answer is no — or Supabase isn't configured at all — the app stays on the
 * local AsyncStorage flow (see resolveRepository). Full onboarding / sign-in UI
 * is deliberately out of scope here; this is just the detection seam the next
 * task builds on.
 */
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

/**
 * Resolve the current Supabase session, or null when there is none (no config,
 * not signed in, or any error). Never throws — a failure to read the session
 * must degrade to local-only, never crash the app.
 */
export async function getSupabaseSession(): Promise<Session | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session;
  } catch {
    return null;
  }
}

/**
 * Subscribe to auth state changes (sign-in / sign-out / token refresh). Returns
 * an unsubscribe function. A no-op (and immediate unsubscribe) when Supabase is
 * not configured, so callers can wire it unconditionally.
 */
export function onSupabaseAuthChange(
  onChange: (session: Session | null) => void,
): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    onChange(session);
  });
  return () => data.subscription.unsubscribe();
}
