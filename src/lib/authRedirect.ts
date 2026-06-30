/**
 * Pure parsing of the auth deep links Supabase sends back into the app.
 *
 * When a caregiver taps a password-reset or email-confirmation link, Supabase
 * verifies it and redirects to our app's `redirectTo` URL — `lullaby://auth-callback`
 * (built by `getAuthRedirectUrl` in ./authLinking). Depending on the project's
 * auth flow that URL carries either:
 *   - implicit-flow tokens in the fragment: `#access_token=…&refresh_token=…&type=recovery`
 *   - a PKCE code in the query: `?code=…`
 *   - an error in either: `?error=…&error_code=…&error_description=…`
 *
 * This module is a dependency-free leaf (no react-native / expo / supabase
 * imports) so the smoke runner can cover it directly and the app can call it on
 * any platform. The side-effecting half — building the redirect URL, listening
 * for links, and exchanging credentials for a session — lives in ./authLinking,
 * which imports expo-linking and the Supabase client and can't load under node.
 */

/** The path segment the auth redirect lands on: `lullaby://auth-callback`. */
export const AUTH_CALLBACK_PATH = 'auth-callback';

/** What kind of auth redirect arrived, derived from Supabase's `type` / error. */
export type AuthRedirectKind =
  | 'recovery'
  | 'signup'
  | 'magiclink'
  | 'invite'
  | 'email_change'
  | 'error'
  | 'unknown';

export type AuthRedirect = {
  kind: AuthRedirectKind;
  /** PKCE authorization code (query `?code=…`), if present. */
  code: string | null;
  /** Implicit-flow access token (fragment `#access_token=…`), if present. */
  accessToken: string | null;
  /** Implicit-flow refresh token (fragment `#refresh_token=…`), if present. */
  refreshToken: string | null;
  /** Provider error code (e.g. `otp_expired`), if the link failed. */
  errorCode: string | null;
  /** Human-readable provider error (already URL-decoded), if present. */
  errorDescription: string | null;
};

/**
 * Decode `key=value&key2=value2` form-encoded params into `out`, tolerating the
 * `+`-as-space convention and malformed escapes. We hand-parse instead of using
 * `URLSearchParams` so the leaf needs no global polyfill (Hermes doesn't ship
 * one) and behaves identically under node and React Native.
 */
function collectParams(input: string, out: Map<string, string>): void {
  for (const pair of input.split('&')) {
    if (pair.length === 0) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
    const rawVal = eq >= 0 ? pair.slice(eq + 1) : '';
    let key: string;
    let val: string;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    } catch {
      key = rawKey;
    }
    try {
      val = decodeURIComponent(rawVal.replace(/\+/g, ' '));
    } catch {
      val = rawVal;
    }
    if (key.length > 0) out.set(key, val);
  }
}

/** The raw auth fields read out of a callback URL (query + fragment merged). */
type AuthParams = {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  /** Supabase's `type` hint (recovery/signup/…), lowercased; '' when absent. */
  type: string;
};

/**
 * Read the auth params out of a deep-link URL, merging the query and the
 * fragment (Supabase puts implicit tokens in the fragment, PKCE codes / errors
 * in the query). Returns `null` only for a non-string / empty input; a URL with
 * no auth params yields an all-null `AuthParams`. The single source of truth for
 * BOTH `parseAuthRedirect` and `parseAuthCallbackUrl`, so they can never disagree
 * on whether a given URL carries a code / tokens / error.
 */
function extractAuthParams(url: string | null | undefined): AuthParams | null {
  if (typeof url !== 'string' || url.length === 0) return null;

  const hashIndex = url.indexOf('#');
  const fragment = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = beforeHash.indexOf('?');
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';

  const params = new Map<string, string>();
  collectParams(query, params);
  collectParams(fragment, params);

  const read = (key: string): string | null => {
    const value = params.get(key);
    return value != null && value.length > 0 ? value : null;
  };

  return {
    code: read('code'),
    accessToken: read('access_token'),
    refreshToken: read('refresh_token'),
    errorCode: read('error_code') ?? read('error'),
    errorDescription: read('error_description'),
    type: (read('type') ?? '').toLowerCase(),
  };
}

