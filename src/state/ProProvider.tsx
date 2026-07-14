/**
 * ProProvider — the React seam for "Pro" entitlement state.
 *
 * Phase 4 wires the RevenueCat purchase flow behind the same shape the earlier
 * phases used, so call sites (UpgradeCard / ProPreviewCard / PaywallSheet) did not
 * change their contract. It:
 *   - configures RevenueCat (via @/lib/revenueCat) ONLY when Pro is enabled and
 *     the platform has an API key. A signed-in session is NOT required: a guest
 *     (local-only, no account) configures anonymously and can purchase — the
 *     entitlement stays device-local until they sign in,
 *   - reads CustomerInfo → `isPro` (RevenueCat is the on-device source of truth
 *     this phase; the Supabase `pro_entitlements` household row is a later phase),
 *   - loads the configured offering into SDK-free `packages`,
 *   - exposes real `purchasePackage` / `restorePurchases`.
 *
 * It never imports the RevenueCat SDK directly (that lives only in
 * @/lib/revenueCat), never writes Supabase, never blocks rendering, never gates
 * logging, and degrades calmly when keys/products are missing.
 * The dev/QA override (EXPO_PUBLIC_PRO_DEV_ENTITLEMENT, __DEV__ only)
 * still unlocks `isPro` so Pro can be exercised before store products exist.
 *
 * Effects are lint/React-Compiler-safe: state is set only inside async callbacks,
 * never synchronously in the effect body.
 */
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
import { Alert, Platform } from 'react-native';

import {
  getProMode,
  getRevenueCatEntitlementId,
  hasRevenueCatConfig,
  isProEnabled,
  resolveDevProEntitlement,
  type ProMode,
  type RevenueCatPlatform,
} from '@/lib/proConfig';
import { useAnalytics } from '@/lib/useAnalytics';
import {
  configureRevenueCat,
  findRawPackage,
  getRevenueCatCustomerInfo,
  getRevenueCatOffering,
  hasActiveRevenueCatEntitlement,
  isRevenueCatConfigured,
  purchaseRevenueCatPackage,
  restoreRevenueCatPurchases,
  toProPackageViews,
  type ProPackageView,
  type RcOffering,
} from '@/lib/revenueCat';
import { useAuth } from '@/state/AuthProvider';

/**
 * The paywall's high-level state, so PaywallSheet can render calmly without
 * knowing anything about RevenueCat:
 *   unconfigured → no key / Pro off — "not configured in this build yet"
 *   loading      → configuring / fetching the offering
 *   ready        → packages available to purchase (signed-in OR guest/anonymous)
 *   unavailable  → configured, but no packages came back
 */
export type PaywallStatus = 'unconfigured' | 'loading' | 'ready' | 'unavailable';

/** The resolved Pro state from one RevenueCat sync (computed off-render). */
type ProSnapshot = {
  isPro: boolean;
  packages: ProPackageView[];
  paywallStatus: PaywallStatus;
  offering: RcOffering | null;
};

type ProContextValue = {
  isProEnabled: boolean;
  proMode: ProMode;
  isPro: boolean;
  isLoading: boolean;
  error: string | null;
  refreshProStatus: () => Promise<void>;
  isPaywallOpen: boolean;
  openPaywall: () => void;
  closePaywall: () => void;
  // Phase 4 — purchase surface.
  paywallStatus: PaywallStatus;
  packages: ProPackageView[];
  canPurchase: boolean;
  isPurchasing: boolean;
  isRestoring: boolean;
  purchaseError: string | null;
  restoreError: string | null;
  purchasePackage: (pkg: ProPackageView) => Promise<void>;
  restorePurchases: () => Promise<void>;
};

const ProContext = createContext<ProContextValue | null>(null);

