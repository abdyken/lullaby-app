/**
 * ProProvider — the React seam for "Pro" entitlement state.
 *
 * Phase 1 is a FOUNDATION SKELETON only. It resolves the Pro mode from the build
 * flags (via @/lib/proConfig) and exposes an entitlement (`isPro`) plus a paywall
 * open/close latch, so later phases can wire RevenueCat + the Supabase
 * `pro_entitlements` row behind the same shape without touching call sites.
 *
 * What it deliberately does NOT do yet (see docs/pro-implementation-plan.md §12):
 *   - no RevenueCat SDK, no purchases, no restore
 *   - no network / Supabase entitlement read
 *   - no real paywall UI
 * It also must not break anything: it never requires a signed-in user, never
 * touches Supabase, never clears data, and never blocks rendering. It does not
 * import AuthProvider — entitlement is baby-scoped in a later phase, but Phase 1
 * needs no identity, which keeps this a light, always-safe wrapper.
 *
 * `isPro` defaults to false. The only way it becomes true in Phase 1 is the
 * dev/QA override EXPO_PUBLIC_PRO_DEV_ENTITLEMENT, and only in a __DEV__ build
 * (resolveDevProEntitlement) — a shipped build always resolves free.
 *
 * No useEffect: all state uses lazy initializers, so there is no setState-in-
 * effect (the expo lint / React Compiler rule) and no render-time work.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { getProMode, isProEnabled, resolveDevProEntitlement, type ProMode } from '@/lib/proConfig';

type ProContextValue = {
  /** Whether REAL Pro is enabled for this build (the master flag). */
  isProEnabled: boolean;
  /** The resolved Pro mode: 'off' | 'preview' | 'enabled'. */
  proMode: ProMode;
  /** Whether the current household has a Pro entitlement. Phase 1: dev override only. */
  isPro: boolean;
  /** True while an entitlement resolve is in flight. Phase 1: always false (no I/O). */
  isLoading: boolean;
  /** The last entitlement-resolve error, if any. Phase 1: always null. */
  error: string | null;
  /** Re-resolve the entitlement. Phase 1: re-reads the dev override only (no network). */
  refreshProStatus: () => Promise<void>;
  /** Whether the (future) paywall is currently requested open. */
  isPaywallOpen: boolean;
  /** Request the paywall. Phase 1: flips a latch only — no paywall UI renders yet. */
  openPaywall: () => void;
  /** Dismiss the paywall latch. */
  closePaywall: () => void;
};

const ProContext = createContext<ProContextValue | null>(null);

export function ProProvider({ children }: { children: ReactNode }) {
  const proMode = useMemo<ProMode>(() => getProMode(), []);
  const proEnabled = useMemo<boolean>(() => isProEnabled(), []);

  // Entitlement. Lazy initializer (no effect): resolves the dev/QA override, which
  // is gated on __DEV__ so a production build is always free. Real resolution
  // (RevenueCat + Supabase `pro_entitlements`) lands in a later phase.
  const [isPro, setIsPro] = useState<boolean>(() => resolveDevProEntitlement(__DEV__));
  const [isLoading] = useState<boolean>(false);
  const [error] = useState<string | null>(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState<boolean>(false);

  const refreshProStatus = useCallback(async () => {
    // Phase 1: no RevenueCat, no Supabase entitlement read. Re-resolve the dev/QA
    // override only. setState inside an async callback is allowed (it is only the
    // synchronous setState-in-effect that the lint rule forbids).
    setIsPro(resolveDevProEntitlement(__DEV__));
  }, []);

  const openPaywall = useCallback(() => setIsPaywallOpen(true), []);
  const closePaywall = useCallback(() => setIsPaywallOpen(false), []);

  const value = useMemo<ProContextValue>(
    () => ({
      isProEnabled: proEnabled,
      proMode,
      isPro,
      isLoading,
      error,
      refreshProStatus,
      isPaywallOpen,
      openPaywall,
      closePaywall,
    }),
    [proEnabled, proMode, isPro, isLoading, error, refreshProStatus, isPaywallOpen, openPaywall, closePaywall],
  );

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

/**
 * Access the Pro entitlement state. Safe to call from any surface mounted under
 * ProProvider; throws only if the provider is missing (a wiring bug), so a
 * consumer never silently reads a stale default.
 */
export function usePro(): ProContextValue {
  const ctx = useContext(ProContext);
  if (ctx === null) {
    throw new Error('usePro must be used within a ProProvider');
  }
  return ctx;
}

export default ProProvider;
