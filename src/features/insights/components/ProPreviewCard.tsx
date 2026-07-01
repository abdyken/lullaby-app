/**
 * ProPreviewCard — a NON-PAID "Lullaby Pro" teaser shown in Insights once the
 * parent has enough data to feel the value. No payment, no RevenueCat, no live
 * paywall, and no lock that blocks anything: the two actions only record
 * interest (`upgrade_card_tapped` / `export_tapped`) and show a calm "coming
 * soon" line. Purely presentational, additive to the screen.
 *
 * Built on InsightsSectionCard so it matches the surrounding cards. Deliberately
 * avoids the absolute-fill scrim overlay (a known Android transparency pitfall) —
 * a plain card with a "Soon" badge reads as a preview without the fragile trick.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { getProMode } from '@/lib/proConfig';
import { useAnalytics } from '@/lib/useAnalytics';
import { usePro } from '@/state/ProProvider';
import { useTheme } from '@/state/ThemeProvider';
import { colors, fonts, radii, surfaces } from '@/theme';

import { InsightsSectionCard } from './InsightsSectionCard';

const FEATURES = [
  'Your full history, beyond the last 7 days',
  'A weekly recap you can keep',
  'A clean summary to share with your pediatrician',
];

const CONFIRM = 'Lullaby Pro is coming soon — thanks for the interest.';

function FeatureRow({ text, color, inkColor }: { text: string; color: string; inkColor: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
      <View
        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginTop: 7 }}
      />
      <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: inkColor }}>
        {text}
      </Text>
    </View>
  );
}

export function ProPreviewCard() {
  const { mode } = useTheme();
  const palette = surfaces[mode];
  const track = useAnalytics();
  const { openPaywall } = usePro();
  const [tapped, setTapped] = useState(false);

  const onUpgrade = () => {
    // Real Pro build → open the paywall (Phase 2 skeleton).
    if (getProMode() === 'enabled') {
      track('paywall_opened', { source: 'insights', surface: 'pro_preview_card' });
      openPaywall();
      return;
    }
    // Preview (fake-door) → interest signal + calm "coming soon".
    track('upgrade_card_tapped', { source: 'insights' });
    setTapped(true);
  };
  const onExport = () => {
    // Real export is Phase 3 — for now the export CTA routes to the paywall and
    // records the gate it hit. It never claims export works yet.
    if (getProMode() === 'enabled') {
      track('pro_gate_seen', { gate: 'export_weekly_recap', surface: 'insights' });
      openPaywall();
      return;
    }
    // Preview (fake-door) → interest signal + calm "coming soon".
    track('export_tapped', { surface: 'insights' });
    setTapped(true);
  };

  return (
    <InsightsSectionCard title="Lullaby Pro" actionLabel="Soon">
      <View style={{ gap: 8 }}>
        {FEATURES.map((feature) => (
          <FeatureRow key={feature} text={feature} color={colors.feed} inkColor={palette.inkSoft} />
        ))}
      </View>

      {tapped ? (
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.feed, marginTop: 14 }}>
          {CONFIRM}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See what Lullaby Pro includes"
            onPress={onUpgrade}
            hitSlop={6}
            style={({ pressed }) => ({
              paddingVertical: 9,
              paddingHorizontal: 14,
              borderRadius: radii.pill,
              backgroundColor: colors.feedTint,
              opacity: pressed ? 0.7 : 1,
            })}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.feed }}>
              See what’s included
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Export this week"
            onPress={onExport}
            hitSlop={6}
            style={({ pressed }) => ({
              paddingVertical: 9,
              paddingHorizontal: 14,
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: palette.line,
              opacity: pressed ? 0.7 : 1,
            })}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: palette.inkSoft }}>
              Export this week
            </Text>
          </Pressable>
        </View>
      )}
    </InsightsSectionCard>
  );
}

export default ProPreviewCard;