/**
 * Parse an incoming deep-link URL into a structured auth redirect, or `null`
 * when it carries no recognizable auth material (a normal launch URL, a router
 * link, junk). Params are read from BOTH the query and the fragment because
 * Supabase puts implicit tokens in the fragment and PKCE codes / errors in the
 * query. Pure and total — safe to call with any string.
 */
export function parseAuthRedirect(url: string | null | undefined): AuthRedirect | null {
  const p = extractAuthParams(url);
  if (p == null) return null;

  const hasTokens = p.accessToken != null && p.refreshToken != null;
  const hasCode = p.code != null;
  const hasError = p.errorCode != null;

  // Only URLs that actually carry auth credentials/errors are auth redirects —
  // everything else (a plain deep link) returns null and is ignored upstream.
  if (!hasTokens && !hasCode && !hasError) return null;

  let kind: AuthRedirectKind;
  if (hasError) {
    kind = 'error';
  } else if (p.type === 'recovery') {
    kind = 'recovery';
  } else if (p.type === 'signup') {
    kind = 'signup';
  } else if (p.type === 'magiclink') {
    kind = 'magiclink';
  } else if (p.type === 'invite') {
    kind = 'invite';
  } else if (p.type === 'email_change') {
    kind = 'email_change';
  } else {
    kind = 'unknown';
  }

  return {
    kind,
    code: p.code,
    accessToken: p.accessToken,
    refreshToken: p.refreshToken,
    errorCode: p.errorCode,
    errorDescription: p.errorDescription,
  };
}

/**
 * Canonical classification of an OAuth / auth callback URL into the four cases
 * the callback handler must distinguish — deliberately NON-throwing and total so
 * an empty or intermediate callback is data, never an exception:
 *
 *   - `code`        → a PKCE authorization code (query `?code=…`) to exchange.
 *   - `tokens`      → implicit-flow tokens (fragment `#access_token=…`); a
 *                     compatibility path — the app is configured for PKCE, but
 *                     Android can still surface these on some setups.
 *   - `oauth_error` → the provider bounced back a real `?error=…` — the ONLY
 *                     case that is genuinely fatal.
 *   - `empty`       → no code, no tokens, no error. NOT a failure: a bare /
 *                     intermediate `lullaby://auth-callback` (a stale launch URL,
 *                     a duplicate redirect, the fragment Android stripped) lands
 *                     here and the handler must WAIT for the real one / the
 *                     session, never declare "Missing code" on it.
 *
 * The original incoming URL is echoed back on every case (handy for dedup keys
 * and diagnostics). Pure and total — safe to call with any string, null, or
 * undefined.
 */
export type AuthCallbackResult =
  | { type: 'code'; code: string; url: string }
  | { type: 'tokens'; accessToken: string; refreshToken: string | null; url: string }
  | { type: 'oauth_error'; error: string; description: string | null; url: string }
  | { type: 'empty'; url: string };

export function parseAuthCallbackUrl(url: string | null | undefined): AuthCallbackResult {
  const safeUrl = typeof url === 'string' ? url : '';
  const p = extractAuthParams(url);
  if (p == null) return { type: 'empty', url: safeUrl };

  // Precedence: a real provider error wins (fatal), then the PKCE code (the
  // configured primary path), then implicit tokens (compatibility), else empty.
  if (p.errorCode != null) {
    return { type: 'oauth_error', error: p.errorCode, description: p.errorDescription, url: safeUrl };
  }
  if (p.code != null) {
    return { type: 'code', code: p.code, url: safeUrl };
  }
  if (p.accessToken != null) {
    return { type: 'tokens', accessToken: p.accessToken, refreshToken: p.refreshToken, url: safeUrl };
  }
  return { type: 'empty', url: safeUrl };
}

export default parseAuthRedirect;
