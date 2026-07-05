/**
 * External app links — the privacy policy, terms, and support contact behind
 * the Settings screen's link rows (Apple review expects all three reachable
 * in-app).
 *
 * Each destination is build-time configurable via an optional EXPO_PUBLIC_*
 * env var and falls back to a live hosted default when the var is unset or
 * blank — so the rows always have a real, reachable destination and never
 * crash on a missing env value. These are public URLs inlined into the JS
 * bundle at build time; no secret may ever live here. The real hosted URLs
 * must be in place (or configured here) before an App Store submission — see
 * docs/plans/release-env.md.
 *
 * Pure, dependency-free leaf (reads only process.env, no react-native), so
 * the Node smoke runner covers it directly (§SL in
 * scripts/check-local-interactions.ts). Mirrors the env-override pattern of
 * resolveAppInstallUrl in src/components/auth/inviteShareMessage.ts.
 */

/**
 * Live fallback destinations — the real hosted landing pages, used only when
 * the EXPO_PUBLIC_* override is unset/blank. The old lullaby.app defaults
 * pointed at a parked/for-sale domain (dead legal links → guaranteed App Store
 * rejection), so the safety net now points at the real published pages. The
 * env var stays the primary source; these are just the never-dead fallback.
 * (The support email fallback is a real monitored mailbox, so a build with the
 * EXPO_PUBLIC_SUPPORT_EMAIL env var unset still has a reachable contact.)
 */
export const DEFAULT_PRIVACY_POLICY_URL = 'https://lullaby-landing.vercel.app/privacy';
export const DEFAULT_TERMS_URL = 'https://lullaby-landing.vercel.app/terms';
export const DEFAULT_SUPPORT_EMAIL = '240103091@sdu.edu.kz';

/** Trimmed override when the var carries a real value, else the fallback. */
function resolveConfigured(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : fallback;
}

/** The privacy policy URL for this build (env override or placeholder). */
export function resolvePrivacyPolicyUrl(
  raw: string | undefined = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
): string {
  return resolveConfigured(raw, DEFAULT_PRIVACY_POLICY_URL);
}

/** The terms-of-use URL for this build (env override or placeholder). */
export function resolveTermsUrl(
  raw: string | undefined = process.env.EXPO_PUBLIC_TERMS_URL,
): string {
  return resolveConfigured(raw, DEFAULT_TERMS_URL);
}

/** The support/feedback email address for this build (env override or placeholder). */
export function resolveSupportEmail(
  raw: string | undefined = process.env.EXPO_PUBLIC_SUPPORT_EMAIL,
): string {
  return resolveConfigured(raw, DEFAULT_SUPPORT_EMAIL);
}

/**
 * The mailto: URL behind the Support row. Carries only the app version in the
 * subject (helps triage) — never a log, an id, or anything from the device.
 */
export function buildSupportMailtoUrl({
  email,
  appVersion,
}: {
  email: string;
  appVersion: string;
}): string {
  const subject = encodeURIComponent(`Lullaby feedback (v${appVersion})`);
  return `mailto:${email}?subject=${subject}`;
}
