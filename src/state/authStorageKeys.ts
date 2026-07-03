/**
 * Auth-owned AsyncStorage keys — a pure leaf so both `AuthProvider` (React
 * Native) and the account-reset contract (`@/data/accountReset`, imported by the
 * Node/tsx smoke test) can share the exact same constant with no drift and no
 * React/AsyncStorage import. AuthProvider itself pulls in React Native, so it
 * cannot be imported by the smoke runner; this leaf can.
 */

/**
 * Persisted "this guest chose to keep using Lullaby locally" flag. Set when
 * "Continue locally" is tapped on the account-entry surface so a *configured*
 * build doesn't re-show that surface on the next cold launch (local-first is
 * sticky, not a per-launch nag). Namespaced + versioned like the other local
 * stores; it only matters while there is no session — the signed-in path ignores
 * it. Auth-owned (NOT guest data): safe to clear on the account-decision reset
 * and on a full account deletion.
 */
export const PREFERS_LOCAL_STORAGE_KEY = 'lullaby/auth/prefers-local/v1';
