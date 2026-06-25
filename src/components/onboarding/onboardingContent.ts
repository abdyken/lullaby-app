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
    eyebrow: 'TRACK THE NIGHT',
    title: 'Keep the whole night in one soft thread.',
    body: 'Feeds, diapers, sleep, and notes stay together when 3am feels blurry.',
    visual: 'night',
  },
  {
    id: 'clear',
    eyebrow: 'WAKE UP CLEAR',
    title: 'Morning starts with context, not guessing.',
    body: 'See what happened overnight and pick up the day with less mental math.',
    visual: 'recap',
  },
  {
    id: 'reassure',
    eyebrow: 'CALM REASSURANCE',
    title: 'A calmer next step when worry loops.',
    body: 'Get gentle, bounded guidance for common newborn questions. Not diagnosis.',
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
  if (completing) return ONBOARDING_COMPLETING_LABEL;
  return isFinalOnboardingPanel(index) ? ONBOARDING_FINAL_LABEL : ONBOARDING_NEXT_LABEL;
}

export function getNextOnboardingStep(index: number): OnboardingNextStep {
  return isFinalOnboardingPanel(index) ? 'complete' : Math.max(0, index) + 1;
}
