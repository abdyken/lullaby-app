export type OnboardingNightShiftChoice = 'solo' | 'partner' | 'later';

export const ONBOARDING_NIGHT_SHIFT_CHOICES: readonly OnboardingNightShiftChoice[] = [
  'solo',
  'partner',
  'later',
];

export function hasOnboardingNightShiftChoice(choice: OnboardingNightShiftChoice | null): boolean {
  return choice !== null;
}
