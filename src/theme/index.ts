/**
 * Lullaby theme module — the single source of design truth for the native app.
 *
 * Tokens are extracted verbatim from `.reference/lullaby-phone-mockup.html`
 * (the `.lb-phone` custom properties) and §6 of MOBILE_APP_BLUEPRINT.md.
 * Keep this in sync with `tailwind.config.js` — Tailwind handles className
 * utilities, this module serves runtime values (StyleSheet, SVG, gradients,
 * shadows, animated styles) where a class name can't reach.
 *
 * Rules carried over from the mockup:
 *  - Cream background is sacred — never a white or dark app background.
 *  - One accent at a time, set by the active state (see getAccentForState).
 *  - Shadows are warm/brown-tinted, never neutral grey.
 *  - Everything rounded; separation via shadow + cream, not hard borders.
 */

export const colors = {
  // text
  ink: '#2E2A40',
  inkSoft: '#736E86',
  inkFaint: '#A8A2B8',

  // surfaces — cream stays the app background in every state
  cream: '#FBF4EF',
  surface: '#FFFFFF',
  surfaceSoft: '#FBF6F2',
  line: '#F0E8E2',

  // accents + tints (driven per-state)
  feed: '#FF7A3D',
  feed2: '#FF9E5E',
  feedTint: '#FFEDE0',
  sleep: '#5560C6',
  sleep2: '#7C84DA',
  sleepTint: '#E9EBFB',
  diaper: '#23B79E',
  diaperTint: '#DDF5EF',

  // caregivers (mom/dad palette from the mockup)
  mom: '#FF9E5E',
  dad: '#5560C6',

  white: '#FFFFFF',
} as const;

/** Sky gradients for the orb hero — used later by OrbHero. Kept here so the
 *  whole palette lives in one place. */
export const sky = {
  day: ['#FFE0B8', '#FFC9B0', '#F3D3EC', '#FBEFF6'],
  night: ['#3B3A74', '#4A4D9C', '#6E6FC2'],
  dusk: ['#EDE7FB', '#E7E9FC', '#DCF4EE'],
} as const;

export const radii = {
  large: 34,
  medium: 24,
  small: 16,
  pill: 999,
} as const;

/** Warm, brown-tinted shadows matching the mockup (`--lb-shadow-*`).
 *  Spread for React Native style objects; elevation added for Android. */
export const shadows = {
  // hero / sky: 0 22px 50px -18px rgba(60,40,30,.30)
  soft: {
    shadowColor: 'rgb(60,40,30)',
    shadowOpacity: 0.3,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  // cards: 0 10px 26px -14px rgba(60,40,30,.22)
  card: {
    shadowColor: 'rgb(60,40,30)',
    shadowOpacity: 0.22,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  // floating tabbar: 0 16px 34px -14px rgba(60,40,30,.34)
  tabbar: {
    shadowColor: 'rgb(60,40,30)',
    shadowOpacity: 0.34,
    shadowRadius: 17,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
} as const;

export const fonts = {
  display: 'Fredoka_600SemiBold',
  displayMedium: 'Fredoka_500Medium',
  body: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_800ExtraBold',
} as const;

/** Visual tokens for the floating bottom tabbar (from `.lb-tabbar`).
 *  Tuned compact on real hardware (OnePlus Nord 2T): a small, clearly floating
 *  pill rather than an edge-to-edge bar. */
export const tabbar = {
  height: 58,
  /** clamp: never wider than 304, never narrower than 268, ~72px side breathing */
  minWidth: 268,
  maxWidth: 304,
  sideAllowance: 72,
  marginBottom: 18,
  paddingX: 8,
  paddingY: 6,
  gap: 2,
  radius: 24,
  /** the full-third tap target inside each tab */
  tabRadius: 18,
  tabHeight: 46,
  /** the small tinted content group that holds the icon + label */
  chipRadius: 16,
  chipMinWidth: 68,
  chipHeight: 42,
  chipGap: 2,
  iconSize: 20,
  labelSize: 9.5,
  surface: 'rgba(255,255,255,0.94)',
  border: 'rgba(255,255,255,0.7)',
  inactiveColor: colors.inkFaint,
  ...shadows.tabbar,
} as const;

/** The live states the Tonight screen moves through during a night.
 *  These are NOT a carousel (that's the landing page) — they are real states. */
export type AccentState = 'sleep' | 'feed' | 'diaper' | 'partner';

export type Accent = {
  /** solid accent color */
  color: string;
  /** soft tinted surface that pairs with the accent */
  tint: string;
};

const ACCENTS: Record<AccentState, Accent> = {
  sleep: { color: colors.sleep, tint: colors.sleepTint },
  feed: { color: colors.feed, tint: colors.feedTint },
  diaper: { color: colors.diaper, tint: colors.diaperTint },
  // partner reuses the sleep accent in the mockup ([data-state="partner"])
  partner: { color: colors.sleep, tint: colors.sleepTint },
};

/**
 * Returns the accent color + tint for the active state. The orb, primary
 * button, active quick-log tile, and active tab all read from this so there's
 * exactly one accent on screen at a time. Falls back to sleep (the calm
 * default the mockup boots into) for any unknown value.
 */
export function getAccentForState(state: AccentState): Accent {
  return ACCENTS[state] ?? ACCENTS.sleep;
}

export const theme = {
  colors,
  sky,
  radii,
  shadows,
  fonts,
  tabbar,
  getAccentForState,
} as const;

export default theme;
