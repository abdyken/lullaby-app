/**
 * ProPaywallHost — mounts the PaywallSheet in the app tree and drives it from the
 * shared Pro state. It reads usePro().isPaywallOpen and renders PaywallSheet only
 * while open, closing it via closePaywall(). This keeps a single paywall instance
 * that any surface (UpgradeCard, ProPreviewCard, …) can open through
 * usePro().openPaywall(), instead of each card owning its own modal.
 *
 * Renders nothing (no layout) until the paywall is requested. Must sit under
 * ProProvider; place it once, high in the tree.
 */
import { usePro } from '@/state/ProProvider';

import { PaywallSheet } from './PaywallSheet';

export function ProPaywallHost() {
  const { isPaywallOpen, closePaywall } = usePro();

  if (!isPaywallOpen) return null;

  return <PaywallSheet onClose={closePaywall} />;
}

export default ProPaywallHost;
