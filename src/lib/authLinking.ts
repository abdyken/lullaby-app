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

import { AUTH_CALLBACK_PATH, parseAuthRedirect, type AuthRedirect } from './authRedirect';

import type { SupabaseClient } from '@supabase/supabase-js';

export { AUTH_CALLBACK_PATH, parseAuthRedirect };
export type { AuthRedirect, AuthRedirectKind } from './authRedirect';

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
 * Run interactive Google sign-in via the system browser and land a Supabase
 * session — WITHOUT a native sign-in module (so the Android build path is
 * untouched and no extra native config is needed).
 *
 * Flow: ask Supabase for the Google authorization URL (`signInWithOAuth` with
 * `skipBrowserRedirect`, so WE own the browser), open it in an `expo-web-browser`
 * auth session that returns to our `lullaby://auth-callback` redirect, then reuse
 * the SAME redirect plumbing as the email reset/confirmation links
 * (`parseAuthRedirect` → `completeAuthRedirect`) to exchange the returned PKCE
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
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        // We open the browser ourselves (below) instead of a top-level redirect.
        skipBrowserRedirect: true,
        // Always show the account chooser rather than silently reusing one login.
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) return { status: 'error', error: error.message };
    authorizeUrl = data?.url ?? null;
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : 'oauth_init_failed' };
  }
  if (authorizeUrl == null) return { status: 'error', error: 'no_oauth_url' };

  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, redirectTo);
  // Anything but a returned redirect URL is a dismissal/cancel — stay calm.
  if (result.type !== 'success') return { status: 'canceled' };

  const redirect = parseAuthRedirect(result.url);
  if (redirect == null) return { status: 'error', error: 'no_redirect_credentials' };

  const outcome = await completeAuthRedirect(client, redirect);
  return outcome.ok
    ? { status: 'success' }
    : { status: 'error', error: outcome.error ?? 'exchange_failed' };
}
