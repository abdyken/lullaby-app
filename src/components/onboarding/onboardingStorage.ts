import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_COMPLETE_KEY = 'lullaby.onboarding.v1.complete';

const COMPLETE_VALUE = 'true';

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

export async function resetOnboardingCompleteForDevelopment(): Promise<boolean> {
  if (!isDevelopmentRuntime()) return false;

  try {
    await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY);
    return true;
  } catch {
    return false;
  }
}
