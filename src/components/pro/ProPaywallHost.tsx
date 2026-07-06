/**
 * ProPaywallHost — mounts the PaywallSheet in the app tree and drives it from the
 * shared Pro state. It reads usePro().isPaywallOpen and renders PaywallSheet only
 * while open, closing it via closePaywall(). This keeps a single paywall instance
 * that any surface (UpgradeCard, ProPreviewCard, …) can open through
 * usePro().openPaywall(), instead of each card owning its own modal.
 *
 * It also consumes pending paywall intents (paywallIntent.ts) from surfaces that
 * live OUTSIDE the tabs ProProvider — SettingsProCard on the root /settings route
 * records one and pops back; the pathname change re-runs the effect here, which
 * opens the same shared paywall. openPaywall is applied via setTimeout, never
 * synchronously in the effect body (the lint / React-Compiler-safe pattern).
 *
 * Renders nothing (no layout) until the paywall is requested. Must sit under
 * ProProvider; place it once, high in the tree.
 */
import { usePathname } from 'expo-router';
import { useEffect } from 'react';

import { usePro } from '@/state/ProProvider';

import { PaywallSheet } from './PaywallSheet';
import { consumePaywallRequest } from './paywallIntent';

export function ProPaywallHost() {
  const { isPaywallOpen, openPaywall, closePaywall } = usePro();
  const pathname = usePathname();

  useEffect(() => {
    if (!consumePaywallRequest()) return;
    const timer = setTimeout(openPaywall, 0);
    return () => clearTimeout(timer);
  }, [pathname, openPaywall]);

  if (!isPaywallOpen) return null;

  return <PaywallSheet onClose={closePaywall} />;
}

export default ProPaywallHost;
