export type OnboardingVisual = 'night' | 'quick-log' | 'recap';

export type OnboardingPanel = {
  id: 'track' | 'tap' | 'clear';
  eyebrow: string;
  title: string;
  body: string;
  visual: OnboardingVisual;
};

export const ONBOARDING_PANELS: OnboardingPanel[] = [
  {
    id: 'track',
    eyebrow: 'Track the night',
    title: 'Keep the whole night in one soft thread.',
    body: 'Feeds, sleep, diapers, and handoff notes stay together when 3am feels blurry.',
    visual: 'night',
  },
  {
    id: 'tap',
    eyebrow: 'Log in one tap',
    title: 'Big sleepy buttons, no tiny forms.',
    body: 'Start a feed, sleep, diaper, or pump from thumb reach, then get back to bed.',
    visual: 'quick-log',
  },
  {
    id: 'clear',
    eyebrow: 'Wake up clear',
    title: 'Morning starts with context, not guessing.',
    body: 'See what happened overnight and open calm reassurance when worry starts looping.',
    visual: 'recap',
  },
];
