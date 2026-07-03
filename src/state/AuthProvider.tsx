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
import * as AppleAuthentication from 'expo-apple-authentication';
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
import { AppState, Platform } from 'react-native';

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
import { clearOnboardingDraft } from '@/components/onboarding/onboardingStorage';
import type { Baby, Caregiver, CaregiverRole } from '@/data/models';
import { trackEvent } from '@/lib/analytics';
import { calmAuthErrorMessage } from '@/lib/authErrors';
import { getAuthRedirectUrl, startGoogleOAuth } from '@/lib/authLinking';
import { authWarn } from '@/lib/authLogger';
import { isGoogleSignInConfigured } from '@/lib/googleAuth';
import { hapticSuccess } from '@/lib/haptics';
import { logStartupStep } from '@/lib/startupDiagnostics';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { resolveNoSessionStatus } from '@/state/authStatusResolver';
import {
  acceptInvite,
  deleteAccountRemote,
  ensureCaregiverSetup,
  getBaby,
  getBabyCaregivers,
  getCaregiverProfile,
  getLinkedBabyId,
  getSupabaseSession,
  onSupabaseAuthChange,
} from '@/sync';
import type { Session } from '@supabase/supabase-js';

export type AuthStatus =
  | 'loading'
  | 'local-only'
  | 'signed-out'
  // A Google/OAuth round-trip is in flight (browser open → session landing). Drives
  // the branded transition so the account surface never flashes back mid-sign-in.
  | 'authenticating'
  // A session resolved and provisioning (linked baby + profile) is loading. Also
  // drives the branded transition, so onboarding/account/stale screens never show
  // while the post-auth status is still unknown.
  | 'postAuthSync'
  | 'needs-setup'
  | 'ready';

type AuthStatusReason =
  | 'initial'
  | 'initial-session'
  | 'initial-no-session'
  | 'auth-change'
  | 'no-session'
  | 'local-preference'
  | 'local-bootstrap'
  | 'continue-locally'
  | 'account-entry'
  | 'email-sign-in'
  | 'email-sign-up'
  | 'email-confirmation-required'
  | 'sign-in-failed'
  | 'sign-up-failed'
  | 'apple-sign-in'
  | 'apple-cancelled'
  | 'apple-failed'
  | 'apple-missing-token'
  | 'google-oauth'
  | 'google-oauth-ended'
  | 'google-failed'
  | 'setup-complete'
  | 'invite-accepted'
  | 'missing-linked-baby'
  | 'provisioning-complete';

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
  /**
   * Native "Sign in with Apple" (iOS only). Runs the system Apple sheet via
   * `expo-apple-authentication`, then exchanges the returned identity token for a
   * Supabase session with `signInWithIdToken({ provider: 'apple' })`. On success
   * the session lands through `onAuthStateChange` → `applySession` (no state set
   * here, mirroring `signIn`); failures surface through `errorMessage`. A
   * user-cancelled sheet is a calm no-op, not an error. No-op without a configured
   * Supabase client or off iOS — the affordance is already gated to iOS in the UI,
   * so this guard is defense in depth. Required Apple Developer + Supabase provider
   * setup is documented in `supabase/README.md` (no native credentials in repo).
   */
  signInWithApple: () => Promise<void>;
  /**
   * Google sign-in via the system browser (iOS + Android). Asks Supabase for the
   * Google authorization URL and runs it through an `expo-web-browser` auth
   * session that returns to `lullaby://auth-callback`; the shared redirect plumbing
   * (Step 04) then exchanges the result for a session — so success lands through
   * `onAuthStateChange` → `applySession`, exactly like email + Apple sign-in (no
   * state set here). A dismissed browser is a calm no-op; failures surface through
   * `errorMessage`. Gated on a configured Supabase client AND a Google OAuth client
   * ID in the env (`isGoogleSignInConfigured`), and excluded on web — the affordance
   * is already hidden when those are absent, so this guard is defense in depth.
   * Deliberately the OAuth/browser flow (no native module), so the Android build
   * path is unaffected. Required Google Cloud + Supabase provider setup is
   * documented in `supabase/README.md` (no client IDs or dashboard config in repo).
   */
  signInWithGoogle: () => Promise<void>;
  /**
   * Email a password-reset link (Supabase `resetPasswordForEmail`). Returns true
   * when the request was accepted so the caller can show a calm "check your
   * inbox" view; failures surface through `errorMessage`. No-op without a
   * configured Supabase client. To avoid account enumeration, success does not
   * confirm whether an account exists for the address.
   */
  resetPassword: (email: string) => Promise<boolean>;
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
  /**
   * Inverse of continueLocally(): from the in-app account surface a "continue
   * locally" guest chooses to set up an account. Clears the sticky local-first
   * preference and drops to 'signed-out' (where AuthGate renders the account-entry
   * surface). The persisted local baby + night are left untouched, so tapping
   * "Continue locally" again returns the guest exactly where they were — the
   * "never force account creation" guardrail still holds. No-op when Supabase
   * isn't configured. (Local→account data migration is a separate, later step.)
   */
  goToAccountEntry: () => Promise<void>;
  /** Join an existing baby with an invite code (alternative to completeSetup). */
  joinWithInvite: (fields: JoinFields) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Permanently delete the signed-in account (Apple 5.1.1(v)) via the
   * self-scoped `delete_account` RPC, then drop the local session. Resolves
   * true only when the server verifiably deleted the account; false on any
   * failure so the calling screen can show its own calm fallback (we set no
   * provider errorMessage here — the caller stays signed in on failure, and a
   * stored provider error would resurface as a stale note on the account
   * surfaces after an unrelated later sign-out). Local-first data is preserved
   * exactly like signOut.
   */
  deleteAccount: () => Promise<boolean>;
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
 * True when an Apple sign-in rejection is just the parent dismissing the system
 * sheet (`ERR_REQUEST_CANCELED`). A cancel is not a failure, so the caller stays
 * calm and surfaces no error.
 */
