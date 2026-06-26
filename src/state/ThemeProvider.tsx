/**
 * ThemeProvider — the single source of truth for the app's committed surface mode.
 *
 * The selected 'day' | 'night' mode is persisted to AsyncStorage and hydrated
 * before the first app paint so a saved night surface never flashes day. Theme
 * changes are committed once expo-circular-reveal has captured the current native
 * window; the native screenshot overlay keeps the old theme visible while the real
 * React tree switches underneath.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as SystemUI from 'expo-system-ui';

import { cancelCircularReveal, prepareCircularReveal, startCircularReveal } from '@/lib/circularReveal';
import { surfaces, type SurfaceMode } from '@/theme';

const STORAGE_KEY = 'lullaby.surfaceMode';
const DEFAULT_MODE: SurfaceMode = 'day';
const DEFAULT_REVEAL_DURATION_MS = 600;

type ThemeContextValue = {
  /** the surface actually rendered right now (committed) */
  mode: SurfaceMode;
  /** false until the persisted choice has been read from storage */
  hydrated: boolean;
  /** true while a native reveal is running (guards double-taps) */
  isTransitioning: boolean;
  /** capture the current window at this point, then commit the opposite mode */
  toggleThemeFromPoint: (pageX?: number, pageY?: number) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isSurfaceMode(value: unknown): value is SurfaceMode {
  return value === 'day' || value === 'night';
}

function revealDurationMs(): number {
  const raw = process.env.EXPO_PUBLIC_THEME_REVEAL_DURATION_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REVEAL_DURATION_MS;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function doubleRequestAnimationFrame(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

function devLogThemeReveal(message: string, details?: Record<string, unknown>): void {
  if (__DEV__) {
    if (details) {
      console.log(`[theme-reveal] ${message}`, details);
    } else {
      console.log(`[theme-reveal] ${message}`);
    }
  }
}

function devWarnThemeReveal(message: string, error?: unknown): void {
  if (__DEV__) {
    if (error) {
      console.warn(`[theme-reveal] ${message}`, error);
    } else {
      console.warn(`[theme-reveal] ${message}`);
    }
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<SurfaceMode>(DEFAULT_MODE);
  const [hydrated, setHydrated] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const modeRef = useRef(mode);
  const transitioningRef = useRef(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Paint the native root view behind transparent system bars / safe-area strips.
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

  const persist = useCallback(async (next: SurfaceMode) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* no-op: the in-memory choice still applies for this session */
    }
  }, []);

  const toggleThemeFromPoint = useCallback(
    async (pageX?: number, pageY?: number) => {
      if (transitioningRef.current) return;

      transitioningRef.current = true;
      setIsTransitioning(true);

      const from: SurfaceMode = modeRef.current;
      const next: SurfaceMode = from === 'night' ? 'day' : 'night';
      const durationMs = revealDurationMs();
      let nativeRevealPrepared = false;

      try {
        if (
          typeof pageX === 'number' &&
          typeof pageY === 'number' &&
          Number.isFinite(pageX) &&
          Number.isFinite(pageY)
        ) {
          await prepareCircularReveal(pageX, pageY);
          nativeRevealPrepared = true;
        }
      } catch (error) {
        nativeRevealPrepared = false;
        devWarnThemeReveal('prepare failed; falling back to instant theme switch', error);
        await cancelCircularReveal().catch(() => {
          /* no-op: prepare fallback may fail before a native overlay exists */
        });
      }

      setModeState(next);
      modeRef.current = next;
      devLogThemeReveal('React theme committed', { from, to: next });
      void persist(next);

      try {
        if (nativeRevealPrepared) {
          await doubleRequestAnimationFrame();
          await startCircularReveal(durationMs);
        } else {
          await nextFrame();
        }
      } catch (error) {
        devWarnThemeReveal('start failed; cleaning up circular reveal', error);
        await cancelCircularReveal().catch(() => {
          /* no-op: transition cleanup is best effort */
        });
      } finally {
        transitioningRef.current = false;
        setIsTransitioning(false);
      }
    },
    [persist],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      hydrated,
      isTransitioning,
      toggleThemeFromPoint,
    }),
    [mode, hydrated, isTransitioning, toggleThemeFromPoint],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

export default ThemeProvider;
