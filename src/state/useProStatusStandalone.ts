/**
 * useProStatusStandalone — a READ-ONLY Pro entitlement read for surfaces that
 * live OUTSIDE the tabs ProProvider tree.
 *
 * /settings is a ROOT route (sibling of "(tabs)"), so it is NOT mounted under
 * ProProvider — calling usePro() there throws ("usePro must be used within a
 * ProProvider"). This hook lets /settings show the live Pro STATUS without that
 * provider: it reads the SAME sources ProProvider reads — the dev override plus
 * the already-configured RevenueCat CustomerInfo — but it NEVER configures the
 * SDK, opens a paywall, purchases, restores, or mutates entitlement in any way.
 * Purchase + restore stay solely in the tabs ProProvider paywall; the /settings
 * "upgrade" affordance routes back into the tabs tree.
 *
 * Safety: it only touches RevenueCat when isRevenueCatConfigured() is already
 * true. The tabs ProProvider configures the SDK singleton on mount, and you can
 * only reach /settings by navigating from Tonight (inside the tabs tree), so the
 * singleton is already configured by the time this runs. If it was never
 * configured (Pro off / unsupported platform / missing key), the hook degrades
 * to the dev override / free without calling into an unconfigured SDK.
 *
 * Effect safety: state is set only inside the async `.then` continuation, never
 * synchronously in the effect body (the lint / React-Compiler-safe pattern, same
 * as ProProvider).
 */
import { useEffect, useMemo, useState } from 'react';

import {
  getProMode,
  getRevenueCatEntitlementId,
  resolveDevProEntitlement,
  type ProMode,
} from '@/lib/proConfig';
import {
  getRevenueCatCustomerInfo,
  hasActiveRevenueCatEntitlement,
  isRevenueCatConfigured,
} from '@/lib/revenueCat';

export type ProStatus = {
  /** Live entitlement — true if the RevenueCat entitlement is active (or the dev override is on). */
  isPro: boolean;
  /** The build's Pro mode: 'off' | 'preview' | 'enabled'. */
  proMode: ProMode;
};

export function useProStatusStandalone(): ProStatus {
  const proMode = useMemo<ProMode>(() => getProMode(), []);
  // Seed from the dev/QA override so an override build reflects Pro before any
  // async read resolves.
  const [isPro, setIsPro] = useState<boolean>(() => resolveDevProEntitlement(__DEV__));

  useEffect(() => {
    let active = true;
    // Only READ when the tabs ProProvider has already configured the SDK. Never
    // configure/purchase/restore here — that logic lives only in ProProvider.
    if (proMode !== 'enabled' || !isRevenueCatConfigured()) return;
    void getRevenueCatCustomerInfo().then((info) => {
      if (!active) return;
      const entitled =
        hasActiveRevenueCatEntitlement(info, getRevenueCatEntitlementId()) ||
        resolveDevProEntitlement(__DEV__);
      setIsPro(entitled);
    });
    return () => {
      active = false;
    };
  }, [proMode]);

  return { isPro, proMode };
}

export default useProStatusStandalone;