function isAppleCancel(error: unknown): boolean {
  return (
    error != null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ERR_REQUEST_CANCELED'
  );
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

  // Start in 'loading' for BOTH configured and unconfigured builds: the
  // unconfigured build now reads the sticky "Continue locally" preference on cold
  // launch (below) to decide between the account-entry surface and the local app,
  // so it can no longer pin itself to a permanent 'local-only' that hid the entry.
  const [status, setStatus] = useState<AuthStatus>('loading');
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

  const statusRef = useRef<AuthStatus>('loading');
  useEffect(() => {
    logStartupStep('auth status', { status: 'loading', reason: 'initial' }, { once: false });
  }, []);

  const setAuthStatus = useCallback((next: AuthStatus, reason: AuthStatusReason) => {
    if (!mounted.current || statusRef.current === next) return;
    statusRef.current = next;
    setStatus(next);
    logStartupStep('auth status', { status: next, reason }, { once: false });
  }, []);

  // Cached "the guest chose to continue locally" preference, hydrated from
  // storage on bootstrap and set by continueLocally(). A ref (not state) because
  // it gates how a *no-session* resolution lands — local-only vs the
  // account-entry surface — and must be readable synchronously inside the
  // auth-change callback without re-subscribing.
  const prefersLocalRef = useRef(false);

  // Monotonic guard for overlapping evaluate() runs. The bootstrap read and the
  // auth-change listener can both resolve a session, and a sign-out can race a
  // just-resolved sign-in — so each run captures its id and bails the moment a
  // newer run supersedes it, so a slower earlier run can never overwrite the
  // status a newer one produced.
  const evaluateSeqRef = useRef(0);
  const provisioningRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  const provisionedUserIdRef = useRef<string | null>(null);

  // Map a session to a provisioning status. Safe to call repeatedly.
  const evaluate = useCallback(async (next: Session | null, reason: AuthStatusReason = 'auth-change', force = false) => {
    if (mounted.current) setSession(next);
    if (!next) {
      evaluateSeqRef.current += 1;
      provisioningRef.current = null;
      provisionedUserIdRef.current = null;
      if (mounted.current) {
        setCaregiver(null);
        setBaby(null);
        setCaregivers([]);
        setAuthStatus('signed-out', reason === 'initial-no-session' ? 'initial-no-session' : 'no-session');
      }
      return;
    }

    const userId = next.user.id;
    if (
      !force &&
      provisionedUserIdRef.current === userId &&
      (statusRef.current === 'ready' || statusRef.current === 'needs-setup')
    ) {
      return;
    }

    if (!force && provisioningRef.current?.userId === userId) {
      await provisioningRef.current.promise;
      return;
    }

    const seq = (evaluateSeqRef.current += 1);
    const isCurrent = () => mounted.current && evaluateSeqRef.current === seq;
    // A session resolved — enter the branded post-auth sync IMMEDIATELY, before the
    // provisioning reads, so AuthGate shows the transition (never onboarding, the
    // account surface, or a stale signed-out screen) while the linked baby + profile
    // load. Also clear any transient auth error left over from a cancelled/failed
    // earlier attempt so a landing sign-in never leaves a stale note behind the app.
    if (isCurrent()) {
      setErrorMessage(null);
      setAuthStatus('postAuthSync', reason);
      logStartupStep('auth provisioning start', { reason });
    }
    const promise = (async () => {
      try {
        const [babyId, profile] = await Promise.all([
          getLinkedBabyId(userId),
          getCaregiverProfile(userId),
        ]);
        if (!isCurrent()) return;
        logStartupStep('auth profile and baby link ready', {
          hasBaby: babyId != null,
          hasProfile: profile != null,
          reason,
        });
        setCaregiver(profile);
        if (!babyId) {
          provisionedUserIdRef.current = userId;
          setBaby(null);
          setCaregivers([]);
          setAuthStatus('needs-setup', 'missing-linked-baby');
          return;
        }
        // Ready: load the real baby + linked caregivers for the UI. Soft — a missing
        // read just leaves a calm fallback; it never blocks entering the app.
        const [babyRow, linked] = await Promise.all([getBaby(babyId), getBabyCaregivers(babyId)]);
        if (!isCurrent()) return;
        provisionedUserIdRef.current = userId;
        setBaby(babyRow);
        setCaregivers(linked);
        setAuthStatus('ready', 'provisioning-complete');
        logStartupStep('auth baby ready', {
          hasBaby: babyRow != null,
          caregiverCount: linked.length,
          reason: 'provisioning-complete',
        });
      } finally {
        if (provisioningRef.current?.userId === userId && evaluateSeqRef.current === seq) {
          provisioningRef.current = null;
        }
      }
    })();
    provisioningRef.current = { userId, promise };
    await promise;
  }, [setAuthStatus]);

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
    async (next: Session | null, reason: AuthStatusReason = 'auth-change') => {
      if (!next && prefersLocalRef.current) {
        evaluateSeqRef.current += 1;
        provisioningRef.current = null;
        provisionedUserIdRef.current = null;
        if (mounted.current) setSession(null);
        await hydrateLocalIdentity();
        if (mounted.current) setAuthStatus('local-only', 'local-preference');
        return;
      }
      await evaluate(next, reason);
    },
    [evaluate, hydrateLocalIdentity, setAuthStatus],
  );

  useEffect(() => {
    if (!configured) return;
    let active = true;
    let unsub = () => {};
    (async () => {
      logStartupStep('auth bootstrap start', { configured: true });
      // Read the session AND the local-first preference before wiring the auth
      // listener, so the initial INITIAL_SESSION(null) emit can't transiently
      // flash the account-entry surface for a returning "continue locally" guest.
      const [current, storedPref] = await Promise.all([
        getSupabaseSession(),
        AsyncStorage.getItem(PREFERS_LOCAL_STORAGE_KEY).catch(() => null),
      ]);
      if (!active) return;
      prefersLocalRef.current = storedPref === 'true';
      logStartupStep('auth session ready', {
        hasSession: current != null,
        prefersLocal: prefersLocalRef.current,
      });
      await applySession(current, current ? 'initial-session' : 'initial-no-session');
      if (!active) return;
      // Re-evaluate on any later auth change. Defer out of the callback (Supabase
      // warns against awaiting client calls directly inside onAuthStateChange).
      unsub = onSupabaseAuthChange((next) => {
        setTimeout(() => {
          void applySession(next, 'auth-change');
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

  // Auth deep links (lullaby://auth-callback — Google OAuth, password reset, email
  // confirmation) are completed by the dedicated `src/app/auth-callback.tsx` route,
  // which is the SINGLE owner of the session exchange. We deliberately do NOT also
  // exchange here: the PKCE code + verifier are single-use, so a second exchanger
  // racing the route would consume the code first and make the route's exchange
  // fail — surfacing the "Could not finish signing in" screen even on a successful
  // sign-in. The route's exchange still flows through onSupabaseAuthChange →
  // applySession, so this provider reacts to the resulting SIGNED_IN exactly as
  // before. (An earlier redirect listener lived here and caused that race; it was
  // removed in favor of the route.)

  // Unconfigured (local demo) cold-launch bootstrap. With no Supabase env there is
  // never a session, so the only question is which surface to show after
  // onboarding: the account-entry surface once (a guest who has NOT made an
  // account decision yet) or the local app directly (a returning guest who already
  // tapped "Continue locally"). This is what makes the account entry VISIBLE after
  // onboarding even when Supabase is not configured — previously this build sat
  // permanently in 'local-only' and the entry never appeared. Either way the local
  // identity is hydrated from the onboarding-persisted baby (or the seed fallback),
  // so the entry's "Continue locally" lands the parent on their real baby. The
  // decision is the shared, pure resolveNoSessionStatus (same rule the configured
  // no-session path uses). Configured builds resolve identity + session via the
  // bootstrap above, so this is skipped there. setState only runs inside the async
  // callback, so the React Compiler's no-setState-in-effect rule holds.
  useEffect(() => {
    if (configured) return;
    let active = true;
    (async () => {
      logStartupStep('auth bootstrap start', { configured: false });
      let storedPref: string | null = null;
      try {
        storedPref = await AsyncStorage.getItem(PREFERS_LOCAL_STORAGE_KEY);
      } catch {
        storedPref = null;
      }
      if (!active || !mounted.current) return;
      prefersLocalRef.current = storedPref === 'true';
      await hydrateLocalIdentity();
      if (!active || !mounted.current) return;
      const nextStatus = resolveNoSessionStatus(prefersLocalRef.current);
      setAuthStatus(nextStatus, nextStatus === 'local-only' ? 'local-bootstrap' : 'initial-no-session');
      logStartupStep('auth local identity ready', {
        prefersLocal: prefersLocalRef.current,
      });
    })();
    return () => {
      active = false;
    };
  }, [configured, hydrateLocalIdentity, setAuthStatus]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    setBusy(true);
    setErrorMessage(null);
    setPendingMessage(null);
    setAuthStatus('authenticating', 'email-sign-in');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      // Success → onAuthStateChange drives evaluate(); only surface failures here.
      // Raw GoTrue messages are terse/technical, so map them to calm copy.
      if (error && mounted.current) {
        setErrorMessage(calmAuthErrorMessage(error, 'Could not sign in just now. Please try again.'));
        setAuthStatus('signed-out', 'sign-in-failed');
      }
    } catch (e) {
      if (mounted.current) {
        setErrorMessage(calmAuthErrorMessage(e, 'Could not sign in just now. Please try again.'));
        setAuthStatus('signed-out', 'sign-in-failed');
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [setAuthStatus]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    setBusy(true);
    setErrorMessage(null);
    setPendingMessage(null);
    setAuthStatus('authenticating', 'email-sign-up');
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) {
        if (mounted.current) {
          setErrorMessage(
            calmAuthErrorMessage(error, 'Could not create your account just now. Please try again.'),
          );
          setAuthStatus('signed-out', 'sign-up-failed');
        }
        return;
      }
      // No session means the project requires email confirmation first.
      if (!data.session && mounted.current) {
        setPendingMessage('Account created. Tap the link in the email we just sent, then sign in.');
        setAuthStatus('signed-out', 'email-confirmation-required');
      }
    } catch (e) {
      if (mounted.current) {
        setErrorMessage(
          calmAuthErrorMessage(e, 'Could not create your account just now. Please try again.'),
        );
        setAuthStatus('signed-out', 'sign-up-failed');
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [setAuthStatus]);

  // Native Apple sign-in (iOS). The system sheet returns a short-lived identity
  // token (a signed JWT); Supabase verifies it and mints a session via
  // signInWithIdToken — the same onAuthStateChange → applySession path email
  // sign-in uses, so we only surface failures here, never set the session
  // ourselves. A cancelled sheet is a calm no-op. Gated to iOS + a configured
  // client (expo-apple-authentication has no Android/web implementation); the UI
  // already hides the affordance elsewhere, so this is defense in depth. The
  // native flow needs no nonce (the documented Supabase/Expo path); errors route
  // through the shared calm-copy mapper. setState only runs inside this async
  // callback, never synchronously in an effect, so the React Compiler rule holds.
  const signInWithApple = useCallback(async () => {
    if (!supabase || Platform.OS !== 'ios') return;
    setBusy(true);
    setErrorMessage(null);
    setPendingMessage(null);
    setAuthStatus('authenticating', 'apple-sign-in');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const idToken = credential.identityToken;
      if (!idToken) {
        // Apple authenticated but returned no token — rare; treat as a soft retry.
        if (mounted.current) {
          setErrorMessage('Could not sign in with Apple just now. Please try again.');
          setAuthStatus('signed-out', 'apple-missing-token');
        }
        return;
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: idToken,
      });
      if (error && mounted.current) {
        setErrorMessage(
          calmAuthErrorMessage(error, 'Could not sign in with Apple just now. Please try again.'),
        );
        setAuthStatus('signed-out', 'apple-failed');
      }
    } catch (e) {
      // The parent dismissed the system sheet — not a failure, stay quiet.
      if (isAppleCancel(e)) {
        if (mounted.current) setAuthStatus('signed-out', 'apple-cancelled');
        return;
      }
      if (mounted.current) {
        setErrorMessage(
          calmAuthErrorMessage(e, 'Could not sign in with Apple just now. Please try again.'),
        );
        setAuthStatus('signed-out', 'apple-failed');
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [setAuthStatus]);

  // Google sign-in (iOS + Android) via the system browser. We deliberately use the
  // OAuth/browser flow rather than a native sign-in module: it needs no extra
  // native config and keeps the Android build path untouched. `startGoogleOAuth`
  // owns the Supabase `signInWithOAuth` → browser round-trip → `completeAuthRedirect`
  // exchange; on success the session lands via onAuthStateChange → applySession (we
  // set no session here, mirroring signIn / signInWithApple). A dismissed browser
  // is a calm no-op. Gated to a configured client + a Google OAuth client ID in env
  // + non-web; the UI already hides the button elsewhere, so this is defense in
  // depth. A non-cancel failure shows one calm line (the underlying reasons are
  // technical — init/exchange — not parent-actionable). setState only runs inside
  // this async callback, so the React Compiler's no-setState-in-effect rule holds.
  const signInWithGoogle = useCallback(async () => {
    if (!supabase || !isGoogleSignInConfigured || Platform.OS === 'web') return;
    setBusy(true);
    setErrorMessage(null);
    setPendingMessage(null);
    // Show the branded transition for the whole browser round-trip so the account
    // surface never flashes back between the browser closing and the session
    // resolving. Success lands via onAuthStateChange → applySession (→ postAuthSync
    // → ready/needs-setup); a non-success outcome is released back to the account
    // surface below.
    setAuthStatus('authenticating', 'google-oauth');
    try {
      // startGoogleOAuth always resolves now (its non-interactive steps are
      // timed out), so the `finally` below always clears `busy` — no more stuck
      // spinner. 'success' lands via onAuthStateChange → applySession; 'canceled'
      // is a calm no-op; 'error'/timeout surface one calm, recoverable line.
      const outcome = await startGoogleOAuth(supabase);
      if (outcome.status === 'error' && mounted.current) {
        // Suspicious-but-recoverable (init/exchange issue) — the user can retry, so
        // a dev-only warn, not an error. The 'canceled' outcome stays silent.
        authWarn(`signInWithGoogle: ${outcome.error}`);
        setErrorMessage('Could not sign in with Google just now. Please try again.');
      }
      // Any non-success (dismissed browser OR a recoverable error) releases the
      // transition back to the account surface — the onAuthStateChange listener owns
      // the ONLY success path, so this can never stomp a real sign-in. Deliberately
      // keyed on "not success" (not a cancel branch), so a dismissal stays a silent
      // no-op with no error set.
      if (outcome.status !== 'success' && mounted.current) {
        setAuthStatus('signed-out', 'google-oauth-ended');
      }
    } catch (e) {
      if (mounted.current) {
        setErrorMessage(
          calmAuthErrorMessage(e, 'Could not sign in with Google just now. Please try again.'),
        );
        setAuthStatus('signed-out', 'google-failed');
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [setAuthStatus]);

  // Send a password-reset email. Supabase intentionally returns success even for
  // an unknown address (anti-enumeration), so the calling screen shows the same
  // calm "check your inbox" copy regardless — only a real transport/rate-limit
  // failure surfaces, mapped to calm copy. `redirectTo` is our gated deep link
  // (lullaby://auth-callback); it's harmless until the project allowlists it.
  const resetPassword = useCallback(async (email: string): Promise<boolean> => {
    if (!supabase) return false;
    setBusy(true);
    setErrorMessage(null);
    setPendingMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getAuthRedirectUrl(),
      });
      if (error) {
        if (mounted.current) {
          setErrorMessage(
            calmAuthErrorMessage(error, 'Could not start a password reset just now. Please try again.'),
          );
        }
        return false;
      }
      return true;
    } catch (e) {
      if (mounted.current) {
        setErrorMessage(
          calmAuthErrorMessage(e, 'Could not start a password reset just now. Please try again.'),
        );
      }
      return false;
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
        const { babyId } = await ensureCaregiverSetup({
          caregiverId: session.user.id,
          displayName: fields.displayName.trim(),
          role: fields.role,
          colorHex: fields.colorHex,
          babyName: fields.babyName.trim(),
          birthDate: fields.birthDate,
        });
        trackEvent(
          'baby_profile_created',
          { userId: session.user.id, babyId, caregiverId: session.user.id },
          { method: 'account' },
        );
        // The onboarding baby draft has now been provisioned into the account — drop
        // it so a future setup never re-prefills stale data. Best-effort (never
        // blocks the transition into the app).
        void clearOnboardingDraft();
        await evaluate(session, 'setup-complete', true); // → ready
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
        const { babyId } = await acceptInvite({
          caregiverId: session.user.id,
          code: fields.code,
          displayName: fields.displayName.trim(),
          role: fields.role,
          colorHex: fields.colorHex,
        });
        trackEvent('caregiver_invite_accepted', {
          userId: session.user.id,
          babyId,
          caregiverId: session.user.id,
        });
        hapticSuccess(); // affirm the join landed before the app swaps in
        // Joined a shared baby — the local onboarding draft is now irrelevant; drop
        // it so it can't prefill a future setup. Best-effort.
        void clearOnboardingDraft();
        await evaluate(session, 'invite-accepted', true); // → ready (now linked to the shared baby)
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
      setAuthStatus('local-only', 'continue-locally');
    }
  }, [hydrateLocalIdentity, setAuthStatus]);

  // "Create account or sign in" from the in-app account surface — the inverse of
  // continueLocally(). Clear the sticky local-first preference (ref first, then
  // the persisted flag) so a no-session resolution can no longer bounce back to
  // local-only, then drop to 'signed-out' where AuthGate shows AccountEntryScreen.
  // No local data is touched: the persisted baby/night survive, so "Continue
  // locally" round-trips the guest back unchanged. Configured builds only; it's an
  // event handler, not an effect, so setState here is fine under the React Compiler.
  const goToAccountEntry = useCallback(async () => {
    if (!configured) return;
    prefersLocalRef.current = false;
    try {
      await AsyncStorage.removeItem(PREFERS_LOCAL_STORAGE_KEY);
    } catch {
      // best-effort — a failed clear only risks a re-bounce to local on relaunch
    }
    if (mounted.current) {
      setErrorMessage(null);
      setAuthStatus('signed-out', 'account-entry');
    }
  }, [configured, setAuthStatus]);

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

  // Delete account — the self-scoped `delete_account` RPC removes the
  // auth.users row (cascading the profile, created babies + their shared
  // history, authored events, and invites — see the migration's header).
  // Ordering: the server delete MUST succeed before any local sign-out, so a
  // failed RPC leaves the parent signed in and able to retry. The follow-up
  // sign-out uses scope 'local' — the account row is already gone, so a global
  // sign-out would call the server with a dead user's token and fail — and the
  // resulting SIGNED_OUT flows through the normal applySession(null) path
  // (honoring a standing continue-locally preference). Local-first stores
  // (local events / local baby / logging-v2) are deliberately untouched, same
  // hygiene rules as signOut above.
  const deleteAccount = useCallback(async (): Promise<boolean> => {
    if (!supabase) return false;
    setBusy(true);
    try {
      await deleteAccountRemote();
    } catch (e) {
      // Recoverable — the account still exists; the caller shows the manual
      // "email us and we'll remove it" fallback. Dev-only warn, never a LogBox.
      authWarn(`deleteAccount: ${messageFrom(e, 'rpc failed')}`);
      if (mounted.current) setBusy(false);
      return false;
    }
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // best-effort — applySession(null) below still swaps the surface
    }
    await applySession(null, 'no-session');
    if (mounted.current) setBusy(false);
    return true;
  }, [applySession]);

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
      signInWithApple,
      signInWithGoogle,
      resetPassword,
      completeSetup,
      createLocalBaby,
      continueLocally,
      goToAccountEntry,
      joinWithInvite,
      signOut,
      deleteAccount,
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
      signInWithApple,
      signInWithGoogle,
      resetPassword,
      completeSetup,
      createLocalBaby,
      continueLocally,
      goToAccountEntry,
      joinWithInvite,
      signOut,
      deleteAccount,
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
