/**
 * Invite share copy — the beta-tester message behind InviteCaregiverSheet's
 * "Share code" action.
 *
 * Testers don't have the app from the App Store / Google Play yet, so the share
 * text must point them at a beta install link when one is configured. That link
 * is supplied at build time via the optional EXPO_PUBLIC_APP_INSTALL_URL env var
 * — never hardcoded here (no App Store / Play Store URL lives in the app). When
 * the var is absent we fall back to "install from the link I sent you" copy.
 *
 * Pure string-building, no react-native import, so it is unit-tested directly by
 * scripts/check-local-interactions.ts. The share text intentionally carries only
 * the human-readable invite code — never a Supabase URL, anon key, or any secret.
 */

/**
 * Read + normalize the optional beta install URL. An unset var or a
 * blank/whitespace-only value means "no link configured" (returns null).
 * Mirrors the build-time env-flag pattern in src/lib/proPreview.ts.
 */
export function resolveAppInstallUrl(
  raw: string | undefined = process.env.EXPO_PUBLIC_APP_INSTALL_URL,
): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Build the invite share message. With a beta install link, numbered
 * install → join → enter-code steps; without one, a calmer "install from the
 * link I sent you" fallback. Both end with the 7-day expiry reminder.
 */
export function buildInviteShareMessage({
  code,
  installUrl,
}: {
  code: string;
  installUrl?: string | null;
}): string {
  const link = installUrl?.trim() ? installUrl.trim() : null;

  if (link) {
    return [
      `Join our baby's night log on Lullaby.`,
      '',
      '1. Install the Lullaby beta:',
      link,
      '',
      '2. Open the app and choose “Join with a code.”',
      '',
      '3. Enter code:',
      code,
      '',
      'This invite expires in 7 days.',
    ].join('\n');
  }

  return [
    `Join our baby's night log on Lullaby.`,
    '',
    'Install the Lullaby beta from the link I sent you, then open the app and choose “Join with a code.”',
    '',
    'Code:',
    code,
    '',
    'This invite expires in 7 days.',
  ].join('\n');
}
