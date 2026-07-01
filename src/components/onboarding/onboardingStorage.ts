import AsyncStorage from '@react-native-async-storage/async-storage';

// Relative imports (not `@/`): this module is loaded by the Node/tsx smoke test,
// which does not resolve the path alias. Both are pure key constants.
import { LOCAL_BABY_STORAGE_KEY } from '../../data/localBaby';
import { STORAGE_KEY as LOCAL_EVENTS_STORAGE_KEY } from '../../data/persistedState';

export const ONBOARDING_COMPLETE_KEY = 'lullaby.onboarding.v2.complete';

/**
 * The non-sensitive baby-setup answers onboarding collects, persisted so a later
 * Google/account sign-in can PREFILL the account baby setup instead of re-asking
 * (the "new users must not re-enter baby data" guarantee). Deliberately only the
 * fields the setup form needs — baby name + ISO birth date; never anything
 * sensitive. Absent/blank fields stay null (the skip path).
 */
export const ONBOARDING_DRAFT_KEY = 'lullaby.onboarding.v2.draft';

const COMPLETE_VALUE = 'true';

export type OnboardingDraft = {
  babyName: string | null;
  birthDate: string | null;
};

export type ResolvedOnboardingGateState = 'needed' | 'complete';

type ForceOnboardingOptions = {
  rawFlag?: string;
  isDev?: boolean;
};

function isDevelopmentRuntime(): boolean {
  if (typeof __DEV__ === 'boolean') return __DEV__;
  return process.env.NODE_ENV !== 'production';
}

export function isForceOnboardingEnabled(options: ForceOnboardingOptions = {}): boolean {
  const raw = options.rawFlag ?? process.env.EXPO_PUBLIC_FORCE_ONBOARDING;
  const isDev = options.isDev ?? isDevelopmentRuntime();
  return isDev && (raw === 'true' || raw === '1');
}

export function resolveOnboardingGateState(
  completed: boolean,
  options: ForceOnboardingOptions = {},
): ResolvedOnboardingGateState {
  if (isForceOnboardingEnabled(options)) return 'needed';
  return completed ? 'complete' : 'needed';
}

export async function loadOnboardingComplete(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)) === COMPLETE_VALUE;
  } catch {
    return false;
  }
}

export async function markOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, COMPLETE_VALUE);
  } catch {
    // Do not trap a tired parent in onboarding because local storage failed.
  }
}

/**
 * Persist the onboarding baby draft (name + ISO birth date). Best-effort: losing
 * the write only means a later account setup starts blank instead of prefilled.
 */
export async function saveOnboardingDraft(draft: OnboardingDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // best-effort — the draft only ever prefills a form, it is never authoritative
  }
}

/**
 * Read the onboarding baby draft, or null when absent/invalid or when it carries
 * no usable field (so callers can treat "nothing to prefill" as a single case).
 */
export async function loadOnboardingDraft(): Promise<OnboardingDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    const babyName = typeof obj.babyName === 'string' ? obj.babyName : null;
    const birthDate = typeof obj.birthDate === 'string' ? obj.birthDate : null;
    if (babyName == null && birthDate == null) return null;
    return { babyName, birthDate };
  } catch {
    return null;
  }
}

/**
 * Drop the onboarding baby draft once it has been consumed by account provisioning
 * (or a join), so it can never re-prefill a later, unrelated setup. Best-effort.
 */
export async function clearOnboardingDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ONBOARDING_DRAFT_KEY);
  } catch {
    // best-effort — a stale draft is only ever used to prefill, never to auto-write
  }
}

/**
 * Dev-only reset back to a true first-run: drops the onboarding-complete flag,
 * the persisted local baby/caregiver, AND the persisted local night events, so
 * the next launch re-runs onboarding from a clean slate (no leftover real baby or
 * its events). Returns whether the reset ran (false outside development).
 */
export async function resetOnboardingCompleteForDevelopment(): Promise<boolean> {
  if (!isDevelopmentRuntime()) return false;

  try {
    await AsyncStorage.multiRemove([
      ONBOARDING_COMPLETE_KEY,
      ONBOARDING_DRAFT_KEY,
      LOCAL_BABY_STORAGE_KEY,
      LOCAL_EVENTS_STORAGE_KEY,
    ]);
    return true;
  } catch {
    return false;
  }
}
