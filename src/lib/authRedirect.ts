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

/**
 * Parse an incoming deep-link URL into a structured auth redirect, or `null`
 * when it carries no recognizable auth material (a normal launch URL, a router
 * link, junk). Params are read from BOTH the query and the fragment because
 * Supabase puts implicit tokens in the fragment and PKCE codes / errors in the
 * query. Pure and total — safe to call with any string.
 */
export function parseAuthRedirect(url: string | null | undefined): AuthRedirect | null {
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

  const accessToken = read('access_token');
  const refreshToken = read('refresh_token');
  const code = read('code');
  const errorCode = read('error_code') ?? read('error');
  const errorDescription = read('error_description');
  const type = (read('type') ?? '').toLowerCase();

  const hasTokens = accessToken != null && refreshToken != null;
  const hasCode = code != null;
  const hasError = errorCode != null;

  // Only URLs that actually carry auth credentials/errors are auth redirects —
  // everything else (a plain deep link) returns null and is ignored upstream.
  if (!hasTokens && !hasCode && !hasError) return null;

  let kind: AuthRedirectKind;
  if (hasError) {
    kind = 'error';
  } else if (type === 'recovery') {
    kind = 'recovery';
  } else if (type === 'signup') {
    kind = 'signup';
  } else if (type === 'magiclink') {
    kind = 'magiclink';
  } else if (type === 'invite') {
    kind = 'invite';
  } else if (type === 'email_change') {
    kind = 'email_change';
  } else {
    kind = 'unknown';
  }

  return { kind, code, accessToken, refreshToken, errorCode, errorDescription };
}

export default parseAuthRedirect;
