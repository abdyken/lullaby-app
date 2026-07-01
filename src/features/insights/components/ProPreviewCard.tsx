/**
 * ProPreviewCard — the Lullaby Pro card in Insights, shown once the parent has
 * enough data to feel the value. Its behavior depends on getProMode():
 *
 *   preview  → NON-PAID fake-door: the two CTAs only record interest
 *              (`upgrade_card_tapped` / `export_tapped`) and show "coming soon".
 *   enabled + free  → the CTAs open the PaywallSheet; "Export this week" records
 *                     the gate it hit (`pro_gate_seen` + `paywall_opened`).
 *   enabled + Pro   → "Export this week" runs the REAL weekly export: it shares
 *                     the calm, non-medical `buildWeeklyExportText(viewModel)` via
 *                     the OS share sheet (`export_started` / `export_completed`).
 *
 * The export gate is `canExportWeeklyRecap(isPro)`; core logging is never gated.
 * Built on InsightsSectionCard so it matches the surrounding cards.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { getProMode } from '@/lib/proConfig';
import { canExportWeeklyRecap } from '@/lib/proGates';
import { useAnalytics } from '@/lib/useAnalytics';
import { usePro } from '@/state/ProProvider';
import { useTheme } from '@/state/ThemeProvider';
import { colors, fonts, radii, surfaces } from '@/theme';

import { shareWeeklyExport } from '../shareWeeklyExport';
import type { InsightsViewModel } from '../types';
import { InsightsSectionCard } from './InsightsSectionCard';

const FEATURES = [
  'Your full history, beyond the last 7 days',
  'A weekly recap you can keep',
  'A clean summary to share with your pediatrician',
];

const CONFIRM = 'Lullaby Pro is coming soon — thanks for the interest.';
const EXPORT_READY = 'Weekly export is ready to share.';

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

export function ProPreviewCard({ viewModel }: { viewModel: InsightsViewModel }) {
  const { mode } = useTheme();
  const palette = surfaces[mode];
  const track = useAnalytics();
  const { openPaywall, isPro } = usePro();
  // A calm one-line confirmation shown after a CTA (coming-soon / export-ready).
  const [feedback, setFeedback] = useState<string | null>(null);

  const onUpgrade = () => {
    // Real Pro build → open the paywall.
    if (getProMode() === 'enabled') {
      track('paywall_opened', { source: 'insights', surface: 'pro_preview_card' });
      openPaywall();
      return;
    }
    // Preview (fake-door) → interest signal + calm "coming soon".
    track('upgrade_card_tapped', { source: 'insights' });
    setFeedback(CONFIRM);
  };

  const runExport = async () => {
    // Pro entitlement → the real weekly export. Fire started before the share,
    // completed after a share/dismiss (a dismiss is a calm, normal outcome). A
    // platform failure degrades quietly — no crash, no completed event.
    track('export_started', { surface: 'insights' });
    const result = await shareWeeklyExport(viewModel);
    if (result !== 'failed') {
      track('export_completed', { surface: 'insights' });
    }
    setFeedback(EXPORT_READY);
  };

  const onExport = () => {
    // Preview (fake-door) → interest signal + calm "coming soon". No real export.
    if (getProMode() !== 'enabled') {
      track('export_tapped', { surface: 'insights' });
      setFeedback(CONFIRM);
      return;
    }
    // Real Pro build, but not entitled → route to the paywall, record the gate.
    if (!canExportWeeklyRecap(isPro)) {
      track('pro_gate_seen', { gate: 'weekly_export', surface: 'insights' });
      track('paywall_opened', { source: 'insights', surface: 'pro_preview_card' });
      openPaywall();
      return;
    }
    // Entitled → run the real export/share flow.
    void runExport();
  };

  return (
    <InsightsSectionCard title="Lullaby Pro" actionLabel="Soon">
      <View style={{ gap: 8 }}>
        {FEATURES.map((feature) => (
          <FeatureRow key={feature} text={feature} color={colors.feed} inkColor={palette.inkSoft} />
        ))}
      </View>

      {feedback ? (
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.feed, marginTop: 14 }}>
          {feedback}
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
