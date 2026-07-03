/**
 * Night-read cache key — a pure leaf so both the night-read hook (`./nightRead`,
 * which imports React + the Supabase client and therefore can't be loaded by the
 * Node/tsx smoke runner) and the account-reset contract (`@/data/accountReset`)
 * can share the exact same prefix with no drift.
 *
 * The cache is keyed per baby per night as `${NIGHT_READ_CACHE_PREFIX}:${babyId}:${nightKey}`,
 * so it holds AI-phrased text derived from a specific baby's logged night — user
 * data that a full account deletion must erase (matched by this prefix).
 */
export const NIGHT_READ_CACHE_PREFIX = 'lullaby/reassure/night-read/v1';
