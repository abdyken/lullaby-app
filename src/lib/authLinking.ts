/**
 * App-side deep-link foundation for auth redirects (password reset + email
 * confirmation). This is the side-effecting companion to ./authRedirect (the
 * pure parser): it builds the redirect URL, listens for incoming links, and
 * exchanges the parsed credentials for a Supabase session.
 *
 * Gating: everything here is only ever reached in a *configured* build.
 * `getAuthRedirectUrl` is called from `AuthProvider.resetPassword`, which no-ops
 * without a Supabase client; the listener is wired in a configured-only effect.
 * So the local-only / unconfigured demo never touches this module's behavior.
 *
 * Scope note: this slice establishes the session from a redirect (which already
 * completes the email-confirmation flow end to end). The dedicated "set a new
 * password" screen that a `recovery` link should lead to is a deliberate
 * follow-up — see supabase/README.md ("Password reset (deep link)").
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { authWarn } from './authLogger';
import {
  AUTH_CALLBACK_PATH,
  parseAuthCallbackUrl,
  parseAuthRedirect,
  type AuthCallbackResult,
  type AuthRedirect,
} from './authRedirect';

import type { SupabaseClient } from '@supabase/supabase-js';

export { AUTH_CALLBACK_PATH, parseAuthCallbackUrl, parseAuthRedirect };
export type { AuthCallbackResult, AuthRedirect, AuthRedirectKind } from './authRedirect';

/**
 * The redirect URL Supabase should send the caregiver back to after a reset /
 * confirmation email — `lullaby://auth-callback` in a dev-client / standalone
 * build (an `exp://…/--/auth-callback` dev URL under Expo Go). Pass this as
 * `resetPasswordForEmail(..., { redirectTo })` and add it to the project's
 * "Redirect URLs" allowlist (see supabase/README.md).
 */
