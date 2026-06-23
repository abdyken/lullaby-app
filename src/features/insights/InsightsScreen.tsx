import { StatusBar } from 'expo-status-bar';
import { useMemo, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/Screen';
import { ThemeIconButton, type RevealOrigin } from '@/components/ThemeIconButton';
import { ThemeRevealOverlay } from '@/components/ThemeRevealOverlay';
import { InsightCard } from '@/features/insights/components/InsightCard';
import { InsightStatCard } from '@/features/insights/components/InsightStatCard';
import { InsightsSectionCard } from '@/features/insights/components/InsightsSectionCard';
import { WeeklySleepBars } from '@/features/insights/components/WeeklySleepBars';
import { buildInsightsViewModel } from '@/features/insights/insightSelectors';
import type { InsightStatViewModel, InsightsViewModel } from '@/features/insights/types';
import { useLogging } from '@/features/logging/state/LoggingProvider';
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
  const { mode, reveal, revealProgress, isTransitioning, beginReveal } = useTheme();
  const { todayEvents } = useLogging();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isShortDesktop = width >= 700 && height <= 760;
  const contentMaxWidth = isShortDesktop ? SHORT_DESKTOP_CONTENT_MAX_WIDTH : CONTENT_MAX_WIDTH;
  const statsGap = isShortDesktop ? 18 : 22;
  const [revealScrollY, setRevealScrollY] = useState(0);
  const scrollYRef = useRef(0);
  const viewModel = useMemo(
    () => buildInsightsViewModel({ events: todayEvents, now: resolveInsightsNow() }),
    [todayEvents],
  );
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

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  };

  const handleThemeToggle = (origin?: RevealOrigin) => {
    if (isTransitioning) return;
    const fallbackOrigin: RevealOrigin = { x: width - 41, y: insets.top + 35 };
    setRevealScrollY(scrollYRef.current);
    beginReveal(origin ?? fallbackOrigin);
  };

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
          <ThemeIconButton surfaceMode={bodyMode} onPress={handleThemeToggle} disabled={isTransitioning} />
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

        <View style={{ height: INSIGHTS_BOTTOM_CLEARANCE }} />
      </View>
    );
  };

  return (
    <>
      <Screen surfaceMode={mode} onScroll={handleScroll} scrollEnabled={!isTransitioning}>
        {renderBody(mode)}
      </Screen>

      {reveal.active && <StatusBar style={reveal.toMode === 'night' ? 'light' : 'dark'} />}

      <ThemeRevealOverlay visible={reveal.active} progress={revealProgress}>
        <Screen surfaceMode={reveal.toMode} scrollEnabled={false} contentOffset={{ x: 0, y: revealScrollY }}>
          {renderBody(reveal.toMode)}
        </Screen>
      </ThemeRevealOverlay>
    </>
  );
}

export default InsightsScreen;
