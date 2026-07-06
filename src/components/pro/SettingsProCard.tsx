/**
 * SettingsProCard — the READ-ONLY "Lullaby Pro" card for the ROOT /settings
 * screen.
 *
 * /settings sits OUTSIDE the tabs ProProvider, so this card reads entitlement via
 * useProStatusStandalone (never usePro, which would throw in root scope). It shows
 * STATUS only and never purchases, restores, or opens a paywall:
 *   isPro          → a calm "Pro is active" status, no CTA.
 *   enabled + free → an affordance that routes BACK into the tabs tree, where the
 *                    real paywall + purchase/restore live (never a paywall here).
 *   preview (fake) → the fake-door: records the interest signal + a calm
 *                    "coming soon" line.
 *
 * Mirrors UpgradeCard's honest copy (names only the two real pillars: the
 * shareable weekly summary + the 30-day rhythm insights) but carries NO purchase
 * surface. The "coming later/soon" fake-door copy lives HERE, not in settings.tsx,
 * so the account screen's own text stays clear of coming-soon framing (AE9).
 * Themed to match the /settings cards (day/night palette).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAnalytics } from '@/lib/useAnalytics';
import { useTheme } from '@/state/ThemeProvider';
import { useProStatusStandalone } from '@/state/useProStatusStandalone';
import { colors, fonts, radii, shadows, surfaces } from '@/theme';

export function SettingsProCard() {
  const track = useAnalytics();
  const { mode } = useTheme();
  const { isPro, proMode } = useProStatusStandalone();
  const [tapped, setTapped] = useState(false);
  const palette = surfaces[mode];

  const onPress = () => {
    // Interest signal from the settings surface. In a live (enabled) build we
    // route BACK into the tabs tree — the real paywall + purchase/restore live
    // there, never on this root screen. The preview fake-door shows a calm
    // coming-soon note. Either way, this mutates no entitlement.
    track('upgrade_card_tapped', { source: 'settings' });
    if (proMode === 'enabled') {
      router.back();
      return;
    }
    setTapped(true);
  };

  return (
    <View
      style={{
        backgroundColor: palette.card,
        borderRadius: radii.medium,
        borderWidth: 1,
        borderColor: palette.border,
        paddingHorizontal: 16,
        paddingVertical: 14,
        ...shadows.card,
      }}>
      {isPro ? (
        <>
          <Text style={{ fontFamily: fonts.display, fontSize: 16.5, color: palette.ink }}>
            Lullaby Pro is active
          </Text>
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 13,
              lineHeight: 20,
              color: palette.inkSoft,
              marginTop: 4,
            }}>
            Your Pro features are unlocked. Thank you for supporting Lullaby.
          </Text>
        </>
      ) : (
        <>
          <Text style={{ fontFamily: fonts.display, fontSize: 16.5, color: palette.ink }}>
            Understand your baby{'’'}s rhythm
          </Text>
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 13,
              lineHeight: 20,
              color: palette.inkSoft,
              marginTop: 4,
            }}>
            {proMode === 'enabled'
              ? 'A shareable weekly summary and 30-day rhythm insights with real trends.'
              : 'A shareable weekly summary and monthly rhythm insights. Coming later.'}
          </Text>
          {tapped ? (
            <Text
              style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.sleep, marginTop: 12 }}>
              Thanks — Lullaby Pro is coming soon.
            </Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="See what Lullaby Pro includes"
              onPress={onPress}
              hitSlop={8}
              style={({ pressed }) => ({
                alignSelf: 'flex-start',
                marginTop: 12,
                opacity: pressed ? 0.6 : 1,
              })}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.sleep }}>
                See what{'’'}s included
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

export default SettingsProCard;
