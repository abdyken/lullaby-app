/**
 * ThemeProvider — the single source of truth for the app's surface mode AND the
 * Telegram-style reveal that plays when it changes.
 *
 * The committed 'day' | 'night' mode is persisted to AsyncStorage so it survives
 * a restart. The reveal is owned here (not in a screen) so every layer that must
 * animate together — the screen content AND the floating tab bar, which live on
 * opposite sides of the navigator — can read ONE shared circle (origin, radius,
 * progress) and stay perfectly in sync. The global `mode` only flips once the
 * circle has fully covered the screen, so there's never a partial mismatch.
 *
 * Hydration is async, so `hydrated` gates the splash screen (see app/_layout):
 * we never paint a day frame and then snap to night on a cold start.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Dimensions, Easing } from 'react-native';

import type { SurfaceMode } from '@/theme';

const STORAGE_KEY = 'lullaby.surfaceMode';
const DEFAULT_MODE: SurfaceMode = 'day';
/** TEMP debug aid: flip to true to slow the reveal to 2s so the tab-bar frame can
 *  be inspected for any micro shift/brightness change. Keep false in production. */
const REVEAL_DEBUG_SLOW = false;
/** Long and unhurried so the circle is readable the whole way across the screen
 *  (Telegram-like). */
const REVEAL_DURATION = REVEAL_DEBUG_SLOW ? 2000 : 900;
/** Balanced curve (the classic "ease"): gentle start so the circle grows from a
 *  small point — never jumping to a large radius — an even, followable middle,
 *  and a soft landing (no snap at either end). NOT a strong ease-out, which
 *  expands most of the circle instantly and reads as a sharp switch. */
const REVEAL_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);
/** Tiny overshoot past the farthest corner — just enough to clear rounding and
 *  leave no sliver. Coverage itself is guaranteed by measuring the layer + using
 *  the larger of window/screen dimensions, so the padding stays small ON PURPOSE:
 *  a large overshoot is reached late on the ease-out tail and would eat the
 *  visible soft landing, making the wave feel shorter/faster — the opposite of
 *  what we want. */
const REVEAL_RADIUS_PADDING = 8;

export type RevealOrigin = { x: number; y: number };

type RevealState = {
  /** whether a reveal is currently playing */
  active: boolean;
  /** the theme being revealed (the target, not yet committed) — alias of `toMode` */
  mode: SurfaceMode;
  /** the committed theme the reveal started FROM (what the base layers must keep
   *  showing outside the circle, frozen for the whole transition) */
  fromMode: SurfaceMode;
  /** the incoming theme the reveal grows TO (what overlay layers must show inside
   *  the circle) */
  toMode: SurfaceMode;
  /** window-coordinate centre the circle grows from */
  origin: RevealOrigin;
  /** radius (px) that fully covers the screen + safe areas */
  maxRadius: number;
};

type ThemeContextValue = {
  /** the surface actually rendered right now (committed) */
  mode: SurfaceMode;
  /** false until the persisted choice has been read from storage */
  hydrated: boolean;
  /** true while the circular reveal is playing (guards double-taps) */
  isTransitioning: boolean;
  /** the shared reveal circle every layer animates against */
  reveal: RevealState;
  /** 0 → 1 progress driving the circle radius (shared, no re-renders) */
  revealProgress: Animated.Value;
  /** start the reveal from `origin`; commits the new mode when it completes */
  beginReveal: (origin: RevealOrigin) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const IDLE_REVEAL: RevealState = {
  active: false,
  mode: DEFAULT_MODE,
  fromMode: DEFAULT_MODE,
  toMode: DEFAULT_MODE,
  origin: { x: 0, y: 0 },
  maxRadius: 0,
};

function isSurfaceMode(value: unknown): value is SurfaceMode {
  return value === 'day' || value === 'night';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<SurfaceMode>(DEFAULT_MODE);
  const [hydrated, setHydrated] = useState(false);
  const [reveal, setReveal] = useState<RevealState>(IDLE_REVEAL);
  const [revealProgress] = useState(() => new Animated.Value(0));
  // Stable refs so `beginReveal` can be a stable callback yet read live values.
  const modeRef = useRef(mode);
  const activeRef = useRef(false);

  // Keep the ref in step with the committed mode (without writing it in render).
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (active && isSurfaceMode(stored)) {
          setModeState(stored);
          modeRef.current = stored;
        }
      })
      .catch(() => {
        /* no-op: fall back to the default mode if storage is unavailable */
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback((next: SurfaceMode) => {
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      /* no-op: the in-memory choice still applies for this session */
    });
  }, []);

  const beginReveal = useCallback(
    (origin: RevealOrigin) => {
      if (activeRef.current) return; // guard re-entry / double taps
      activeRef.current = true;

      // Snapshot the transition endpoints AT START so every layer reads explicit,
      // never-stale source/target themes — not `opposite(...)` of a target that
      // can flip after commit. `from` = the currently committed mode (frozen base),
      // `next` = the incoming mode (revealed overlay).
      const from: SurfaceMode = modeRef.current;
      const next: SurfaceMode = from === 'night' ? 'day' : 'night';
      // Use the larger of window/screen so the radius spans the full physical
      // screen (incl. Android system bars), then overshoot for safety.
      const win = Dimensions.get('window');
      const scr = Dimensions.get('screen');
      const w = Math.max(win.width, scr.width);
      const h = Math.max(win.height, scr.height);
      const maxRadius =
        Math.hypot(Math.max(origin.x, w - origin.x), Math.max(origin.y, h - origin.y)) +
        REVEAL_RADIUS_PADDING;

      revealProgress.setValue(0);
      setReveal({ active: true, mode: next, fromMode: from, toMode: next, origin, maxRadius });

      Animated.timing(revealProgress, {
        toValue: 1,
        duration: REVEAL_DURATION,
        easing: REVEAL_EASING,
        // SVG-radius + layout-positioned mask: native driver doesn't apply.
        useNativeDriver: false,
      }).start(() => {
        // The circle now fully covers the screen. Commit the new theme FIRST,
        // while the overlay is still mounted and covering — so the base layers
        // (screen content, tab bar pill/border/background, and the scene/root
        // backgrounds) repaint to the new theme hidden beneath the fully-grown
        // circle. Only on the NEXT frame, once that repaint has landed, do we
        // remove the overlay. Splitting these across a frame guarantees the base
        // is already on the new theme when the overlay disappears, so nothing —
        // the tab bar frame included — can snap on commit.
        setModeState(next);
        modeRef.current = next;
        persist(next);
        // Two frames, not one: frame 1 lets React commit + paint the new theme on
        // every base layer (tab-bar pill/border/background, screen, scene/root
        // backgrounds) beneath the fully-grown circle; only on frame 2 do we tear
        // the overlay down — so the base is GUARANTEED already on the new theme
        // when the overlay disappears. The extra frame is invisible (the circle
        // fully covers the screen), and it removes any one-frame commit snap.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setReveal((prev) => ({ ...prev, active: false }));
            activeRef.current = false;
          });
        });
      });
    },
    [persist, revealProgress],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      hydrated,
      isTransitioning: reveal.active,
      reveal,
      revealProgress,
      beginReveal,
    }),
    [mode, hydrated, reveal, revealProgress, beginReveal],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

export default ThemeProvider;
