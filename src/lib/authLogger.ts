/**
 * Severity-aware logging for the auth flow.
 *
 * The problem this solves: React Native's LogBox surfaces an in-app warning
 * drawer for EVERY `console.warn` / `console.error`. The OAuth callback emits a
 * lot of *expected* diagnostics ("empty callback — waiting for the real
 * redirect", "received type=empty", "exchange ok but no session yet") that are
 * normal states, not problems — routing those through `console.warn` popped a
 * scary warning bottom sheet during a perfectly healthy sign-in.
 *
 * The policy, by level:
 *   - authDebug / authInfo → NORMAL, expected states (empty/duplicate callback,
 *     waiting for the redirect/session, OAuth opened/cancelled, route replaced,
 *     local-only continuation). They use `console.debug` / `console.log`, which
 *     LogBox does NOT intercept, so they never pop the drawer. They are also
 *     SILENT by default and only print when `EXPO_PUBLIC_AUTH_DEBUG=1` in a dev
 *     build — so default dev runs stay quiet, no auth spam.
 *   - authWarn → genuinely SUSPICIOUS but RECOVERABLE (a retryable init/exchange
 *     timeout, an odd-but-handled callback shape). Dev-only `console.warn`; it
 *     intentionally shows in LogBox because a developer should notice it, but it
 *     never reaches production users.
 *   - authError → a REAL failure that blocks the user (provider returned an
 *     error, exchange failed with no session, persistence broke). `console.error`,
 *     always — the friendly retry UI is shown separately by the caller.
 *
 * NEVER pass tokens, auth codes, refresh/access tokens, raw callback URLs, or any
 * PII as `message` or `meta`. Log only sanitized, structural reasons — a callback
 * `type`, an error code, a short phrase. Use `sanitizeAuthUrl` before logging any
 * URL so credentials in the query/fragment can never leak.
 *
 * `process.env.EXPO_PUBLIC_AUTH_DEBUG` is read via static dot-notation so Expo
 * inlines it at build time (https://docs.expo.dev/guides/environment-variables/).
 */

/** Normal auth diagnostics print only when explicitly opted in, in a dev build. */
const AUTH_DEBUG_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_AUTH_DEBUG === '1';

/**
 * Strip the query and fragment from a deep-link URL, keeping only scheme + path —
 * so a `?code=…` / `#access_token=…` can never reach a log sink. Returns a calm
 * placeholder for empty/non-string input. Use this for any URL you must log.
 */
export function sanitizeAuthUrl(url: string | null | undefined): string {
  if (typeof url !== 'string' || url.length === 0) return '(none)';
  const cut = url.search(/[?#]/);
  const base = cut >= 0 ? url.slice(0, cut) : url;
  return cut >= 0 ? `${base}?…` : base;
}

/**
 * A normal, expected auth state. Silent unless EXPO_PUBLIC_AUTH_DEBUG=1 (dev).
 * Uses console.debug, which LogBox never surfaces — so it can never pop the
 * in-app warning drawer.
 */
export function authDebug(message: string, meta?: unknown): void {
  if (!AUTH_DEBUG_ENABLED) return;
  if (meta !== undefined) console.debug(`[auth] ${message}`, meta);
  else console.debug(`[auth] ${message}`);
}

/**
 * A normal, slightly more notable auth breadcrumb (e.g. "routing home after
 * sign-in"). Same gating + LogBox-safe sink as authDebug, via console.log.
 */
export function authInfo(message: string, meta?: unknown): void {
  if (!AUTH_DEBUG_ENABLED) return;
  if (meta !== undefined) console.log(`[auth] ${message}`, meta);
  else console.log(`[auth] ${message}`);
}

/**
 * A suspicious-but-recoverable condition worth a developer's attention. Dev-only;
 * shows in LogBox by design, never in production.
 */
export function authWarn(message: string, meta?: unknown): void {
  if (!__DEV__) return;
  if (meta !== undefined) console.warn(`[auth] ${message}`, meta);
  else console.warn(`[auth] ${message}`);
}

/**
 * A real failure that blocks the user. Always logged (LogBox in dev; a plain
 * error sink in production). The caller still renders the calm, friendly UI.
 */
export function authError(message: string, meta?: unknown): void {
  if (meta !== undefined) console.error(`[auth] ${message}`, meta);
  else console.error(`[auth] ${message}`);
}
