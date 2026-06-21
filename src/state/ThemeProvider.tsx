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
import { Animated, Easing } from 'react-native';
import * as SystemUI from 'expo-system-ui';

import { surfaces, type SurfaceMode } from '@/theme';

const STORAGE_KEY = 'lullaby.surfaceMode';
const DEFAULT_MODE: SurfaceMode = 'day';
/** Cross-fade length. Short enough to feel responsive, long enough to read as an
 *  intentional theme morph rather than a hard cut. */
const REVEAL_DURATION = 340;
/** Balanced "ease" (gentle in, soft landing) so the recolour eases on and off
 *  rather than snapping at either end. */
const REVEAL_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

export type RevealOrigin = { x: number; y: number };

type RevealState = {
  /** whether a reveal is currently playing */
  active: boolean;
  /** the committed theme the reveal started FROM — what the base layers (the real
   *  tab bar, the screen underneath) keep showing OUTSIDE the circle, frozen for
   *  the whole transition. The base bar reads this while `active`. */
  fromMode: SurfaceMode;
  /** the incoming theme the reveal grows TO — what the overlay layers (the reveal
   *  tab bar copy, the screen reveal copy, the toggle icon) show INSIDE the
   *  circle, and what every layer commits to when the reveal completes. */
  toMode: SurfaceMode;
  /** window-coordinate centre the circle grows from */
  origin: RevealOrigin;
  /** radius (px) at progress = 1 — fully covers the screen + safe areas. The
   *  shared `revealProgress` (0→1) is interpolated against this to drive the
   *  circle's radius; it lives on the context, not here, so it never re-renders. */
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

  // Paint the native root view (the layer BEHIND the React tree, which shows
  // through the transparent edge-to-edge system bars / safe-area strip) the
  // committed surface colour. Without this the bottom gesture/home-indicator
  // region keeps the OS default (light) when the app goes dark — the "white
  // strip at the bottom" bug. Committed `mode` only flips at the end of a
  // transition (under the opaque cross-fade), so this stays in sync with the UI.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(surfaces[mode].bg).catch(() => {
      /* no-op: not fatal if the platform can't set the root background */
    });
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

      revealProgress.setValue(0);
      // The cross-fade ignores `origin`/`maxRadius`; they're retained on the state
      // shape so existing consumers compile unchanged.
      setReveal({ active: true, fromMode: from, toMode: next, origin, maxRadius: 0 });

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
