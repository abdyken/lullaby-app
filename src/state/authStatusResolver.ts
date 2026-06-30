/**
 * resolveNoSessionStatus — the pure decision the AuthProvider makes when there is
 * NO Supabase session: should the app show the account-entry surface, or drop
 * straight into the local app?
 *
 *   'signed-out' → render the account-entry surface (Create account / Sign in /
 *                  Continue locally). Shown once after onboarding when the guest
 *                  has not yet made an account decision, so the entry is visible
 *                  instead of being skipped silently.
 *   'local-only' → render the app on the local repository. A returning guest who
 *                  already tapped "Continue locally" is never re-walled — the
 *                  sticky preference keeps them in the app.
 *
 * Used for BOTH the configured-but-signed-out path and the unconfigured (no
 * Supabase env) cold launch, so the account entry appears after onboarding
 * regardless of whether Supabase is configured. Before this, an unconfigured
 * build sat permanently in 'local-only' and the entry never appeared.
 *
 * Kept React- and AsyncStorage-free (a pure leaf) so the Node/tsx smoke test can
 * cover it directly.
 */
export type NoSessionStatus = 'local-only' | 'signed-out';

export function resolveNoSessionStatus(prefersLocal: boolean): NoSessionStatus {
  return prefersLocal ? 'local-only' : 'signed-out';
}
