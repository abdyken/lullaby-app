import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { ExtendedInsightsCard } from '@/features/insights/components/ExtendedInsightsCard';
import { InsightCard } from '@/features/insights/components/InsightCard';
import { InsightStatCard } from '@/features/insights/components/InsightStatCard';
import { InsightsSectionCard } from '@/features/insights/components/InsightsSectionCard';
import { ProPreviewCard } from '@/features/insights/components/ProPreviewCard';
import { WeeklyRecapCard } from '@/features/insights/components/WeeklyRecapCard';
import { WeeklySleepBars } from '@/features/insights/components/WeeklySleepBars';
import { getInsightsViewModel } from '@/features/insights/getInsightsViewModel';
import {
  EXTENDED_INSIGHTS_WINDOW_DAYS,
  buildInsightsViewModel,
} from '@/features/insights/insightSelectors';
import type { InsightStatViewModel, InsightsViewModel } from '@/features/insights/types';
import { useLogging } from '@/features/logging/state/LoggingProvider';
import { useAnalytics } from '@/lib/useAnalytics';
import { fireMilestoneOnce, reached4DataDaysMilestoneKey } from '@/lib/analyticsMilestones';
import { getProMode } from '@/lib/proConfig';
import { useAuth } from '@/state/AuthProvider';
import { useTheme } from '@/state/ThemeProvider';
import { colors, fonts, radii, shadows, surfaces, tabbar, type SurfaceMode } from '@/theme';

const CONTENT_MAX_WIDTH = 420;
const SHORT_DESKTOP_CONTENT_MAX_WIDTH = 460;
// Extra tail room for the dense stats row; Screen already reserves the full tabbar footprint.
const INSIGHTS_BOTTOM_CLEARANCE = Math.round(tabbar.height * 0.4);

function resolveInsightsNow(): number {
  return Date.now();
}

type LoadStatus = 'loading' | 'ready' | 'error';

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
        text: 'Today is your first day of logging. Keep going and weekly insights will appear here.',
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

const EXTENDED_INSIGHTS_WINDOW_MS = EXTENDED_INSIGHTS_WINDOW_DAYS * 86_400_000;

