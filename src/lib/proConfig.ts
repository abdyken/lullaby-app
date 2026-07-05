/**
 * Pro configuration — the single entry point for "is Pro on, and in which mode?".
 *
 * Two independent build-time env flags drive every Pro surface. Both parse the
 * same "true"/"1" way as src/lib/proPreview.ts and
 * src/features/logging/config/featureFlags.ts, and both are OFF unless explicitly
 * set:
 *
 *   EXPO_PUBLIC_PRO_ENABLED          → REAL Pro (RevenueCat paywall + live gates).
 *                                      Wired via RevenueCat (Phase 4): purchase,
 *                                      restore, and the 'pro' entitlement on the
 *                                      'default' offering resolve behind it.
 *   EXPO_PUBLIC_PRO_PREVIEW_ENABLED  → the NON-PAID fake-door preview (interest
 *                                      analytics only). Owned by proPreview.ts and
 *                                      re-exported here so there is one flag parser.
 *
 * Precedence: real Pro supersedes the preview. If PRO_ENABLED is on the mode is
 * "enabled" regardless of the preview flag, so we never show a fake-door and a
 * real paywall at once (see docs/plans/pro-implementation-plan.md §11).
 *
 * Pure, dependency-light leaf: it reads only process.env (and re-exports the
 * preview flag). It must NOT import RevenueCat, Supabase, auth, or React — so it
 * is safe to import from anywhere, including the Node smoke test.
 */
import { isProPreviewEnabled } from '@/lib/proPreview';

export { isProPreviewEnabled };

/** The resolved Pro mode for the current build. */
export type ProMode = 'off' | 'preview' | 'enabled';

/**
 * Whether REAL Pro (paywall + live feature gates) is enabled for this build.
 * Off by default; only "true"/"1" turns it on. When on, RevenueCat purchase /
 * restore and the paywall are wired behind it (Phase 4).
 */
export function isProEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_PRO_ENABLED;
  return raw === 'true' || raw === '1';
}

/**
 * Resolve the single Pro mode from the two flags, applying the precedence rule:
 * real Pro ("enabled") beats the fake-door ("preview"); "off" when neither is set.
 */
export function getProMode(): ProMode {
  if (isProEnabled()) return 'enabled';
  if (isProPreviewEnabled()) return 'preview';
  return 'off';
}

/**
 * Dev/QA-only entitlement override. When EXPO_PUBLIC_PRO_DEV_ENTITLEMENT is
 * "true"/"1" it lets a dev / dev-client build resolve `isPro = true` WITHOUT any
 * purchase, so Pro-gated surfaces can be exercised before RevenueCat exists.
 *
 * Never a production entitlement — ProProvider additionally gates it on __DEV__
 * via resolveDevProEntitlement, so a shipped build always ignores it.
 */
export function isProDevEntitlementEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_PRO_DEV_ENTITLEMENT;
  return raw === 'true' || raw === '1';
}

/**
 * The effective dev entitlement: true only when running in development AND the
 * override flag is set. Pure (takes `isDev` explicitly) so it is unit-testable;
 * ProProvider passes React Native's __DEV__. In production (isDev=false) this is
 * ALWAYS false — the override can never grant Pro to a shipped build.
 */
export function resolveDevProEntitlement(isDev: boolean): boolean {
  return isDev && isProDevEntitlementEnabled();
}

/**
 * RevenueCat platform we can configure for. Web / other platforms have no store,
 * so the service treats them as "no RevenueCat config" and degrades to free.
 */
export type RevenueCatPlatform = 'ios' | 'android';

function trimmedEnv(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value && value.length > 0 ? value : null;
}

/**
 * The public RevenueCat SDK key for a platform, or null if unset. iOS reads
 * EXPO_PUBLIC_REVENUECAT_IOS_API_KEY; Android reads the ANDROID key. Never a
 * hardcoded key — a missing key simply means "not configured" (no crash).
 */
export function getRevenueCatApiKey(platform: RevenueCatPlatform): string | null {
  return trimmedEnv(
    platform === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  );
}

/** The RevenueCat entitlement id that unlocks Pro. Defaults to 'pro'. */
export function getRevenueCatEntitlementId(): string {
  return trimmedEnv(process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID) ?? 'pro';
}

/** The RevenueCat offering id to present. Defaults to 'default'. */
export function getRevenueCatOfferingId(): string {
  return trimmedEnv(process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID) ?? 'default';
}

/** Whether this platform has a RevenueCat key configured (purchase is possible). */
export function hasRevenueCatConfig(platform: RevenueCatPlatform): boolean {
  return getRevenueCatApiKey(platform) !== null;
}
