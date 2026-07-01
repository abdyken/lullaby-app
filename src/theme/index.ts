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
  // pump — warm sunny yellow (the mockup's `--growth`); used by the Pump quick action
  pump: '#FFB12E',
  pumpTint: '#FFF1D6',

  // alert — Reassure's triage tone (the reassure demo's `--alert`). Serious but
  // never a blaring alarm red; identical in day and night (safety is not themed).
  alert: '#E0574B',
  alert2: '#E97367',
  alertTint: '#FBE7E4',

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

/** Per-mode pill colours for the floating tab bar. Day mirrors the tokens above;
 *  night is a calm dark pill so the bar follows the theme instead of staying a
 *  bright cream pill on the navy night surface.
 *
 *  OPAQUE ON PURPOSE. The mockup tokens are translucent (surface 0.94, border
 *  0.7/0.12 white). The base pill (frozen, current theme) and the reveal-overlay
 *  pill (incoming theme) are stacked exactly during the transition, so any
 *  translucency lets the layer behind bleed through differently in each — a few
 *  percent of brightness / a faint white outline that shifts as the circle
 *  passes. These are the SAME tokens pre-composited over the screen background
 *  each pill floats on (cream in day, #191826 at night), accounting for the
 *  border ring sitting under the surface fill. Result: both pills paint identical
 *  pixels regardless of what's behind them, so the tab bar is dead-static through
 *  the reveal — only the circular colour change is visible (matches the
 *  Feed/Sleep/Diaper tiles, which are opaque too). Negligibly different from the
 *  old frosted look when the pill sits over the background (the common case). */
export const tabbarSurfaces: Record<'day' | 'night', {
  surface: string;
  border: string;
  inactiveColor: string;
}> = {
  day: {
    // rgba(255,255,255,0.94) over the border-over-cream stack ≈ pure white
    surface: '#FFFFFF',
    // rgba(255,255,255,0.7) over cream (#FBF4EF)
    border: '#FEFCFA',
    inactiveColor: tabbar.inactiveColor,
  },
  night: {
    // rgba(37,35,58,0.94) over the border-over-#191826 stack
    surface: '#262438',
    // rgba(255,255,255,0.12) over the night bg (#191826)
    border: '#353440',
    inactiveColor: '#8C87A8',
  },
};

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

/* ------------------------------------------------------------------ *
 * Surface mode (P0.5) — automatic low-glare night surface for Tonight.
 *
 * Day keeps the sacred cream/white surfaces verbatim (the rest of the app is
 * unaffected). Night is a calm deep-navy surface — low-glare and premium, never
 * pure black, never a purple-blue gradient. It echoes the mockup's navy night
 * sky (#3B3A74…) but darker, so a 3am screen doesn't blind a tired parent.
 * ------------------------------------------------------------------ */

/** What the user picked. 'auto' resolves against the local clock. */
export type SurfacePreference = 'auto' | 'day' | 'night';
/** The resolved surface actually rendered. */
export type SurfaceMode = 'day' | 'night';

export type SurfacePalette = {
  /** screen background */
  bg: string;
  /** card / raised surface */
  card: string;
  /** subtle card border/divider (transparent in day — separation via shadow) */
  border: string;
  /** primary text */
  ink: string;
  /** secondary text */
  inkSoft: string;
  /** tertiary text / timestamps */
  inkFaint: string;
  /** hairline / timeline connector */
  line: string;
};

/** Day mirrors the existing tokens exactly; night is the low-glare navy set. */
export const surfaces: Record<SurfaceMode, SurfacePalette> = {
  day: {
    bg: colors.cream,
    card: colors.surface,
    border: 'transparent',
    ink: colors.ink,
    inkSoft: colors.inkSoft,
    inkFaint: colors.inkFaint,
    line: colors.line,
  },
  night: {
    bg: '#191826',
    card: '#23223A',
    border: 'rgba(255,255,255,0.07)',
    ink: '#F0ECFB',
    inkSoft: '#ADA8C7',
    inkFaint: '#736E90',
    line: 'rgba(255,255,255,0.09)',
  },
};

/** Local hour (0–23) at/after which `auto` switches to night. */
export const NIGHT_START_HOUR = 20;
/** Local hour (0–23) at which `auto` switches back to day. */
export const DAY_START_HOUR = 7;

/**
 * Resolve a surface preference + the local hour to the surface to render.
 * Pure: no Date access inside, so it's deterministic and unit-testable. `auto`
 * is night from NIGHT_START_HOUR (incl.) to DAY_START_HOUR (excl.).
 */
export function resolveSurfaceMode(preference: SurfacePreference, hour: number): SurfaceMode {
  if (preference === 'day') return 'day';
  if (preference === 'night') return 'night';
  return hour >= NIGHT_START_HOUR || hour < DAY_START_HOUR ? 'night' : 'day';
}

export const theme = {
  colors,
  sky,
  surfaces,
  radii,
  shadows,
  fonts,
  tabbar,
  getAccentForState,
  resolveSurfaceMode,
} as const;

export default theme;
