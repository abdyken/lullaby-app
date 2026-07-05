/**
 * ExtendedInsightsCard — the Pro "full month" rhythm view in Insights.
 *
 * Rendered only when real Pro is enabled (the parent screen gates on
 * getProMode() === 'enabled'). Behavior by entitlement:
 *
 *   free → a calm teaser describing the 30-day view; the CTA records the gate
 *          (`pro_gate_seen` gate:'extended_insights') and opens the paywall.
 *          Nothing premium is shown — and nothing fake either.
 *   Pro  → the REAL extended view: rhythm cards + per-day stats computed over
 *          the last 30 days of on-device logs, each stat carrying a computed
 *          trend (recent half of the window vs the earlier half — see
 *          insightSelectors buildWindowTrends). Never a hardcoded value.
 *
 * The gate is `canViewExtendedInsights(isPro)`. The free 7-day Insights view
 * above this card stays free for everyone; this card only ever ADDS depth.
 */
import { Pressable, Text, View } from 'react-native';

import { canViewExtendedInsights } from '@/lib/proGates';
import { useAnalytics } from '@/lib/useAnalytics';
import { usePro } from '@/state/ProProvider';
import { useTheme } from '@/state/ThemeProvider';
import { colors, fonts, radii, surfaces } from '@/theme';

import type { InsightsViewModel } from '../types';
import { InsightCard } from './InsightCard';
import { InsightStatCard } from './InsightStatCard';
import { InsightsSectionCard } from './InsightsSectionCard';

const TITLE = 'Last 30 days';
const TEASER_TEXT =
  'See the whole month: 30-day rhythm insights with real trends, built from your logs on this device.';
const TEASER_CTA = 'Unlock 30-day insights';
const SPARSE_TEXT = 'The 30-day view fills in as you keep logging.';
const LOADING_TEXT = 'Gathering your last 30 days…';

export function ExtendedInsightsCard({ viewModel }: { viewModel: InsightsViewModel | null }) {
  const { mode } = useTheme();
  const palette = surfaces[mode];
  const track = useAnalytics();
  const { isPro, openPaywall } = usePro();

  // Not entitled → the teaser. The CTA opens the shared paywall and records
  // which gate was hit; it never renders premium data.
  if (!canViewExtendedInsights(isPro)) {
    const onUnlock = () => {
      track('pro_gate_seen', { gate: 'extended_insights', surface: 'insights' });
      track('paywall_opened', { source: 'insights', surface: 'extended_insights_card' });
      openPaywall();
    };

    return (
      <InsightsSectionCard title={TITLE} actionLabel="Pro">
        <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: palette.inkSoft }}>
          {TEASER_TEXT}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={TEASER_CTA}
          onPress={onUnlock}
          hitSlop={6}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            marginTop: 12,
            paddingVertical: 9,
            paddingHorizontal: 14,
            borderRadius: radii.pill,
            backgroundColor: colors.sleepTint,
            opacity: pressed ? 0.7 : 1,
          })}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.sleep }}>{TEASER_CTA}</Text>
        </Pressable>
      </InsightsSectionCard>
    );
  }

  // Entitled but the 30-day history has not resolved yet → a calm placeholder
  // (this is a loading state, never a dead end; the load retries on tab focus).
  if (!viewModel) {
    return (
      <InsightsSectionCard title={TITLE} actionLabel="Pro">
        <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: palette.inkSoft }}>
          {LOADING_TEXT}
        </Text>
      </InsightsSectionCard>
    );
  }

  // Entitled with a real 30-day view model → the genuine extended view.
  const daysLabel = `${viewModel.dataDays} ${viewModel.dataDays === 1 ? 'day' : 'days'} logged`;

  return (
    <InsightsSectionCard title={TITLE} actionLabel={daysLabel}>
      {viewModel.hasEnoughData ? (
        <>
          <View style={{ gap: 11 }}>
            {viewModel.cards.map((card) => (
              <InsightCard
                key={card.id}
                icon={card.icon}
                tone={card.tone}
                source={card.source}
                text={card.text}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <InsightStatCard {...viewModel.stats.feedsPerDay} />
            <InsightStatCard {...viewModel.stats.sleepPerDay} />
            <InsightStatCard {...viewModel.stats.diapersPerDay} />
          </View>
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 11.5,
              lineHeight: 16,
              color: palette.inkSoft,
              marginTop: 10,
            }}>
            Trends compare the recent half of the month with the earlier half of your logs.
          </Text>
        </>
      ) : (
        <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: palette.inkSoft }}>
          {SPARSE_TEXT}
        </Text>
      )}
    </InsightsSectionCard>
  );
}

export default ExtendedInsightsCard;
