/**
 * Account deletion — the device-side local wipe (Apple 5.1.1(v)).
 *
 * The ONLY module that erases the local baby / logs / onboarding state / private
 * prefs from AsyncStorage. It runs EXCLUSIVELY on the delete-account path, and
 * only AFTER the server has verifiably removed the account (see
 * `AuthProvider.deleteAccount`) — never on sign-out, which preserves guest data
 * (`./guestData` + the GP guards). The WHICH lives in the pure `./accountReset`
 * contract; this file is the thin AsyncStorage wrapper, so the smoke test can
 * pin the key set without touching a device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { selectAccountDeletionKeys } from './accountReset';

/**
 * Erase every local store tied to the just-deleted account: the baby profile,
 * both event stores, the onboarding gate + draft, the sticky account decision,
 * the one-time coach dismissal, and the private Reassure prefs + per-baby/night
 * caches. Device config with no user identity (the theme surface mode) is left
 * intact on purpose.
 *
 * Best-effort and total: a storage failure must never trap the parent on the
 * deletion screen, and the server delete has already succeeded, so the account
 * is gone regardless — a failed local wipe merely degrades to stale local data,
 * which the next fresh setup overwrites. We scan the live keyset and remove only
 * matching keys (exact + prefixed) in a single batch.
 */
export async function clearLocalAppDataAfterAccountDeletion(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const toRemove = selectAccountDeletionKeys(allKeys);
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
    }
  } catch {
    // best-effort — see the doc comment; the account is already gone server-side.
  }
}
