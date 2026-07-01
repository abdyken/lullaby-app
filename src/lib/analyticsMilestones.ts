/**
 * Persisted once-ever guards for milestone analytics events (first log, reached
 * 4 data days). Mirrors the onboarding/first-log-coach persisted-flag pattern so
 * a milestone fires at most once per device, surviving app restarts.
 *
 * Best-effort: a storage failure simply risks the milestone firing again later —
 * it never throws and never blocks the caller (analytics must not crash the app).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Milestone keys are scoped by userId + babyId (NOT device-only), so a milestone
 * fires once per account+baby — correct on a shared device and after a
 * sign-out / sign-in with a different account. Milestones only meaningfully fire
 * post-auth; a missing id falls back to a sentinel so the key stays well-formed.
 */
export function firstLogMilestoneKey(userId: string | null, babyId: string | null): string {
  return `lullaby.analytics.firstLog.v1:${userId ?? 'no-user'}:${babyId ?? 'no-baby'}`;
}

export function reached4DataDaysMilestoneKey(userId: string | null, babyId: string | null): string {
  return `lullaby.analytics.reached4DataDays.v1:${userId ?? 'no-user'}:${babyId ?? 'no-baby'}`;
}

const FIRED_VALUE = 'true';

/**
 * Fire `onFire` exactly once ever for `key`. If the persisted flag is already
 * set, this is a no-op. Sets the flag only after `onFire` runs.
 */
export async function fireMilestoneOnce(key: string, onFire: () => void): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(key)) === FIRED_VALUE) return;
    onFire();
    await AsyncStorage.setItem(key, FIRED_VALUE);
  } catch {
    // swallow — a tired parent is never blocked because analytics storage failed
  }
}