export function getAuthRedirectUrl(): string {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

export type AuthRedirectResult = {
  ok: boolean;
  kind: AuthRedirect['kind'];
  error?: string;
};

/**
 * Turn a parsed auth redirect into a Supabase session: `setSession` for the
 * implicit-flow tokens this client produces by default, `exchangeCodeForSession`
 * for a PKCE code (forward-compatible). On success the client's own
 * `onAuthStateChange` fires and AuthProvider re-evaluates — we never set React
 * state here. Errors are returned, not thrown, so a stale/expired link is a calm
 * no-op rather than a crash.
 */
export async function completeAuthRedirect(
  client: SupabaseClient,
  redirect: AuthRedirect,
): Promise<AuthRedirectResult> {
  if (redirect.kind === 'error') {
    return {
      ok: false,
      kind: 'error',
      error: redirect.errorDescription ?? redirect.errorCode ?? 'auth_redirect_error',
    };
  }
  try {
    if (redirect.accessToken != null && redirect.refreshToken != null) {
      const { error } = await client.auth.setSession({
        access_token: redirect.accessToken,
        refresh_token: redirect.refreshToken,
      });
      return error ? { ok: false, kind: redirect.kind, error: error.message } : { ok: true, kind: redirect.kind };
    }
    if (redirect.code != null) {
      const { error } = await client.auth.exchangeCodeForSession(redirect.code);
      return error ? { ok: false, kind: redirect.kind, error: error.message } : { ok: true, kind: redirect.kind };
    }
    return { ok: false, kind: redirect.kind, error: 'no_credentials' };
  } catch (e) {
    return {
      ok: false,
      kind: redirect.kind,
      error: e instanceof Error ? e.message : 'exchange_failed',
    };
  }
}

/**
 * In-flight (and resolved) exchange promises, keyed by the single-use credential
 * (the PKCE code or the access token). A PKCE code can be exchanged exactly ONCE,
 * yet the same callback can reach us twice — the in-browser `startGoogleOAuth`
 * path AND the `/auth-callback` deep-link route can both fire for one sign-in on
 * Android. Without dedup the second caller's `exchangeCodeForSession` fails with
 * a benign "code already used", which used to read as a real error. Keyed dedup
 * makes the exchange IDEMPOTENT: the second caller awaits (and resolves to) the
 * SAME result as the first, so a duplicate callback can never manufacture a false
 * failure or a second conflicting session. Entries are never evicted — codes are
 * one-time and few per session, so the map stays tiny and a late duplicate still
 * resolves to the original outcome.
 */
const inFlightExchanges = new Map<string, Promise<AuthRedirectResult>>();

/** Turn a classified callback into the redirect shape `completeAuthRedirect` exchanges. */
function callbackToRedirect(cb: AuthCallbackResult): AuthRedirect {
  if (cb.type === 'oauth_error') {
    return {
      kind: 'error',
      code: null,
      accessToken: null,
      refreshToken: null,
      errorCode: cb.error,
      errorDescription: cb.description,
    };
  }
  if (cb.type === 'code') {
    return { kind: 'unknown', code: cb.code, accessToken: null, refreshToken: null, errorCode: null, errorDescription: null };
  }
  if (cb.type === 'tokens') {
    return {
      kind: 'unknown',
      code: null,
      accessToken: cb.accessToken,
      refreshToken: cb.refreshToken,
      errorCode: null,
      errorDescription: null,
    };
  }
  return { kind: 'unknown', code: null, accessToken: null, refreshToken: null, errorCode: null, errorDescription: null };
}

/**
 * Exchange a classified auth callback for a Supabase session, EXACTLY ONCE per
 * credential. This is the single canonical exchanger shared by both callers (the
 * in-browser `startGoogleOAuth` round-trip and the `/auth-callback` deep-link
 * route), so duplicate delivery of one callback never double-spends the single-use
 * PKCE code. Delegates the actual `setSession` / `exchangeCodeForSession` to
 * `completeAuthRedirect`; only adds the keyed in-flight dedup around it. On
 * success the client's `onAuthStateChange` fires and AuthProvider re-evaluates.
 */
export function exchangeAuthCallback(
  client: SupabaseClient,
  cb: AuthCallbackResult,
): Promise<AuthRedirectResult> {
  const key =
    cb.type === 'code' ? `code:${cb.code}` : cb.type === 'tokens' ? `token:${cb.accessToken}` : null;
  const redirect = callbackToRedirect(cb);
  // No reusable credential (empty / error) → nothing to dedup; exchange directly.
  if (key == null) return completeAuthRedirect(client, redirect);
  const existing = inFlightExchanges.get(key);
  if (existing != null) return existing;
  const pending = completeAuthRedirect(client, redirect);
  inFlightExchanges.set(key, pending);
  return pending;
}

/**
 * Listen for auth redirects — both the cold-start URL (app opened by the link)
 * and links that arrive while running — and invoke `onRedirect` only for URLs
 * that parse as an auth callback. Returns an unsubscribe to call on cleanup.
 * Non-auth deep links are ignored, so this coexists with expo-router's own
 * linking. Best-effort: a failed `getInitialURL` read is swallowed.
 */
export function subscribeToAuthRedirects(onRedirect: (redirect: AuthRedirect) => void): () => void {
  let active = true;
  const handle = (url: string | null) => {
    if (!active) return;
    const redirect = parseAuthRedirect(url);
    if (redirect != null) onRedirect(redirect);
  };
  void Linking.getInitialURL()
    .then(handle)
    .catch(() => {});
  const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
  return () => {
    active = false;
    subscription.remove();
  };
}

/** Outcome of the interactive Google OAuth round-trip (browser → session). */
export type OAuthOutcome =
  | { status: 'success' }
  | { status: 'canceled' }
  | { status: 'error'; error: string };

/**
 * Timeout ceiling for the NON-interactive network steps of the OAuth round-trip:
 * asking Supabase for the authorize URL, and exchanging the returned code/tokens
 * for a session. These never wait on the human (that is `openAuthSessionAsync`,
 * which is deliberately NOT timed out), so a stall here means the network is
 * wedged — fail with a calm error instead of leaving the button spinning forever.
 */
const OAUTH_STEP_TIMEOUT_MS = 20_000;

/** Sentinel resolved by the timeout leg of a Promise.race (distinct from any real value). */
const OAUTH_TIMED_OUT = Symbol('oauth_timed_out');

/** Resolve to OAUTH_TIMED_OUT after `ms`, so a hung step can't stall the flow. */
function afterTimeout(ms: number): Promise<typeof OAUTH_TIMED_OUT> {
  return new Promise((resolve) => setTimeout(() => resolve(OAUTH_TIMED_OUT), ms));
}

/**
 * Suspicious-but-recoverable OAuth diagnostic (init/exchange timeout, an odd-but-
 * handled browser result). Dev-only via authWarn; never logs the URL, code, or
 * tokens — only a short, structural reason. A dismissed browser is NOT routed here
 * (it's a calm `canceled`), so this never fires for the normal cancel path.
 */
function warnOAuth(reason: string): void {
  authWarn(`Google OAuth: ${reason}`);
}

/**
 * Run interactive Google sign-in via the system browser and land a Supabase
 * session — WITHOUT a native sign-in module (so the Android build path is
 * untouched and no extra native config is needed).
 *
 * Flow: ask Supabase for the Google authorization URL (`signInWithOAuth` with
 * `skipBrowserRedirect`, so WE own the browser), open it in an `expo-web-browser`
 * auth session that returns to our `lullaby://auth-callback` redirect, then reuse
 * the SAME redirect plumbing as the email reset/confirmation links
 * (`parseAuthCallbackUrl` → `exchangeAuthCallback`) to exchange the returned PKCE
 * code or implicit tokens for a session. On success the client's
 * `onAuthStateChange` fires and AuthProvider re-evaluates — no React state is set
 * here. A dismissed browser is a calm `canceled` (not an error); all errors are
 * returned, never thrown.
 *
 * Because it reuses the existing redirect URL + parser, the project's existing
 * `lullaby://auth-callback` allowlist entry covers this too — the only extra
 * dashboard step is enabling the Google provider (see supabase/README.md).
 */
export async function startGoogleOAuth(client: SupabaseClient): Promise<OAuthOutcome> {
  const redirectTo = getAuthRedirectUrl();

  let authorizeUrl: string | null;
  try {
    // Step 1 (non-interactive): ask Supabase for the authorize URL. Timed out so a
    // wedged network can't leave the caller's busy spinner stuck before the browser
    // even opens.
    const init = await Promise.race([
      client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          // We open the browser ourselves (below) instead of a top-level redirect.
          skipBrowserRedirect: true,
          // Always show the account chooser rather than silently reusing one login.
          queryParams: { prompt: 'select_account' },
        },
      }),
      afterTimeout(OAUTH_STEP_TIMEOUT_MS),
    ]);
    if (init === OAUTH_TIMED_OUT) {
      warnOAuth('timed out requesting the authorize URL');
      return { status: 'error', error: 'oauth_init_timeout' };
    }
    if (init.error) {
      warnOAuth(`init failed: ${init.error.message}`);
      return { status: 'error', error: init.error.message };
    }
    authorizeUrl = init.data?.url ?? null;
  } catch (e) {
    warnOAuth('init threw');
    return { status: 'error', error: e instanceof Error ? e.message : 'oauth_init_failed' };
  }
  if (authorizeUrl == null) return { status: 'error', error: 'no_oauth_url' };

  // Step 2 (INTERACTIVE — never timed out): the parent picks an account/consents.
  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, redirectTo);
  // Anything but a returned redirect URL is a dismissal/cancel — stay calm. The
  // app-side /auth-callback route is the fallback if the redirect escaped the
  // browser session as a deep link, so a "cancel" here is never a dead end.
  if (result.type !== 'success') return { status: 'canceled' };

  const cb = parseAuthCallbackUrl(result.url);
  if (cb.type === 'empty') {
    // The browser returned to our redirect but with no code/tokens/error. The
    // /auth-callback deep-link route is the fallback that completes the session if
    // it arrives there instead, so this is a calm no-credentials outcome, not a
    // crash (and AuthProvider treats it as a recoverable error, never fatal).
    warnOAuth('browser returned no auth credentials');
    return { status: 'error', error: 'no_redirect_credentials' };
  }

  // Step 3 (non-interactive): exchange the code/tokens for a session — through the
  // shared, idempotent exchanger so a duplicate /auth-callback delivery of the SAME
  // code can't double-spend it. Timed out so a stalled exchange can't hang the flow.
  const outcome = await Promise.race([
    exchangeAuthCallback(client, cb),
    afterTimeout(OAUTH_STEP_TIMEOUT_MS),
  ]);
  if (outcome === OAUTH_TIMED_OUT) {
    warnOAuth('timed out exchanging the code for a session');
    return { status: 'error', error: 'oauth_exchange_timeout' };
  }
  if (!outcome.ok) warnOAuth(`exchange failed: ${outcome.error ?? 'unknown'}`);
  return outcome.ok
    ? { status: 'success' }
    : { status: 'error', error: outcome.error ?? 'exchange_failed' };
}
