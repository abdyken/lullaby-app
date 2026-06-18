/**
 * AuthProvider — the auth + first-run state machine for Supabase-configured
 * builds. It answers a single question for the UI: "what should the app show
 * right now?" via `status`:
 *
 *   local-only  → no Supabase env vars; the app runs exactly as the local demo
 *   loading     → configured, still resolving session/provisioning
 *   signed-out  → configured, no session → show the sign-in / sign-up surface
 *   needs-setup → signed in, but no baby linked yet → show baby setup
 *   ready       → signed in + linked to a baby → render the app (Supabase mode)
 *
 * In local-only mode this provider is inert: it reports 'local-only' and never
 * touches Supabase, so the existing demo is untouched. All the actual queries
 * live in the sync layer (session + provisioning); this is the React seam.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { Baby, Caregiver, CaregiverRole } from '@/data/models';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  ensureCaregiverSetup,
  getBaby,
  getBabyCaregivers,
  getCaregiverProfile,
  getLinkedBabyId,
  getSupabaseSession,
  onSupabaseAuthChange,
} from '@/sync';
import type { Session } from '@supabase/supabase-js';

export type AuthStatus = 'loading' | 'local-only' | 'signed-out' | 'needs-setup' | 'ready';

/** Fields the baby-setup step collects (color is derived from the role pick). */
export type SetupFields = {
  displayName: string;
  role: CaregiverRole;
  colorHex: string;
  babyName: string;
  /** ISO date (YYYY-MM-DD), derived from the age-in-weeks input. */
  birthDate: string;
};

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  /** the signed-in caregiver's profile, once it exists */
  caregiver: Caregiver | null;
  /** the linked baby (Supabase mode, status 'ready'); null otherwise */
  baby: Baby | null;
  /** every caregiver linked to the baby (includes self); [] until 'ready' */
  caregivers: Caregiver[];
  /** a calm note after sign-up when email confirmation is required (no session yet) */
  pendingMessage: string | null;
  /** true while an auth/setup request is in flight (drives button spinners) */
  busy: boolean;
  errorMessage: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  completeSetup: (fields: SetupFields) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Best-effort, calm message from an unknown thrown value. */
function messageFrom(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === 'string' && m.length > 0) return m;
  }
  return fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured && supabase != null;

  const [status, setStatus] = useState<AuthStatus>(configured ? 'loading' : 'local-only');
  const [session, setSession] = useState<Session | null>(null);
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [baby, setBaby] = useState<Baby | null>(null);
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Map a session to a provisioning status. Safe to call repeatedly.
  const evaluate = useCallback(async (next: Session | null) => {
    if (mounted.current) setSession(next);
    if (!next) {
      if (mounted.current) {
        setCaregiver(null);
        setBaby(null);
        setCaregivers([]);
        setStatus('signed-out');
      }
      return;
    }
    const [babyId, profile] = await Promise.all([
      getLinkedBabyId(next.user.id),
      getCaregiverProfile(next.user.id),
    ]);
    if (!mounted.current) return;
    setCaregiver(profile);
    if (!babyId) {
      setBaby(null);
      setCaregivers([]);
      setStatus('needs-setup');
      return;
    }
    // Ready: load the real baby + linked caregivers for the UI. Soft — a missing
    // read just leaves a calm fallback; it never blocks entering the app.
    const [babyRow, linked] = await Promise.all([getBaby(babyId), getBabyCaregivers(babyId)]);
    if (!mounted.current) return;
    setBaby(babyRow);
    setCaregivers(linked);
    setStatus('ready');
  }, []);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    (async () => {
      const current = await getSupabaseSession();
      if (active) await evaluate(current);
    })();
    // Re-evaluate on any auth change. Defer out of the callback (Supabase warns
    // against awaiting client calls directly inside onAuthStateChange).
    const unsub = onSupabaseAuthChange((next) => {
      setTimeout(() => {
        void evaluate(next);
      }, 0);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [configured, evaluate]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    setBusy(true);
    setErrorMessage(null);
    setPendingMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      // Success → onAuthStateChange drives evaluate(); only surface failures here.
      if (error && mounted.current) setErrorMessage(error.message);
    } catch (e) {
      if (mounted.current) setErrorMessage(messageFrom(e, 'Could not sign in. Please try again.'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    setBusy(true);
    setErrorMessage(null);
    setPendingMessage(null);
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) {
        if (mounted.current) setErrorMessage(error.message);
        return;
      }
      // No session means the project requires email confirmation first.
      if (!data.session && mounted.current) {
        setPendingMessage('Account created. Confirm via the email we sent, then sign in.');
      }
    } catch (e) {
      if (mounted.current) {
        setErrorMessage(messageFrom(e, 'Could not create the account. Please try again.'));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const completeSetup = useCallback(
    async (fields: SetupFields) => {
      if (!supabase || !session) return;
      setBusy(true);
      setErrorMessage(null);
      try {
        await ensureCaregiverSetup({
          caregiverId: session.user.id,
          displayName: fields.displayName.trim(),
          role: fields.role,
          colorHex: fields.colorHex,
          babyName: fields.babyName.trim(),
          birthDate: fields.birthDate,
        });
        await evaluate(session); // → ready
      } catch (e) {
        if (mounted.current) {
          setErrorMessage(messageFrom(e, 'Could not finish setup. Please try again.'));
        }
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [session, evaluate],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      await supabase.auth.signOut();
      // onAuthStateChange → evaluate() → 'signed-out'.
    } catch (e) {
      if (mounted.current) setErrorMessage(messageFrom(e, 'Could not sign out.'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const clearError = useCallback(() => setErrorMessage(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      caregiver,
      baby,
      caregivers,
      pendingMessage,
      busy,
      errorMessage,
      signIn,
      signUp,
      completeSetup,
      signOut,
      clearError,
    }),
    [
      status,
      session,
      caregiver,
      baby,
      caregivers,
      pendingMessage,
      busy,
      errorMessage,
      signIn,
      signUp,
      completeSetup,
      signOut,
      clearError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the auth state machine. Must be used under an AuthProvider. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
