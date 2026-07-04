/**
 * UpgradeCard — the "Lullaby Pro" card in the AccountSheet. Its behavior follows
 * getProMode() + the live Pro entitlement, so a single card serves every state:
 *
 *   isPro (any mode)  → a calm "Pro is active" status. NO upsell CTA, no "Soon"
 *                       badge, no "coming soon/later" copy — an already-subscribed
 *                       parent is never nudged to buy what they already have. This
 *                       doubles as the Account surface's current-Pro-state display.
 *   enabled + free    → a real upsell: tapping opens the shared PaywallSheet
 *                       (`paywall_opened` + openPaywall). No "coming later" copy —
 *                       the paywall is live.
 *   preview (fake)    → the NON-PAID fake-door: tapping records `upgrade_card_tapped`
 *                       and shows a quiet "coming soon" line. No payment, no paywall.
 *
 * Purely presentational; it never gates anything. Visual language follows the
 * HandoffCard skeleton (soft gradient, eyebrow + title + subline + low-emphasis
 * CTA). Defaults to the day palette so it sits cleanly on the white AccountSheet,
 * which has no theme context.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { getProMode } from '@/lib/proConfig';
import { useAnalytics } from '@/lib/useAnalytics';
import { usePro } from '@/state/ProProvider';
import { colors, fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

type Props = {
  /** where the card is shown — recorded as the analytics `source`. */
  source: 'account_sheet' | 'insights';
  /** palette — 'day' (default, for the AccountSheet) or 'night'. */
  surfaceMode?: SurfaceMode;
};

const GRADIENT: Record<SurfaceMode, [string, string]> = {
  day: [colors.sleepTint, colors.feedTint],
  night: ['#2B2A46', '#23303F'],
};

const TITLE = 'Understand your baby’s rhythm';
// Fake-door (preview) subline keeps the "coming later" framing; the live upsell
// drops it because the paywall is real. Both name ONLY features that genuinely
// exist: the shareable weekly TEXT summary and the 30-day rhythm insights.
const SUBLINE_PREVIEW =
  'A shareable weekly summary and monthly rhythm insights. Coming later.';
const SUBLINE_LIVE = 'A shareable weekly summary and 30-day rhythm insights with real trends.';
const CTA = 'See what’s included';
const CONFIRM = 'Thanks — Lullaby Pro is coming soon.';

// Already-subscribed state — a calm status, never an upsell.
const ACTIVE_TITLE = 'Lullaby Pro is active';
const ACTIVE_SUBLINE = 'Your Pro features are unlocked. Thank you for supporting Lullaby.';

export function UpgradeCard({ source, surfaceMode = 'day' }: Props) {
  const track = useAnalytics();
  const { openPaywall, isPro } = usePro();
  const [tapped, setTapped] = useState(false);
  const palette = surfaces[surfaceMode];
  // Real paywall available (vs. the non-paid fake-door preview).
  const live = getProMode() === 'enabled';

  const onPress = () => {
    // Real Pro build → open the shared paywall. Coarse props only.
    if (getProMode() === 'enabled') {
      track('paywall_opened', { source, surface: 'upgrade_card' });
      openPaywall();
      return;
    }
    // Preview (fake-door) and any non-enabled mode → interest signal + calm
    // "coming soon" confirmation. No paywall, no purchase.
    track('upgrade_card_tapped', { source });
    setTapped(true);
  };

  return (
    <LinearGradient
      colors={GRADIENT[surfaceMode]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{
        marginTop: 18,
        borderRadius: radii.medium,
        borderWidth: surfaceMode === 'night' ? 1 : 0,
        borderColor: surfaces.night.border,
        padding: 16,
        ...shadows.card,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: colors.sleep,
          }}>
          Lullaby Pro
        </Text>
        {/* "Soon" badge only in the fake-door preview — never for a live paywall
            or an already-active subscriber. */}
        {!isPro && !live ? (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: radii.pill,
              backgroundColor: colors.sleepTint,
            }}>
            <Text
              style={{
                fontFamily: fonts.bodyBold,
                fontSize: 9.5,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: colors.sleep,
              }}>
              Soon
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={{ fontFamily: fonts.display, fontSize: 16.5, color: palette.ink, marginTop: 6 }}>
        {isPro ? ACTIVE_TITLE : TITLE}
      </Text>
      <Text
        style={{
          fontFamily: fonts.body,
          fontSize: 12.5,
          lineHeight: 18,
          color: palette.inkSoft,
          marginTop: 4,
        }}>
        {isPro ? ACTIVE_SUBLINE : live ? SUBLINE_LIVE : SUBLINE_PREVIEW}
      </Text>

      {/* Already-active parents get no CTA at all — just the status above. */}
      {isPro ? null : tapped ? (
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.sleep, marginTop: 10 }}>
          {CONFIRM}
        </Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See what Lullaby Pro includes"
          onPress={onPress}
          hitSlop={8}
          style={({ pressed }) => ({ alignSelf: 'flex-start', marginTop: 10, opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.sleep }}>{CTA}</Text>
        </Pressable>
      )}
    </LinearGradient>
  );
}

export default UpgradeCard;
