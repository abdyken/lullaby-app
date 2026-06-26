export type OnboardingVisual = 'night' | 'recap' | 'reassure';

export type OnboardingPanel = {
  id: 'track' | 'clear' | 'reassure';
  eyebrow: string;
  title: string;
  body: string;
  visual: OnboardingVisual;
};

export const ONBOARDING_INTRO_MS = 950;
export const ONBOARDING_INTRO_MS_REDUCED = 180;
export const ONBOARDING_NEXT_LABEL = 'Next';
export const ONBOARDING_FINAL_LABEL = 'Set up baby';
export const ONBOARDING_COMPLETING_LABEL = 'Setting up...';

export const ONBOARDING_PANELS: OnboardingPanel[] = [
  {
    id: 'track',
    eyebrow: 'LOG THE NIGHT',
    title: 'Log feeds, sleep, and diapers.',
    body: 'Feeds, sleep, diapers, and notes stay together at 3am.',
    visual: 'night',
  },
  {
    id: 'clear',
    eyebrow: 'WHAT HAPPENED',
    title: 'See the night in the morning.',
    body: 'Feeds, diapers, sleep, and notes are all in one place.',
    visual: 'recap',
  },
  {
    id: 'reassure',
    eyebrow: 'CALM NEXT STEP',
    title: 'Ask a simple baby-care question.',
    body: 'Get a calm next step, not a diagnosis. If it feels urgent, call your doctor.',
    visual: 'reassure',
  },
];

export type OnboardingNextStep = number | 'complete';

export function getOnboardingIntroDuration(reduceMotion: boolean): number {
  return reduceMotion ? ONBOARDING_INTRO_MS_REDUCED : ONBOARDING_INTRO_MS;
}

export function isFinalOnboardingPanel(index: number): boolean {
  return index >= ONBOARDING_PANELS.length - 1;
}

export function getOnboardingCtaLabel(index: number, completing = false): string {
  if (completing && isFinalOnboardingPanel(index)) return ONBOARDING_COMPLETING_LABEL;
  return isFinalOnboardingPanel(index) ? ONBOARDING_FINAL_LABEL : ONBOARDING_NEXT_LABEL;
}

export function getOnboardingPrimaryActionState(
  index: number,
  completing = false,
): { label: string; loading: boolean } {
  const loading = completing && isFinalOnboardingPanel(index);
  return { label: getOnboardingCtaLabel(index, loading), loading };
}

export function shouldShowOnboardingSkip(index: number): boolean {
  return !isFinalOnboardingPanel(index);
}

export function getNextOnboardingStep(index: number): OnboardingNextStep {
  return isFinalOnboardingPanel(index) ? 'complete' : Math.max(0, index) + 1;
}
