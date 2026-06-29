export type OnboardingFocusNeed = 'sleep' | 'feeding' | 'reassurance' | 'everything';

export const ONBOARDING_FOCUS_NEEDS: readonly OnboardingFocusNeed[] = [
  'sleep',
  'feeding',
  'reassurance',
  'everything',
];

export function toggleOnboardingFocusNeed(
  selected: readonly OnboardingFocusNeed[],
  need: OnboardingFocusNeed,
): OnboardingFocusNeed[] {
  if (need === 'everything') {
    return selected.includes('everything') ? [] : ['everything'];
  }

  const focused = selected.filter((value) => value !== 'everything');
  if (focused.includes(need)) {
    return focused.filter((value) => value !== need);
  }

  return [...focused, need];
}

export function hasOnboardingFocusNeed(selected: readonly OnboardingFocusNeed[]): boolean {
  return selected.length > 0;
}
