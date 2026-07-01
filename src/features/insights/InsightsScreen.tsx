import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { InsightCard } from '@/features/insights/components/InsightCard';
import { InsightStatCard } from '@/features/insights/components/InsightStatCard';
import { InsightsSectionCard } from '@/features/insights/components/InsightsSectionCard';
import { ProPreviewCard } from '@/features/insights/components/ProPreviewCard';
import { WeeklyRecapCard } from '@/features/insights/components/WeeklyRecapCard';
import { WeeklySleepBars } from '@/features/insights/components/WeeklySleepBars';
import { getInsightsViewModel } from '@/features/insights/getInsightsViewModel';
import { buildInsightsViewModel } from '@/features/insights/insightSelectors';
import { loadLegacyInsightsHistory } from '@/features/insights/loadLegacyInsightsHistory';
import type { InsightStatViewModel, InsightsViewModel } from '@/features/insights/types';
import { isLoggingV2Enabled } from '@/features/logging';
import type { CareEvent } from '@/features/logging/domain/types';
import { useLogging } from '@/features/logging/state/LoggingProvider';
import { useAnalytics } from '@/lib/useAnalytics';
import { fireMilestoneOnce, reached4DataDaysMilestoneKey } from '@/lib/analyticsMilestones';
import { isProPreviewEnabled } from '@/lib/proPreview';
import { useAuth } from '@/state/AuthProvider';
import { useLocalEvents } from '@/state/LocalEventProvider';
import { useTheme } from '@/state/ThemeProvider';
import { colors, fonts, radii, shadows, surfaces, tabbar, type SurfaceMode } from '@/theme';

const CONTENT_MAX_WIDTH = 420;
const SHORT_DESKTOP_CONTENT_MAX_WIDTH = 460;
// Extra tail room for the dense stats row; Screen already reserves the full tabbar footprint.
const INSIGHTS_BOTTOM_CLEARANCE = Math.round(tabbar.height * 0.4);

function resolveInsightsNow(): number {
  return Date.now();
}

type InsightsStateCopy = {
  sectionTitle: string;
  intro: {
    label: string;
    text: string;
  } | null;
};

function getInsightsStateCopy(viewModel: InsightsViewModel): InsightsStateCopy {
  if (viewModel.dataDays === 0) {
    return {
      sectionTitle: 'Getting started',
      intro: {
        label: 'Getting started',
        text: 'Start logging for a few days and Insights will appear here.',
      },
    };
  }

  if (viewModel.dataDays === 1) {
    return {
      sectionTitle: 'Getting started',
      intro: {
        label: 'First day of logs',
        text: 'Today is your first day of logs. Keep logging to unlock weekly insights.',
      },
    };
  }

  if (viewModel.dataDays <= 3) {
    return {
      sectionTitle: 'Early patterns',
      intro: {
        label: 'Early patterns',
        text: 'Based on the first few days of logs.',
      },
    };
  }

  return {
    sectionTitle: 'What we\'re seeing',
    intro: null,
  };
}

function getSleepSummaryLabel(viewModel: InsightsViewModel): string {
  const { sleepPerDay } = viewModel.stats;
  if (viewModel.dataDays === 0) return '0 days logged';
  if (viewModel.dataDays === 1) return 'Today only';
  if (viewModel.dataDays <= 3) return 'Early data';
  if (sleepPerDay.value === '0') return 'Building pattern';
  return `${sleepPerDay.value}${sleepPerDay.unit ?? ''} avg`;
}

function statForDataState(
  stat: InsightStatViewModel,
  dataDays: number,
  labels: { today: string; average: string },
): InsightStatViewModel {
  if (dataDays >= 4) return stat;
  return { value: stat.value, unit: stat.unit, label: dataDays <= 1 ? labels.today : labels.average };
}

