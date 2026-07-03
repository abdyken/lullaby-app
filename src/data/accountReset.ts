/**
 * Account deletion — the local-data RESET contract (the mirror image of the
 * guest-data PRESERVATION contract in `./guestData`).
 *
 * Sign-out and every other auth transition a guest can reach PRESERVE the
 * guest-owned stores (baby + logs) — see `./guestData` and the GP1–GP6 guards.
 * Deleting the account is the ONE transition that does the opposite: once the
 * server has *verifiably* removed the account (the self-scoped `delete_account`
 * RPC), every trace of that person's baby, logs, onboarding state, and private
 * preferences on THIS device is erased too, so a later sign-in — even with the
 * same Google identity — starts genuinely fresh (Apple 5.1.1(v)).
 *
 * This module is the single source of truth for WHICH local keys that clear
 * touches, derived from the real key constants so it can't drift. It is free of
 * React and AsyncStorage so the smoke test can import it and pin the set; the
 * device I/O that actually removes them lives in `./accountResetStorage`.
 */
import { FIRST_LOG_COACH_DISMISSED_KEY } from '../components/firstLogCoach';
import { ONBOARDING_COMPLETE_KEY, ONBOARDING_DRAFT_KEY } from '../components/onboarding/onboardingStorage';
import { AI_NIGHT_READ_CONSENT_KEY } from '../features/reassure/domain/aiConsent';
import { PEDIATRICIAN_PHONE_KEY } from '../features/reassure/domain/pediatricianContact';
import { NIGHT_READ_CACHE_PREFIX } from '../features/reassure/application/nightReadKeys';
import { PREFERS_LOCAL_STORAGE_KEY } from '../state/authStorageKeys';
import { GUEST_OWNED_STORAGE_KEYS } from './guestData';
import { HANDOFF_CURSOR_PREFIX } from './handoffCursor';

/**
 * Exact AsyncStorage keys erased when an account is deleted. A SUPERSET of the
 * guest-owned stores (local baby + both event stores) plus:
 *   - the onboarding gate + draft, so baby setup runs again and can never
 *     re-prefill the deleted baby's name/date;
 *   - the sticky account decision, so the app returns to the account-entry flow
 *     (and a cold launch can't bounce back into local-only on a now-empty baby);
 *   - the parent's private Reassure prefs (AI consent + their own phone number)
 *     and the one-time first-log coach dismissal, so a fresh account is fresh.
 *
 * Deliberately EXCLUDES device-scoped app config that carries no user identity —
 * the theme surface mode (`lullaby.surfaceMode`) is a per-device preference, not
 * account data, so it survives (matching "don't clear unrelated config/theme").
 */
export const ACCOUNT_LOCAL_DATA_KEYS = [
  ...GUEST_OWNED_STORAGE_KEYS, // local baby + legacy night loop + logging-v2 snapshot
  ONBOARDING_COMPLETE_KEY,
  ONBOARDING_DRAFT_KEY,
  PREFERS_LOCAL_STORAGE_KEY,
  FIRST_LOG_COACH_DISMISSED_KEY,
  AI_NIGHT_READ_CONSENT_KEY,
  PEDIATRICIAN_PHONE_KEY,
] as const;

/**
 * Prefixes whose EVERY key is erased on deletion. These stores are keyed
 * per-baby / per-night (the night-read AI cache) or per-context (the handoff
 * "last caught up" cursor), so they can't be enumerated exactly — the device
 * wipe matches them against the full keyset by prefix.
 */
export const ACCOUNT_LOCAL_DATA_PREFIXES = [
  NIGHT_READ_CACHE_PREFIX, // 'lullaby/reassure/night-read/v1' — AI text about the baby's nights
  HANDOFF_CURSOR_PREFIX, // 'lullaby/handoff-cursor/' — per-context reading cursor
] as const;

/**
 * Device-scoped config we deliberately KEEP through an account deletion (it
 * carries no user identity). Documented here so the regression guard can assert
 * the theme is never swept into the wipe.
 */
export const ACCOUNT_RESET_PRESERVED_KEYS = ['lullaby.surfaceMode'] as const;

/**
 * Given every key currently in AsyncStorage, return exactly those to remove on
 * account deletion: the exact-match set plus anything under a cleared prefix.
 * Pure + total, so the smoke test can assert coverage without a device, and so
 * the device wipe removes only keys that actually exist (no blind removes).
 */
export function selectAccountDeletionKeys(allKeys: readonly string[]): string[] {
  const exact = new Set<string>(ACCOUNT_LOCAL_DATA_KEYS);
  return allKeys.filter(
    (key) => exact.has(key) || ACCOUNT_LOCAL_DATA_PREFIXES.some((prefix) => key.startsWith(prefix)),
  );
}
