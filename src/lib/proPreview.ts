/**
 * Pro-preview feature flag.
 *
 * Gates the NON-PAID "Lullaby Pro" preview surfaces (UpgradeCard, ProPreviewCard)
 * so the Pro messaging can be disabled per cohort without a logic change. There
 * is never any payment, paywall, or RevenueCat behind this — it only controls
 * whether the (purely presentational) preview is shown.
 *
 * Off by default: only `EXPO_PUBLIC_PRO_PREVIEW_ENABLED="true"` (or "1") turns it
 * on. Mirrors the build-time env-flag pattern in
 * src/features/logging/config/featureFlags.ts.
 */
export function isProPreviewEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_PRO_PREVIEW_ENABLED;
  return raw === 'true' || raw === '1';
}