export function InsightsScreen() {
  const { mode, isTransitioning } = useTheme();
  const { loadInsightsHistory } = useLogging();
  const { events: legacyEvents } = useLocalEvents();
  const { session, baby } = useAuth();
  const track = useAnalytics();
  const { width, height } = useWindowDimensions();
  const isShortDesktop = width >= 700 && height <= 760;
  const contentMaxWidth = isShortDesktop ? SHORT_DESKTOP_CONTENT_MAX_WIDTH : CONTENT_MAX_WIDTH;
  const statsGap = isShortDesktop ? 18 : 22;
  const initialViewModel = useMemo(() => buildInsightsViewModel({ events: [], now: resolveInsightsNow() }), []);
  const [loadedViewModel, setLoadedViewModel] = useState<InsightsViewModel | null>(null);

  // Keep the latest legacy events in a ref so `loadHistory` stays stable: the
  // focus effect should fire once per visit, not re-run on every new log. Fresh
  // events are still read whenever Insights regains focus.
  const legacyEventsRef = useRef(legacyEvents);
  useEffect(() => {
    legacyEventsRef.current = legacyEvents;
  }, [legacyEvents]);

  // In a default production build the V2 logging flag is off and
  // `loadInsightsHistory` returns [], so read the live Supabase-synced legacy
  // events and map them into the CareEvent shape the selectors expect (the 7-day
  // windowing happens downstream in buildInsightsViewModel). With the V2 flag on
  // (dev), use the V2 history unchanged.
  const loadHistory = useCallback(
    (nowMs: number): Promise<CareEvent[]> =>
      isLoggingV2Enabled()
        ? loadInsightsHistory(nowMs)
        : Promise.resolve(loadLegacyInsightsHistory(legacyEventsRef.current)),
    [loadInsightsHistory],
  );

  // Reload on tab focus so backdated logs inside the 7-day window are picked up.
  // Analytics fire here: insights_opened every visit; the weekly-recap preview and
  // the once-ever 4-data-days milestone once the parent has enough data.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      track('insights_opened');

      void getInsightsViewModel({
        loadHistory,
        nowMs: resolveInsightsNow(),
      }).then((next) => {
        if (cancelled) return;
        setLoadedViewModel(next);
        if (next.dataDays >= 4) {
          track('insights_recap_available', { dataDays: next.dataDays });
          void fireMilestoneOnce(
            reached4DataDaysMilestoneKey(session?.user.id ?? null, baby?.id ?? null),
            () => track('reached_4_data_days', { dataDays: next.dataDays }),
          );
        }
      });

      return () => {
        cancelled = true;
      };
    }, [loadHistory, track, session?.user.id, baby?.id]),
  );

  const viewModel = loadedViewModel ?? initialViewModel;
  const stateCopy = getInsightsStateCopy(viewModel);
  const sleepSummaryLabel = getSleepSummaryLabel(viewModel);
  const feedsPerDay = statForDataState(viewModel.stats.feedsPerDay, viewModel.dataDays, {
    today: 'Feeds today',
    average: 'Feeds avg',
  });
  const sleepPerDay = statForDataState(viewModel.stats.sleepPerDay, viewModel.dataDays, {
    today: 'Sleep today',
    average: 'Sleep avg',
  });
  const diapersPerDay = statForDataState(viewModel.stats.diapersPerDay, viewModel.dataDays, {
    today: 'Diapers today',
    average: 'Diapers avg',
  });

  const renderBody = (bodyMode: SurfaceMode) => {
    const bodyPalette = surfaces[bodyMode];
    const bodyIntroBackground = bodyMode === 'night' ? 'rgba(255,122,61,0.12)' : colors.feedTint;

    return (
      <View style={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' }}>
        <View
          style={{
            paddingTop: 2,
            paddingHorizontal: 2,
            marginBottom: 14,
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontFamily: fonts.display,
                fontSize: 30,
                color: bodyPalette.ink,
                includeFontPadding: false,
              }}>
              Insights
            </Text>
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: 12.5,
                lineHeight: 18,
                color: bodyPalette.inkSoft,
                marginTop: 4,
              }}>
              Last 7 days
            </Text>
          </View>
        </View>

        {stateCopy.intro ? (
          <View
            style={{
              marginBottom: 13,
              paddingVertical: 13,
              paddingHorizontal: 15,
              borderRadius: radii.small,
              borderWidth: bodyMode === 'night' ? 1 : 0,
              borderColor: bodyPalette.border,
              backgroundColor: bodyIntroBackground,
              ...shadows.card,
            }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11.5, lineHeight: 15, color: colors.feed }}>
              {stateCopy.intro.label}
            </Text>
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: 13,
                lineHeight: 18.5,
                color: bodyPalette.ink,
                marginTop: 3,
              }}>
              {stateCopy.intro.text}
            </Text>
          </View>
        ) : null}

        <InsightsSectionCard title={stateCopy.sectionTitle}>
          <View style={{ gap: 11 }}>
            {viewModel.cards.map((card) => (
              <InsightCard
                key={card.id}
                emoji={card.emoji}
                tone={card.tone}
                source={card.source}
                sourceTone={card.sourceTone}
                text={card.text}
              />
            ))}
          </View>
        </InsightsSectionCard>

        <View style={{ marginTop: 13 }}>
          <InsightsSectionCard title="Sleep this week" actionLabel={sleepSummaryLabel}>
            <WeeklySleepBars days={viewModel.weeklySleep} />
          </InsightsSectionCard>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: statsGap, marginBottom: isShortDesktop ? 14 : 8 }}>
          <InsightStatCard {...feedsPerDay} />
          <InsightStatCard {...sleepPerDay} />
          <InsightStatCard {...diapersPerDay} />
        </View>

        {/* Free, descriptive weekly recap — appears once there is enough data. */}
        {viewModel.dataDays >= 4 ? (
          <View style={{ marginTop: 13 }}>
            <WeeklyRecapCard viewModel={viewModel} />
          </View>
        ) : null}

        {/* Non-paid Lullaby Pro preview — behind EXPO_PUBLIC_PRO_PREVIEW_ENABLED
            (off by default), additive, never blocks logging. */}
        {isProPreviewEnabled() && viewModel.dataDays >= 4 ? (
          <View style={{ marginTop: 13 }}>
            <ProPreviewCard />
          </View>
        ) : null}

        <View style={{ height: INSIGHTS_BOTTOM_CLEARANCE }} />
      </View>
    );
  };

  return (
    <Screen surfaceMode={mode} scrollEnabled={!isTransitioning}>
      {renderBody(mode)}
    </Screen>
  );
}

export default InsightsScreen;
