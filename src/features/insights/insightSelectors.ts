import {
  isDiaperEvent,
  isFeedEvent,
  isSleepEvent,
  type CareEvent,
  type SleepEvent,
} from '@/features/logging/domain/types';

import type {
  InsightDeltaTone,
  InsightStatViewModel,
  InsightsViewModel,
  WeeklySleepDayViewModel,
} from './types';

type LocalDay = {
  date: string;
  label: string;
  startMs: number;
  endMs: number;
};

const MAX_WAKE_WINDOW_MINUTES = 10 * 60;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** The free Insights window: the last 7 local days. */
export const DEFAULT_INSIGHTS_WINDOW_DAYS = 7;
/** The Pro extended-insights window: the last 30 local days. */
export const EXTENDED_INSIGHTS_WINDOW_DAYS = 30;
/**
 * Trends are only computed for windows of at least this many days: the trend
 * compares the recent half of the window against the earlier half, and a half
 * shorter than a week is too noisy to honestly call a direction.
 */
export const TREND_MIN_WINDOW_DAYS = 14;
/** Each half-window needs at least this many active (logged) days to compare. */
const TREND_MIN_ACTIVE_DAYS_PER_HALF = 2;
/** Relative change inside ±this band reads as "steady". */
const TREND_STEADY_BAND = 0.1;

/** A computed per-stat trend: recent half-window vs the earlier half-window. */
type StatTrend = { delta: string; deltaTone: InsightDeltaTone };

type WindowTrends = {
  feeds: StatTrend | null;
  sleep: StatTrend | null;
  diapers: StatTrend | null;
};

const NO_TRENDS: WindowTrends = { feeds: null, sleep: null, diapers: null };