export function ProProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const track = useAnalytics();
  const userId = session?.user.id ?? null;

  const proMode = useMemo<ProMode>(() => getProMode(), []);
  const proEnabled = useMemo<boolean>(() => isProEnabled(), []);
  const entitlementId = useMemo<string>(() => getRevenueCatEntitlementId(), []);

  const [isPro, setIsPro] = useState<boolean>(() => resolveDevProEntitlement(__DEV__));
  const [isLoading, setIsLoading] = useState<boolean>(() => getProMode() === 'enabled');
  const [error, setError] = useState<string | null>(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState<boolean>(false);
  const [paywallStatus, setPaywallStatus] = useState<PaywallStatus>(() =>
    getProMode() === 'enabled' ? 'loading' : 'unconfigured',
  );
  const [packages, setPackages] = useState<ProPackageView[]>([]);
  const [isPurchasing, setIsPurchasing] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Raw offering kept out of state (its SDK types stay internal); the UI only
  // sees `packages`.
  const offeringRef = useRef<RcOffering | null>(null);

  // Compute the next Pro state WITHOUT touching React state — callers apply it.
  // Keeping this pure of setState lets the effect apply it inside a `.then`
  // (an async callback), which is the lint/React-Compiler-safe pattern.
  const computeProSnapshot = useCallback(async (): Promise<ProSnapshot> => {
    const devPro = resolveDevProEntitlement(__DEV__);
    const platform: RevenueCatPlatform | null =
      Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : null;

    const notReady: PaywallStatus | null =
      proMode !== 'enabled' || !platform || !hasRevenueCatConfig(platform)
        ? 'unconfigured'
        : null;

    if (notReady) {
      return { isPro: devPro, packages: [], paywallStatus: notReady, offering: null };
    }

    // Signed-in AND guest both configure. `userId === null` configures RevenueCat
    // anonymously so a local/guest parent can purchase with no account; when the
    // identity later changes, the service maps it to logIn/logOut (sign-out
    // reverts to anonymous so entitlement never leaks between accounts).
    const ok = await configureRevenueCat({ userId });
    if (!ok) return { isPro: devPro, packages: [], paywallStatus: 'unconfigured', offering: null };

    const [customerInfo, offering] = await Promise.all([
      getRevenueCatCustomerInfo(),
      getRevenueCatOffering(),
    ]);
    const nextPackages = toProPackageViews(offering);
    const entitled = hasActiveRevenueCatEntitlement(customerInfo, entitlementId) || devPro;
    return {
      isPro: entitled,
      packages: nextPackages,
      paywallStatus: nextPackages.length > 0 ? 'ready' : 'unavailable',
      offering,
    };
  }, [proMode, userId, entitlementId]);

  const applySnapshot = useCallback((snap: ProSnapshot) => {
    offeringRef.current = snap.offering;
    setIsPro(snap.isPro);
    setPackages(snap.packages);
    setPaywallStatus(snap.paywallStatus);
    setError(null);
    setIsLoading(false);
  }, []);

  // Sync on mount and whenever the signed-in identity changes. All state is set
  // inside the async `.then` continuation — never synchronously in the effect.
  useEffect(() => {
    let active = true;
    void computeProSnapshot().then((snap) => {
      if (active) applySnapshot(snap);
    });
    return () => {
      active = false;
    };
  }, [computeProSnapshot, applySnapshot]);

  const refreshProStatus = useCallback(async () => {
    const snap = await computeProSnapshot();
    applySnapshot(snap);
  }, [computeProSnapshot, applySnapshot]);

  const purchasePackage = useCallback(
    async (pkg: ProPackageView) => {
      const raw = findRawPackage(offeringRef.current, pkg.id);
      if (!raw) {
        setPurchaseError('Something went wrong. Please try again.');
        return;
      }
      setIsPurchasing(true);
      setPurchaseError(null);
      track('purchase_started', { surface: 'paywall', packageType: pkg.packageType });
      const outcome = await purchaseRevenueCatPackage(raw);
      // TEMP on-screen diagnostics (no Mac console needed) — surface the raw
      // purchase outcome so we can read it from the device. Remove before final
      // production submit.
      if (outcome.ok) {
        const entitled = hasActiveRevenueCatEntitlement(outcome.customerInfo, entitlementId);
        Alert.alert(
          '[DEBUG purchase]',
          [
            'ok: true',
            'hasActiveEntitlement: ' + String(entitled),
            'entitlementId: ' + getRevenueCatEntitlementId(),
          ].join('\n'),
        );
        // TEMP diagnostics (unconditional so it shows in TestFlight device console —
        // remove before final production submit). Resolved isPro decision + whether
        // the configured entitlement id came back active.
        console.log('[RC] ProProvider purchase result:', {
          entitlementId: getRevenueCatEntitlementId(),
          hasActiveEntitlement: entitled,
          isPro: entitled,
        });
        if (entitled) {
          setIsPro(true);
          track('purchase_completed', {
            surface: 'paywall',
            packageType: pkg.packageType,
            entitlement: entitlementId,
          });
        } else {
          setPurchaseError('That purchase did not unlock Pro. Try Restore purchase.');
          track('purchase_failed', { surface: 'paywall', errorCode: 'no_entitlement', cancelled: false });
        }
      } else {
        // TEMP on-screen diagnostics — surface the error/timeout outcome (code,
        // message, and raw userInfo/underlyingErrorMessage) so it is readable
        // from the device. Remove before final production submit.
        Alert.alert(
          '[DEBUG purchase]',
          [
            'ok: false',
            'code: ' + outcome.error.code,
            'message: ' + outcome.error.message,
            'debug: ' + (outcome.debug ?? 'n/a'),
          ].join('\n'),
        );
        // A user cancel is calm — no scary error line, just the coarse event.
        if (!outcome.error.cancelled) setPurchaseError(outcome.error.message);
        track('purchase_failed', {
          surface: 'paywall',
          errorCode: outcome.error.code,
          cancelled: outcome.error.cancelled,
        });
      }
      setIsPurchasing(false);
    },
    [track, entitlementId],
  );

  const restorePurchases = useCallback(async () => {
    setIsRestoring(true);
    setRestoreError(null);
    track('restore_started', { surface: 'paywall' });
    // Apple-review safety: Restore is reachable from every paywall state and must
    // never crash when RevenueCat is disabled/unconfigured. If the SDK was never
    // configured (missing key, unsupported platform, native module absent)
    // degrade to a calm message instead of calling into an unconfigured SDK.
    if (!isRevenueCatConfigured()) {
      setRestoreError('Subscriptions are not available in this version yet.');
      track('restore_failed', { surface: 'paywall', errorCode: 'not_configured', cancelled: false });
      setIsRestoring(false);
      return;
    }
    const outcome = await restoreRevenueCatPurchases();
    if (outcome.ok) {
      const entitled = hasActiveRevenueCatEntitlement(outcome.customerInfo, entitlementId);
      if (entitled) {
        setIsPro(true);
        track('restore_completed', { surface: 'paywall', entitlement: entitlementId });
      } else {
        setRestoreError('No active subscription found.');
        track('restore_failed', { surface: 'paywall', errorCode: 'no_entitlement', cancelled: false });
      }
    } else {
      setRestoreError(outcome.error.message);
      track('restore_failed', {
        surface: 'paywall',
        errorCode: outcome.error.code,
        cancelled: outcome.error.cancelled,
      });
    }
    setIsRestoring(false);
  }, [track, entitlementId]);

  const openPaywall = useCallback(() => setIsPaywallOpen(true), []);
  const closePaywall = useCallback(() => setIsPaywallOpen(false), []);

  // A guest (userId === null) can purchase too — anonymous RevenueCat identity.
  const canPurchase = proMode === 'enabled' && paywallStatus === 'ready' && !isPurchasing;

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
      paywallStatus,
      packages,
      canPurchase,
      isPurchasing,
      isRestoring,
      purchaseError,
      restoreError,
      purchasePackage,
      restorePurchases,
    }),
    [
      proEnabled,
      proMode,
      isPro,
      isLoading,
      error,
      refreshProStatus,
      isPaywallOpen,
      openPaywall,
      closePaywall,
      paywallStatus,
      packages,
      canPurchase,
      isPurchasing,
      isRestoring,
      purchaseError,
      restoreError,
      purchasePackage,
      restorePurchases,
    ],
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
