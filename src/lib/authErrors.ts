/**
 * Calm, parent-facing copy for Supabase auth failures.
 *
 * Supabase/GoTrue returns terse, technical messages ("Invalid login
 * credentials", "User already registered", "Password should be at least 6
 * characters"). A tired newborn parent should never read those. This maps the
 * raw error to a calm, reassuring sentence that says what happened and what to
 * do next — no blame, no jargon.
 *
 * Detection order, most reliable first:
 *   1. the stable `code` string supabase-js v2 sets on AuthApiError
 *   2. the HTTP `status` (e.g. 429 rate limit) / retryable-fetch name (offline)
 *   3. a message-substring heuristic, for clients/responses that omit `code`
 *   4. the caller's context-appropriate fallback
 *
 * Pure and dependency-free so it stays trivially testable and safe to call with
 * any thrown value (it accepts `unknown`).
 */

/** The few fields we read off a Supabase `AuthError` (all optional/untrusted). */
type RawAuthError = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  name?: unknown;
};

function asErrorLike(error: unknown): RawAuthError {
  return error && typeof error === 'object' ? (error as RawAuthError) : {};
}

export function calmAuthErrorMessage(error: unknown, fallback: string): string {
  const raw = asErrorLike(error);
  const code = typeof raw.code === 'string' ? raw.code : '';
  const status = typeof raw.status === 'number' ? raw.status : undefined;
  const name = typeof raw.name === 'string' ? raw.name : '';
  const message = typeof raw.message === 'string' ? raw.message.toLowerCase() : '';

  // Offline / unreachable — the most common real-world failure on a phone.
  if (
    name === 'AuthRetryableFetchError' ||
    message.includes('network request failed') ||
    message.includes('failed to fetch')
  ) {
    return "We couldn't reach the network. Check your connection and try again.";
  }

  // Too many attempts — calm, with a concrete next step.
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || status === 429) {
    return 'That was a lot of tries in a row. Please wait a minute, then try again.';
  }

  switch (code) {
    case 'invalid_credentials':
      return "That email and password don't match. Please double-check them.";
    case 'email_not_confirmed':
      return 'Please confirm your email first — tap the link we sent, then sign in.';
    case 'user_already_exists':
    case 'email_exists':
      return 'That email already has an account. Try signing in instead.';
    case 'weak_password':
      return 'Please pick a password with at least 6 characters.';
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'New accounts are paused right now — you can keep using Lullaby on this phone.';
    case 'validation_failed':
      return 'Please check your email and password, then try again.';
    default:
      break;
  }

  // Heuristics for clients/responses that don't carry a machine-readable code.
  if (message.includes('invalid login credentials')) {
    return "That email and password don't match. Please double-check them.";
  }
  if (message.includes('email not confirmed')) {
    return 'Please confirm your email first — tap the link we sent, then sign in.';
  }
  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'That email already has an account. Try signing in instead.';
  }
  if (message.includes('password') && message.includes('6')) {
    return 'Please pick a password with at least 6 characters.';
  }

  return fallback;
}

export default calmAuthErrorMessage;