export function buildInsightsViewModel(params: {
  events: CareEvent[];
  now: number;
  /** Local-day window size; defaults to the free 7-day view. */
  windowDays?: number;
}): InsightsViewModel {
  const { events, now } = params;
  const windowDays = Math.max(1, Math.round(params.windowDays ?? DEFAULT_INSIGHTS_WINDOW_DAYS));
  const days = getLastNLocalDays(now, windowDays);
  const windowStart = days[0]?.startMs ?? startOfLocalDay(now);
  const windowEnd = days[days.length - 1]?.endMs ?? addLocalDays(windowStart, 1);
  const relevantEvents = events.filter((event) => isVisibleEvent(event));

  const feedEvents = relevantEvents
    .filter((event) => isFeedEvent(event) && isTimestampInWindow(getEventStartedAt(event), windowStart, windowEnd))
    .sort((a, b) => getEventStartedAt(a) - getEventStartedAt(b));

  const diaperEvents = relevantEvents.filter(
    (event) => isDiaperEvent(event) && isTimestampInWindow(getEventStartedAt(event), windowStart, windowEnd),
  );

  const completedSleepEvents = relevantEvents
    .filter(isCompletedSleepEvent)
    .filter((event) => intervalsOverlap(getEventStartedAt(event), getEventEndedAt(event), windowStart, windowEnd))
    .sort((a, b) => getEventStartedAt(a) - getEventStartedAt(b));

  const weeklySleep = buildWeeklySleep(days, completedSleepEvents);
  const activeDayKeys = buildActiveDataDayKeys(days, relevantEvents);
  const activeDataDays = activeDayKeys.size;
  const totalSleepMinutes = weeklySleep.reduce((sum, day) => sum + day.minutes, 0);

  const cards = [
    buildFeedRhythmCard(feedEvents),
    buildSleepInsightCard(completedSleepEvents),
    buildWakeWindowCard(completedSleepEvents),
  ];

  const hasPatternData = feedEvents.length >= 3 || completedSleepEvents.length >= 2 || diaperEvents.length >= 4;
  const hasEnoughData = activeDataDays > 0 && (activeDataDays >= 4 || hasPatternData);

  // Trends are REAL: computed from the logs by comparing the recent half of the
  // window against the earlier half. Short (free, 7-day) windows carry no trend
  // at all — never a hardcoded placeholder.
  const trends =
    windowDays >= TREND_MIN_WINDOW_DAYS
      ? buildWindowTrends({ days, events: relevantEvents, feedEvents, diaperEvents, sleeps: completedSleepEvents })
      : NO_TRENDS;

  return {
    updatedAt: now,
    hasEnoughData,
    dataDays: activeDataDays,
    windowDays,
    cards,
    weeklySleep,
    stats: {
      feedsPerDay: buildCountStat({
        count: feedEvents.length,
        activeDataDays,
        label: 'Feeds / day',
        trend: trends.feeds,
      }),
      sleepPerDay: buildSleepStat({ totalSleepMinutes, activeDataDays, trend: trends.sleep }),
      diapersPerDay: buildCountStat({
        count: diaperEvents.length,
        activeDataDays,
        label: 'Diapers / day',
        trend: trends.diapers,
      }),
    },
  };
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addLocalDays(dayStartMs: number, count: number): number {
  const date = new Date(dayStartMs);
  date.setDate(date.getDate() + count);
  return date.getTime();
}

function getLastNLocalDays(now: number, count: number): LocalDay[] {
  const todayStart = startOfLocalDay(now);
  return Array.from({ length: count }, (_, index) => {
    const startMs = addLocalDays(todayStart, index - (count - 1));
    const endMs = addLocalDays(startMs, 1);
    const date = new Date(startMs);
    return {
      date: localDateKey(date),
      label: DAY_LABELS[date.getDay()],
      startMs,
      endMs,
    };
  });
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseTimestamp(value: string | null): number {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function getEventStartedAt(event: CareEvent): number {
  const startedAt = parseTimestamp(event.startedAt);
  if (Number.isFinite(startedAt)) return startedAt;
  return parseTimestamp(event.occurredAt);
}

function getEventEndedAt(event: CareEvent): number {
  const endedAt = parseTimestamp(event.endedAt);
  if (Number.isFinite(endedAt)) return endedAt;
  return parseTimestamp(event.occurredAt);
}

function isVisibleEvent(event: CareEvent): boolean {
  return event.status !== 'cancelled' && event.status !== 'deleted';
}

function isCompletedSleepEvent(event: CareEvent): event is SleepEvent {
  if (!isSleepEvent(event) || event.status !== 'completed') return false;
  const startedAt = getEventStartedAt(event);
  const endedAt = getEventEndedAt(event);
  return Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt > startedAt;
}

function isTimestampInWindow(timestamp: number, windowStart: number, windowEnd: number): boolean {
  return Number.isFinite(timestamp) && timestamp >= windowStart && timestamp < windowEnd;
}

function intervalsOverlap(startMs: number, endMs: number, windowStart: number, windowEnd: number): boolean {
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > windowStart && startMs < windowEnd;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function overlapMinutes(startMs: number, endMs: number, day: LocalDay): number {
  const overlapStart = Math.max(startMs, day.startMs);
  const overlapEnd = Math.min(endMs, day.endMs);
  if (overlapEnd <= overlapStart) return 0;
  return Math.round((overlapEnd - overlapStart) / 60_000);
}

function buildWeeklySleep(days: LocalDay[], sleeps: SleepEvent[]): WeeklySleepDayViewModel[] {
  return days.map((day) => ({
    date: day.date,
    label: day.label,
    minutes: sleeps.reduce((sum, sleep) => sum + overlapMinutes(getEventStartedAt(sleep), getEventEndedAt(sleep), day), 0),
  }));
}

function buildActiveDataDayKeys(days: LocalDay[], events: CareEvent[]): Set<string> {
  const dayKeys = new Set<string>();

  for (const event of events) {
    if (isCompletedSleepEvent(event)) {
      const startedAt = getEventStartedAt(event);
      const endedAt = getEventEndedAt(event);
      for (const day of days) {
        if (overlapMinutes(startedAt, endedAt, day) > 0) dayKeys.add(day.date);
      }
      continue;
    }

    const timestamp = getEventStartedAt(event);
    const day = days.find((item) => isTimestampInWindow(timestamp, item.startMs, item.endMs));
    if (day) dayKeys.add(day.date);
  }

  return dayKeys;
}

function buildFeedRhythmCard(feedEvents: CareEvent[]): InsightsViewModel['cards'][number] {
  if (feedEvents.length < 3) {
    return {
      id: 'feed-rhythm',
      icon: 'bottle',
      text: "Feed rhythm shows once you've logged a few feeds.",
      tone: 'feed',
    };
  }

  const intervals = feedEvents.slice(1).map((event, index) => {
    const current = getEventStartedAt(event);
    const previous = getEventStartedAt(feedEvents[index]);
    return Math.max(0, Math.round((current - previous) / 60_000));
  });
  const averageMinutes = Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length);

  return {
    id: 'feed-rhythm',
    icon: 'bottle',
    text: `Feeds are settling into a ${formatDuration(averageMinutes)} rhythm.`,
    source: `From ${feedEvents.length} recent feeds`,
    tone: 'feed',
  };
}

function buildSleepInsightCard(sleeps: SleepEvent[]): InsightsViewModel['cards'][number] {
  // Honesty gate: one nap isn't a "longest stretch". Hold the placeholder until
  // there are at least two completed sleeps to compare. The max below is unchanged.
  if (sleeps.length < 2) {
    return {
      id: 'sleep-pattern',
      icon: 'moon',
      text: "Sleep patterns show once you've logged a couple of sleeps.",
      tone: 'sleep',
    };
  }

  const longestMinutes = sleeps.reduce((longest, sleep) => {
    const minutes = Math.round((getEventEndedAt(sleep) - getEventStartedAt(sleep)) / 60_000);
    return Math.max(longest, minutes);
  }, 0);

  return {
    id: 'sleep-pattern',
    icon: 'moon',
    text: `Longest sleep stretch is around ${formatDuration(longestMinutes)}.`,
    tone: 'sleep',
  };
}

function buildWakeWindowCard(sleeps: SleepEvent[]): InsightsViewModel['cards'][number] {
  const gaps = sleeps.slice(1).flatMap((sleep, index) => {
    const previousEndedAt = getEventEndedAt(sleeps[index]);
    const nextStartedAt = getEventStartedAt(sleep);
    const gapMinutes = Math.round((nextStartedAt - previousEndedAt) / 60_000);
    if (gapMinutes <= 0 || gapMinutes > MAX_WAKE_WINDOW_MINUTES) return [];
    return [gapMinutes];
  });

  // Honesty gate: a single gap is one sample, not an "around X" average. Hold the
  // placeholder until there are at least two wake windows. The mean below is unchanged.
  if (sleeps.length < 2 || gaps.length < 2) {
    return {
      id: 'wake-windows',
      icon: 'sun',
      text: "Wake windows show once you've logged a few sleeps.",
      tone: 'neutral',
    };
  }

  const averageMinutes = Math.round(gaps.reduce((sum, value) => sum + value, 0) / gaps.length);
  return {
    id: 'wake-windows',
    icon: 'sun',
    text: `Wake windows are around ${formatDuration(averageMinutes)}.`,
    tone: 'neutral',
  };
}

/**
 * Compare the recent half of the window against the earlier half for each stat.
 * Honesty rules: a half with too few logged days, or an empty baseline, yields
 * NO trend (null) rather than a made-up one.
 */
function buildWindowTrends(params: {
  days: LocalDay[];
  events: CareEvent[];
  feedEvents: CareEvent[];
  diaperEvents: CareEvent[];
  sleeps: SleepEvent[];
}): WindowTrends {
  const { days, events, feedEvents, diaperEvents, sleeps } = params;
  const mid = Math.floor(days.length / 2);
  const earlier = buildHalfWindowAverages(days.slice(0, mid), events, feedEvents, diaperEvents, sleeps);
  const recent = buildHalfWindowAverages(days.slice(mid), events, feedEvents, diaperEvents, sleeps);
  if (!earlier || !recent) return NO_TRENDS;

  return {
    feeds: computeTrend(earlier.feedsPerDay, recent.feedsPerDay),
    sleep: computeTrend(earlier.sleepMinutesPerDay, recent.sleepMinutesPerDay),
    diapers: computeTrend(earlier.diapersPerDay, recent.diapersPerDay),
  };
}

type HalfWindowAverages = {
  feedsPerDay: number;
  sleepMinutesPerDay: number;
  diapersPerDay: number;
};

function buildHalfWindowAverages(
  days: LocalDay[],
  events: CareEvent[],
  feedEvents: CareEvent[],
  diaperEvents: CareEvent[],
  sleeps: SleepEvent[],
): HalfWindowAverages | null {
  if (days.length === 0) return null;
  const activeDays = buildActiveDataDayKeys(days, events).size;
  if (activeDays < TREND_MIN_ACTIVE_DAYS_PER_HALF) return null;

  const startMs = days[0].startMs;
  const endMs = days[days.length - 1].endMs;
  const feeds = feedEvents.filter((event) =>
    isTimestampInWindow(getEventStartedAt(event), startMs, endMs),
  ).length;
  const diapers = diaperEvents.filter((event) =>
    isTimestampInWindow(getEventStartedAt(event), startMs, endMs),
  ).length;
  const sleepMinutes = days.reduce(
    (sum, day) =>
      sum + sleeps.reduce((daySum, sleep) => daySum + overlapMinutes(getEventStartedAt(sleep), getEventEndedAt(sleep), day), 0),
    0,
  );

  return {
    feedsPerDay: feeds / activeDays,
    sleepMinutesPerDay: sleepMinutes / activeDays,
    diapersPerDay: diapers / activeDays,
  };
}

/**
 * A real relative-change trend. `earlier` is the baseline; without one (zero)
 * there is nothing honest to claim, so the stat carries no trend chip.
 */
function computeTrend(earlier: number, recent: number): StatTrend | null {
  if (!Number.isFinite(earlier) || !Number.isFinite(recent) || earlier <= 0) return null;
  const change = (recent - earlier) / earlier;
  if (Math.abs(change) < TREND_STEADY_BAND) {
    return { delta: 'steady', deltaTone: 'neutral' };
  }
  const percent = Math.round(Math.abs(change) * 100);
  return change > 0
    ? { delta: `up ${percent}%`, deltaTone: 'up' }
    : { delta: `down ${percent}%`, deltaTone: 'down' };
}

function buildCountStat(params: {
  count: number;
  activeDataDays: number;
  label: string;
  trend: StatTrend | null;
}): InsightStatViewModel {
  const { count, activeDataDays, label, trend } = params;
  if (activeDataDays === 0) {
    return { value: '0', label };
  }

  return {
    value: formatDecimal(count / activeDataDays),
    label,
    ...(trend ?? {}),
  };
}

function buildSleepStat(params: {
  totalSleepMinutes: number;
  activeDataDays: number;
  trend: StatTrend | null;
}): InsightStatViewModel {
  const { totalSleepMinutes, activeDataDays, trend } = params;
  if (activeDataDays === 0 || totalSleepMinutes <= 0) {
    return { value: '0', label: 'Sleep / day' };
  }

  const averageMinutes = totalSleepMinutes / activeDataDays;
  if (averageMinutes < 60) {
    return {
      value: `${Math.round(averageMinutes)}`,
      unit: 'm',
      label: 'Sleep / day',
      ...(trend ?? {}),
    };
  }

  return {
    value: `${Math.round(averageMinutes / 60)}`,
    unit: 'h',
    label: 'Sleep / day',
    ...(trend ?? {}),
  };
}

function formatDuration(minutesInput: number): string {
  const minutes = clamp(Math.round(minutesInput), 0, Number.MAX_SAFE_INTEGER);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function formatDecimal(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}