export function InsightsScreen() {
  const { mode, isTransitioning } = useTheme();
  const { loadInsightsHistory, loadEventsInRange } = useLogging();
  const { session, baby } = useAuth();
  const track = useAnalytics();
  const { width, height } = useWindowDimensions();
  const isShortDesktop = width >= 700 && height <= 760;
  const contentMaxWidth = isShortDesktop ? SHORT_DESKTOP_CONTENT_MAX_WIDTH : CONTENT_MAX_WIDTH;
  const statsGap = isShortDesktop ? 18 : 22;
  const initialViewModel = useMemo(() => buildInsightsViewModel({ events: [], now: resolveInsightsNow() }), []);
  const [loadedViewModel, setLoadedViewModel] = useState<InsightsViewModel | null>(null);
  // Pro extended (30-day) view model — loaded alongside the 7-day one when real
  // Pro is enabled, so the section is ready the moment `isPro` flips true (e.g.
  // right after a purchase) without another fetch round-trip.
  const [extendedViewModel, setExtendedViewModel] = useState<InsightsViewModel | null>(null);
  // 'loading' until the first successful read; 'error' only when the *first* load
  // fails (no data to show yet). A refresh failure while data is already on screen
  // keeps the last good view model instead of wiping it — calmer than an error flash.
  const [status, setStatus] = useState<LoadStatus>('loading');
  // Read the latest loaded view model inside `load` without adding it to the
  // dependency list (which would re-trigger the load every time it updates).
  const loadedRef = useRef<InsightsViewModel | null>(null);
  // Monotonic request token: a resolution only wins if it is still the latest
  // request, so a slow load that finishes after blur or after a retry is ignored.
  const requestIdRef = useRef(0);

  const loadHistory = useCallback((nowMs: number) => loadInsightsHistory(nowMs), [loadInsightsHistory]);

  // The Pro window needs more history than the 7-day helper loads; the logging
  // repository already supports arbitrary ranges.
  const loadExtendedHistory = useCallback(
    (nowMs: number) => loadEventsInRange({ fromMs: nowMs - EXTENDED_INSIGHTS_WINDOW_MS, toMs: nowMs }),
    [loadEventsInRange],
  );

  // Load the 7-day history and build the view model. Called on tab focus and by
  // the Retry button. On failure it keeps any previously loaded data on screen and
  // only surfaces the error UI when there is nothing to fall back to.
  const load = useCallback(() => {
    const requestId = (requestIdRef.current += 1);
    if (!loadedRef.current) setStatus('loading');
    const nowMs = resolveInsightsNow();

    // Extended (30-day) Pro view — only in a real-Pro build. A failure keeps the
    // last good extended view (the card shows a calm loading line otherwise);
    // the free 7-day path below is never blocked by this load.
    if (getProMode() === 'enabled') {
      void getInsightsViewModel({
        loadHistory: loadExtendedHistory,
        nowMs,
        windowDays: EXTENDED_INSIGHTS_WINDOW_DAYS,
      })
        .then((next) => {
          if (requestId !== requestIdRef.current) return;
          setExtendedViewModel(next);
        })
        .catch((error) => {
          if (__DEV__) console.warn('[insights] failed to load extended history', error);
        });
    }

    void getInsightsViewModel({
      loadHistory,
      nowMs,
    })
      .then((next) => {
        if (requestId !== requestIdRef.current) return;
        loadedRef.current = next;
        setLoadedViewModel(next);
        setStatus('ready');
        if (next.dataDays >= 4) {
          track('insights_recap_available', { dataDays: next.dataDays });
          void fireMilestoneOnce(
            reached4DataDaysMilestoneKey(session?.user.id ?? null, baby?.id ?? null),
            () => track('reached_4_data_days', { dataDays: next.dataDays }),
          );
        }
      })
      .catch((error) => {
        if (requestId !== requestIdRef.current) return;
        if (__DEV__) console.warn('[insights] failed to load history', error);
        setStatus(loadedRef.current ? 'ready' : 'error');
      });
  }, [loadHistory, loadExtendedHistory, track, session?.user.id, baby?.id]);

  // Reload on tab focus so backdated logs inside the 7-day window are picked up.
  // insights_opened fires once per visit; the recap preview + once-ever 4-data-days
  // milestone fire from `load` once the parent has enough data. Bumping the request
  // token on blur invalidates any in-flight load so a late resolution can't win.
  useFocusEffect(
    useCallback(() => {
      track('insights_opened');
      load();
      return () => {
        requestIdRef.current += 1;
      };
    }, [load, track]),
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

        {status === 'error' ? (
          <View
            style={{
              marginTop: 2,
              paddingVertical: 20,
              paddingHorizontal: 18,
              borderRadius: radii.medium,
              borderWidth: bodyMode === 'night' ? 1 : 0,
              borderColor: bodyPalette.border,
              backgroundColor: bodyMode === 'night' ? 'rgba(224,87,75,0.14)' : colors.alertTint,
              ...shadows.card,
            }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11.5, lineHeight: 15, color: colors.alert }}>
              Couldn&apos;t load insights
            </Text>
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: 13,
                lineHeight: 18.5,
                color: bodyPalette.ink,
                marginTop: 3,
              }}>
              Something went wrong while gathering your last 7 days. Your logs are safe — this only
              affects the summary.
            </Text>
            <Pressable
              onPress={load}
              accessibilityRole="button"
              accessibilityLabel="Retry loading insights"
              style={({ pressed }) => ({
                alignSelf: 'flex-start',
                marginTop: 14,
                paddingVertical: 9,
                paddingHorizontal: 18,
                borderRadius: radii.pill,
                backgroundColor: colors.feed,
                opacity: pressed ? 0.85 : 1,
              })}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.white }}>Try again</Text>
            </Pressable>
          </View>
        ) : status === 'loading' && !loadedViewModel ? (
          <View
            style={{
              marginTop: 2,
              paddingVertical: 24,
              paddingHorizontal: 18,
              borderRadius: radii.medium,
              borderWidth: bodyMode === 'night' ? 1 : 0,
              borderColor: bodyPalette.border,
              backgroundColor: bodyPalette.card,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              ...shadows.card,
            }}>
            <ActivityIndicator color={colors.feed} />
            <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18.5, color: bodyPalette.inkSoft }}>
              Gathering your last 7 days…
            </Text>
          </View>
        ) : (
          <>
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
                icon={card.icon}
                tone={card.tone}
                source={card.source}
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

        {/* Lullaby Pro card — shown once there's enough data (dataDays >= 4), in
            either Pro mode: "preview" is the non-paid fake-door; "enabled" opens
            the Phase 2 paywall. Hidden when Pro is off. Additive; never blocks
            logging. */}
        {getProMode() !== 'off' && viewModel.dataDays >= 4 ? (
          <View style={{ marginTop: 13 }}>
            <ProPreviewCard viewModel={viewModel} />
          </View>
        ) : null}

        {/* Extended 30-day insights — real Pro only. Free sees a teaser that
            opens the paywall; Pro sees the genuine 30-day view with computed
            trends. Additive depth; the free 7-day view above never changes. */}
        {getProMode() === 'enabled' && viewModel.dataDays >= 4 ? (
          <View style={{ marginTop: 13 }}>
            <ExtendedInsightsCard viewModel={extendedViewModel} />
          </View>
        ) : null}
          </>
        )}

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
