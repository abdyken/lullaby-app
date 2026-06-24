import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_COMPLETE_KEY = 'lullaby.onboarding.v1.complete';

const COMPLETE_VALUE = 'true';

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
