/**
 * Guest / local-first data preservation contract (auth Step 08).
 *
 * Lullaby is local-first: a parent can use the whole app as a guest, with no
 * account, and "Continue locally" must always remain. That guest's data lives in
 * three AsyncStorage stores, each owned by its own pure (de)serialization module:
 *
 *   - `lullaby/local-baby/v1`   the local baby + caregiver  (`./localBaby`)
 *   - `lullaby/local-events/v1` the legacy local night loop  (`./persistedState`)
 *   - `lullaby/logging-v2/v1`   the logging-v2 snapshot      (`../features/logging/data/loggingPersistence`)
 *
 * THE GUARANTEE: none of the auth transitions a guest can reach may clear any of
 * these stores. Opening the account-entry surface, signing in, signing up,
 * signing out, and restarting the app must all leave guest data byte-identical —
 * no destructive clear before an explicit, confirmed action. Sign-out clears only
 * the Supabase session (the chunked secure-store keys) and signing in only swaps
 * the in-memory repository (see `../sync/resolveRepository`); neither touches the
 * keys above. The audit + rationale live in `docs/auth/guest-data-preservation.md`.
 *
 * Keys that ARE safe to clear are deliberately NOT in this set: the sticky
 * "prefers local" flag (`lullaby/auth/prefers-local/v1`) and the Supabase session
 * are auth-owned, not guest data.
 *
 * This module is the single source of truth for "which keys hold guest data" and
 * the formal "no silent data loss" predicate. It is intentionally free of React
 * and AsyncStorage so it runs under plain Node/tsx (the smoke test exercises it),
 * and it is the seam a future local → account migration (Phase 5, documented but
 * NOT implemented here) will read to know what it must carry over and verify.
 */
import { LOCAL_BABY_STORAGE_KEY } from './localBaby';
import { STORAGE_KEY as LOCAL_EVENTS_STORAGE_KEY } from './persistedState';
import { LOGGING_STORAGE_KEY } from '../features/logging/data/loggingPersistence';

export { LOCAL_BABY_STORAGE_KEY, LOCAL_EVENTS_STORAGE_KEY, LOGGING_STORAGE_KEY };

/**
 * Every AsyncStorage key that holds guest / local-first data and therefore MUST
 * survive every auth transition. Derived from the real key constants so this set
 * can never drift from the stores it protects.
 */
export const GUEST_OWNED_STORAGE_KEYS = [
  LOCAL_BABY_STORAGE_KEY,
  LOCAL_EVENTS_STORAGE_KEY,
  LOGGING_STORAGE_KEY,
] as const;

/** A read-only view of AsyncStorage as a key → raw-value map. */
export type StorageSnapshot = Readonly<Record<string, string>>;

/**
 * The "no silent data loss" predicate: true when every guest-owned key that held
 * a value in `before` still holds the *same* value in `after`. A transition that
 * adds or removes auth-only keys (the prefers-local flag, the session) is still
 * preserving, and a store the guest never wrote (absent in `before`) imposes no
 * constraint — only data that existed and then vanished or changed counts as loss.
 */
export function isGuestDataPreserved(before: StorageSnapshot, after: StorageSnapshot): boolean {
  return GUEST_OWNED_STORAGE_KEYS.every((key) => {
    const prior = before[key];
    if (prior === undefined) return true; // nothing was stored → nothing to lose
    return after[key] === prior; // must survive byte-identical
  });
}
