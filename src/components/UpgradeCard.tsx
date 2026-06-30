/**
 * UpgradeCard — a calm, NON-PAID "Lullaby Pro" preview. There is no payment, no
 * RevenueCat, and no live paywall: tapping only records an `upgrade_card_tapped`
 * analytics event (interest signal for the retention test) and shows a quiet
 * "coming soon" line. Purely presentational; it never gates anything.
 *
 * Visual language follows the HandoffCard skeleton (soft gradient, eyebrow +
 * title + subline + low-emphasis CTA). Defaults to the day palette so it sits
 * cleanly on the white AccountSheet, which has no theme context.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAnalytics } from '@/lib/analytics';
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
const SUBLINE =
  'Full history, a gentle weekly recap, a doctor-ready summary, and more caregivers. Coming soon.';
const CTA = 'See what’s included';
const CONFIRM = 'Thanks — Lullaby Pro is coming soon.';

export function UpgradeCard({ source, surfaceMode = 'day' }: Props) {
  const track = useAnalytics();
  const [tapped, setTapped] = useState(false);
  const palette = surfaces[surfaceMode];

  const onPress = () => {
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
      </View>

      <Text style={{ fontFamily: fonts.display, fontSize: 16.5, color: palette.ink, marginTop: 6 }}>
        {TITLE}
      </Text>
      <Text
        style={{
          fontFamily: fonts.body,
          fontSize: 12.5,
          lineHeight: 18,
          color: palette.inkSoft,
          marginTop: 4,
        }}>
        {SUBLINE}
      </Text>

      {tapped ? (
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
