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
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { AppState } from 'react-native';

import {
  LOCAL_BABY_STORAGE_KEY,
  createLocalBaby as buildLocalBaby,
  parseLocalBaby,
  serializeLocalBaby,
  type CreateLocalBabyInput,
  type LocalBabyRecord,
} from '@/data/localBaby';
import { clearLocalEventStorage } from '@/data/localStorage';
import { baby as seedBaby, caregivers as seedCaregivers } from '@/data/mock';
import type { Baby, Caregiver, CaregiverRole } from '@/data/models';
import { calmAuthErrorMessage } from '@/lib/authErrors';
import { hapticSuccess } from '@/lib/haptics';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  acceptInvite,
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

/** Fields the "join with invite code" step collects. */
export type JoinFields = {
  displayName: string;
  role: CaregiverRole;
  colorHex: string;
  code: string;
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
  /**
   * Create + persist the active local baby/caregiver (local-only onboarding),
   * replacing the seed defaults and clearing the seed night. No-op on the gate;
   * marking onboarding complete + revealing stays the gate's job (Phase 1A).
   */
  createLocalBaby: (input: CreateLocalBabyInput) => Promise<LocalBabyRecord>;
  /**
   * Keep using Lullaby locally without an account, from the account-entry surface
   * shown in a configured build with no session. Persists the choice and drops
   * into 'local-only' so the app renders on the local repository — the complement
   * to signIn/signUp that keeps the "never force account creation" guardrail.
   */
  continueLocally: () => Promise<void>;
  /** Join an existing baby with an invite code (alternative to completeSetup). */
  joinWithInvite: (fields: JoinFields) => Promise<void>;
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

/**
 * Persisted "this guest chose to keep using Lullaby locally" flag. Set when
 * "Continue locally" is tapped on the account-entry surface so a *configured*
 * build doesn't re-show that surface on the next cold launch (local-first is
 * sticky, not a per-launch nag). Namespaced + versioned like the other local
 * stores; it only matters while there is no session — evaluate() owns the
 * signed-in path and ignores it.
 */
const PREFERS_LOCAL_STORAGE_KEY = 'lullaby/auth/prefers-local/v1';

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured && supabase != null;

  const [status, setStatus] = useState<AuthStatus>(configured ? 'loading' : 'local-only');
  const [session, setSession] = useState<Session | null>(null);
  // Local-only builds own an *active local baby/caregiver* here, above the gate,
  // so every read-site can resolve identity through `useAuth()` instead of
  // importing the seed directly (onboarding Phase 0a). For now it is seeded with
  // the demo baby (Mia / Mom) as the default fallback; Phase 0b replaces this
  // with a real, persisted baby created during onboarding. Configured (Supabase)
  // builds start empty and are filled by `evaluate` once a session resolves.
  const [caregiver, setCaregiver] = useState<Caregiver | null>(
    configured ? null : (seedCaregivers[0] ?? null),
  );
  const [baby, setBaby] = useState<Baby | null>(configured ? null : seedBaby);
  const [caregivers, setCaregivers] = useState<Caregiver[]>(configured ? [] : seedCaregivers);
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

  // Cached "the guest chose to continue locally" preference, hydrated from
  // storage on bootstrap and set by continueLocally(). A ref (not state) because
  // it gates how a *no-session* resolution lands — local-only vs the
  // account-entry surface — and must be readable synchronously inside the
  // auth-change callback without re-subscribing.
  const prefersLocalRef = useRef(false);

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

  // Fill the active baby/caregiver from the onboarding-persisted local baby (or
  // the demo seed as a fallback) so a "continue locally" guest in a *configured*
  // build has a real identity. The local-only rehydrate effect below is skipped
  // when configured, so this is the configured path's equivalent. setState only
  // runs inside this async callback (never synchronously in an effect body), so
  // the React Compiler's no-setState-in-effect rule holds.
  const hydrateLocalIdentity = useCallback(async () => {
    let record: LocalBabyRecord | null = null;
    try {
      record = parseLocalBaby(await AsyncStorage.getItem(LOCAL_BABY_STORAGE_KEY));
    } catch {
      record = null;
    }
    if (!mounted.current) return;
    if (record) {
      setCaregiver(record.caregiver);
      setBaby(record.baby);
      setCaregivers([record.caregiver]);
    } else {
      setCaregiver(seedCaregivers[0] ?? null);
      setBaby(seedBaby);
      setCaregivers(seedCaregivers);
    }
  }, []);

  // Apply a resolved session to the status machine, honoring a standing "continue
  // locally" preference: a configured build with NO session and the flag set
  // renders the app local-first (local-only) rather than the account-entry
  // surface — so a returning guest is never re-walled. With a session, evaluate()
  // owns the path and the flag is irrelevant. Centralizing this keeps the
  // bootstrap and the auth-change listener from diverging on the null case.
  const applySession = useCallback(
    async (next: Session | null) => {
      if (!next && prefersLocalRef.current) {
        if (mounted.current) setSession(null);
        await hydrateLocalIdentity();
        if (mounted.current) setStatus('local-only');
        return;
      }
      await evaluate(next);
    },
    [evaluate, hydrateLocalIdentity],
  );

  useEffect(() => {
    if (!configured) return;
    let active = true;
    let unsub = () => {};
    (async () => {
      // Read the session AND the local-first preference before wiring the auth
      // listener, so the initial INITIAL_SESSION(null) emit can't transiently
      // flash the account-entry surface for a returning "continue locally" guest.
      const [current, storedPref] = await Promise.all([
        getSupabaseSession(),
        AsyncStorage.getItem(PREFERS_LOCAL_STORAGE_KEY).catch(() => null),
      ]);
      if (!active) return;
      prefersLocalRef.current = storedPref === 'true';
      await applySession(current);
      if (!active) return;
      // Re-evaluate on any later auth change. Defer out of the callback (Supabase
      // warns against awaiting client calls directly inside onAuthStateChange).
      unsub = onSupabaseAuthChange((next) => {
        setTimeout(() => {
          void applySession(next);
        }, 0);
      });
    })();
    return () => {
      active = false;
      unsub();
    };
  }, [configured, applySession]);

  // Keep the access token fresh while the app is actually in use. Supabase only
  // runs its refresh ticker between startAutoRefresh()/stopAutoRefresh(); the
  // documented React Native pattern is to drive those off AppState so the token
  // refreshes in the foreground and the timer is released in the background
  // (RN background timers are throttled/unreliable). Configured builds only —
  // the local-only demo has no Supabase session to refresh. No setState here, so
  // the React Compiler's no-setState-in-effect rule is satisfied.
  useEffect(() => {
    if (!configured || !supabase) return;
    const client = supabase;
    // AppState only emits on *transitions*, so prime the ticker when we mount
    // already foregrounded (a cold launch straight into the active app).
    if (AppState.currentState === 'active') void client.auth.startAutoRefresh();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void client.auth.startAutoRefresh();
      } else {
        void client.auth.stopAutoRefresh();
      }
    });
    return () => {
      subscription.remove();
      // Release the ticker when the provider unmounts so it can't outlive auth.
      void client.auth.stopAutoRefresh();
    };
  }, [configured]);

  // Local-only builds rehydrate a previously-created local baby on cold launch so
  // a returning parent sees their baby, not the seed. Absent → the seed fallback
  // set in initial state stays. Configured builds resolve identity via `evaluate`,
  // so this is skipped there.
  useEffect(() => {
    if (configured) return;
    let active = true;
    (async () => {
      try {
        const record = parseLocalBaby(await AsyncStorage.getItem(LOCAL_BABY_STORAGE_KEY));
        if (active && record) {
          setCaregiver(record.caregiver);
          setBaby(record.baby);
          setCaregivers([record.caregiver]);
        }
      } catch {
        // keep the seed fallback
      }
    })();
    return () => {
      active = false;
    };
  }, [configured]);

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
      // Raw GoTrue messages are terse/technical, so map them to calm copy.
      if (error && mounted.current) {
        setErrorMessage(calmAuthErrorMessage(error, 'Could not sign in just now. Please try again.'));
      }
    } catch (e) {
      if (mounted.current) {
        setErrorMessage(calmAuthErrorMessage(e, 'Could not sign in just now. Please try again.'));
      }
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
        if (mounted.current) {
          setErrorMessage(
            calmAuthErrorMessage(error, 'Could not create your account just now. Please try again.'),
          );
        }
        return;
      }
      // No session means the project requires email confirmation first.
      if (!data.session && mounted.current) {
        setPendingMessage('Account created. Tap the link in the email we just sent, then sign in.');
      }
    } catch (e) {
      if (mounted.current) {
        setErrorMessage(
          calmAuthErrorMessage(e, 'Could not create your account just now. Please try again.'),
        );
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

  const joinWithInvite = useCallback(
    async (fields: JoinFields) => {
      if (!supabase || !session) return;
      setBusy(true);
      setErrorMessage(null);
      try {
        await acceptInvite({
          caregiverId: session.user.id,
          code: fields.code,
          displayName: fields.displayName.trim(),
          role: fields.role,
          colorHex: fields.colorHex,
        });
        hapticSuccess(); // affirm the join landed before the app swaps in
        await evaluate(session); // → ready (now linked to the shared baby)
      } catch (e) {
        if (mounted.current) {
          setErrorMessage(messageFrom(e, 'Could not join with that code. Please try again.'));
        }
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [session, evaluate],
  );

  // Local-only onboarding: mint the real local baby/caregiver and replace the seed
  // defaults. Ordering matters because the night-loop store is persisted and
  // LocalEventProvider remounts after onboarding — write the baby first, then drop
  // the seed night (`lullaby/local-events/v1`) so the provider hydrates clean.
  // Best-effort persistence: a storage failure must never trap a parent mid-setup.
  const createLocalBaby = useCallback(
    async (input: CreateLocalBabyInput): Promise<LocalBabyRecord> => {
      const record = buildLocalBaby(input);
      if (mounted.current) {
        setCaregiver(record.caregiver);
        setBaby(record.baby);
        setCaregivers([record.caregiver]);
      }
      try {
        await AsyncStorage.setItem(LOCAL_BABY_STORAGE_KEY, serializeLocalBaby(record));
      } catch {
        // best-effort local cache — losing the write is not worth crashing for
      }
      await clearLocalEventStorage();
      return record;
    },
    [],
  );

  // "Continue locally" — the guest chooses to keep using Lullaby without an
  // account from the account-entry surface. Persist the choice (so the surface
  // doesn't reappear next launch), hydrate the local identity, then drop into
  // 'local-only' — the same state an unconfigured build runs in, so the app
  // renders on the local repository with no forced sign-up. This is an event
  // handler, not an effect, so setState here is fine under the React Compiler.
  const continueLocally = useCallback(async () => {
    // Set the ref first so any in-flight auth-change null emit also resolves to
    // local-only (not the wall) before the persisted write even lands.
    prefersLocalRef.current = true;
    try {
      await AsyncStorage.setItem(PREFERS_LOCAL_STORAGE_KEY, 'true');
    } catch {
      // best-effort — a failed write only means the surface may reappear later
    }
    await hydrateLocalIdentity();
    if (mounted.current) {
      setErrorMessage(null);
      setStatus('local-only');
    }
  }, [hydrateLocalIdentity]);

  // Sign out — drop the Supabase session and return to 'signed-out'. Hygiene:
  //  - Auth session/storage IS cleared: supabase.auth.signOut() calls the
  //    SecureStore adapter's removeItem, which deletes the session manifest AND
  //    every chunk (no token fragment is left in the keystore); then
  //    onAuthStateChange → evaluate(null) drops the in-memory caregiver/baby and
  //    AuthGate unmounts the signed-in app surface.
  //  - Local-first data is deliberately PRESERVED: we do NOT clear the local
  //    night (lullaby/local-events/v1), local baby (lullaby/local-baby/v1) or
  //    Logging-v2 store (lullaby/logging-v2/v1). In a configured build the
  //    signed-in night persists to Supabase, never those stores (LocalEvent
  //    Provider writes AsyncStorage only in local-only mode), so there is no
  //    signed-in cached night to leak — those keys only ever hold local-first /
  //    guest data, which must survive a sign-out. The handoff cursor is already
  //    per-<caregiver:baby> scoped, so it can't bleed between accounts either.
  //    Clearing any of them would destroy guest data for no hygiene benefit.
  const signOut = useCallback(async () => {
    if (!supabase) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      await supabase.auth.signOut();
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
      createLocalBaby,
      continueLocally,
      joinWithInvite,
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
      createLocalBaby,
      continueLocally,
      joinWithInvite,
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
