import type { OrbCoreKind, OrbSky } from '@/components/OrbHero';
import { events } from '@/data/mock';
import type { LogEvent } from '@/data/models';
import type { AccentState } from '@/theme';

export type CurrentBabyState = {
  state: AccentState;
  skyTone: OrbSky;
  eyebrow: string;
  timerText: string;
  title: string;
  description: string;
  actionLabel: string;
  progress: number;
  coreKind?: OrbCoreKind;
};

/** Quick-log tiles can preview a state without creating any data. These are
 *  canned snapshots mirroring the mockup's STATES — no persistence, no events. */
export type PreviewState = 'feed' | 'sleep' | 'diaper';

const PREVIEW_STATES: Record<PreviewState, CurrentBabyState> = {
  sleep: {
    state: 'sleep',
    skyTone: 'night',
    eyebrow: 'Asleep',
    timerText: '1h 12m',
    title: 'Sleep started',
    description: "Started 4:12 · we'll keep the night quiet",
    actionLabel: 'Wake baby',
    progress: 0.36,
  },
  feed: {
    state: 'feed',
    skyTone: 'day',
    eyebrow: 'Feeding',
    timerText: '04m',
    title: 'Feed started',
    description: 'Left side · 4 min in',
    actionLabel: 'End feed',
    progress: 0.12,
  },
  diaper: {
    state: 'diaper',
    skyTone: 'day',
    eyebrow: 'Just logged',
    timerText: 'Done',
    title: 'Diaper logged',
    description: 'Wet · added to tonight',
    actionLabel: 'Done',
    progress: 1,
    coreKind: 'check',
  },
};

/** Canned orb snapshot for a previewed quick-log state (no data is written). */
export function getPreviewBabyState(state: PreviewState): CurrentBabyState {
  return PREVIEW_STATES[state];
}

/** What the orb is currently showing. "calm" = nothing active (post-action). */
export type OrbView = PreviewState | 'calm';

const CALM_STATE: CurrentBabyState = {
  state: 'sleep', // lavender accent — the calmest tone
  skyTone: 'dusk',
  eyebrow: 'All quiet',
  timerText: 'Calm',
  title: 'All caught up',
  description: 'Tap a tile to log the next feed, sleep, or change.',
  actionLabel: 'Start sleep',
  progress: 0,
};

/**
 * Orb snapshot for the current view (drives OrbHero + active tile).
 *
 * Structure/visuals are unchanged from the canned states; when live `events` are
 * supplied we fill the EXISTING fields with real values so the orb tells the
 * truth instead of fixed numbers:
 *  - sleep: the running sleep's real duration / start time / progress
 *  - calm:  a derived "Last feed … · Last diaper …" line (when anything is logged)
 * feed/diaper stay as momentary confirmation previews.
 */
export function getOrbView(
  view: OrbView,
  eventList: LogEvent[] = [],
  now: number = Date.now(),
): CurrentBabyState {
  if (view === 'calm') {
    const description = calmDescription(deriveNightStatus(eventList, now));
    return description ? { ...CALM_STATE, description } : CALM_STATE;
  }

  const base = PREVIEW_STATES[view];

  if (view === 'sleep') {
    const reference = new Date(now);
    const runningSleep = eventList
      .filter((event) => event.type === 'sleep' && event.endAt === null)
      .sort(byNewestStart)[0];
    if (runningSleep) {
      return {
        ...base,
        timerText: durationLabel(runningSleep.startAt, reference),
        description: `Started ${timeLabel(runningSleep.startAt)} · we'll keep the night quiet`,
        progress: elapsedProgress(runningSleep.startAt, reference, 200),
      };
    }
  }

  return base;
}

const DEMO_NOW = new Date('2026-06-16T05:24:00.000Z');

function byNewestStart(a: LogEvent, b: LogEvent) {
  return new Date(b.startAt).getTime() - new Date(a.startAt).getTime();
}

function durationLabel(startAt: string, reference: Date) {
  const elapsedMinutes = Math.max(0, Math.floor((reference.getTime() - new Date(startAt).getTime()) / 60000));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }

  return `${minutes.toString().padStart(2, '0')}m`;
}

function timeLabel(iso: string) {
  const date = new Date(iso);
  return `${date.getUTCHours()}:${date.getUTCMinutes().toString().padStart(2, '0')}`;
}

function elapsedProgress(startAt: string, reference: Date, fullScaleMinutes: number) {
  const elapsedMinutes = Math.max(0, (reference.getTime() - new Date(startAt).getTime()) / 60000);
  return Math.min(1, elapsedMinutes / fullScaleMinutes);
}

export function getCurrentBabyState(
  eventList: LogEvent[] = events,
  reference: Date = DEMO_NOW,
): CurrentBabyState {
  const activeSleep = eventList
    .filter((event) => event.type === 'sleep' && event.endAt === null)
    .sort(byNewestStart)[0];

  if (activeSleep) {
    return {
      state: 'sleep',
      skyTone: 'night',
      eyebrow: 'Asleep',
      timerText: durationLabel(activeSleep.startAt, reference),
      title: 'Sleep started',
      description: `Started ${timeLabel(activeSleep.startAt)} · we'll keep the night quiet`,
      actionLabel: 'Wake baby',
      progress: elapsedProgress(activeSleep.startAt, reference, 200),
    };
  }

  const activeFeed = eventList
    .filter((event) => event.type === 'feed' && event.endAt === null)
    .sort(byNewestStart)[0];

  if (activeFeed) {
    return {
      state: 'feed',
      skyTone: 'day',
      eyebrow: 'Feeding',
      timerText: durationLabel(activeFeed.startAt, reference),
      title: 'Feed started',
      description: `${activeFeed.meta.side ?? 'Side'} side · ${durationLabel(activeFeed.startAt, reference)} in`,
      actionLabel: 'End feed',
      progress: elapsedProgress(activeFeed.startAt, reference, 35),
    };
  }

  const latestDiaper = eventList.filter((event) => event.type === 'diaper').sort(byNewestStart)[0];
  const latestDiaperAgeMinutes = latestDiaper
    ? (reference.getTime() - new Date(latestDiaper.startAt).getTime()) / 60000
    : Infinity;

  if (latestDiaper && latestDiaperAgeMinutes <= 30) {
    return {
      state: 'diaper',
      skyTone: 'day',
      eyebrow: 'Just logged',
      timerText: 'Done',
      title: 'Diaper logged',
      description: `${latestDiaper.meta.kind ?? 'Change'} · added to tonight`,
      actionLabel: 'Done',
      progress: 1,
      coreKind: 'check',
    };
  }

  return {
    state: 'sleep',
    skyTone: 'night',
    eyebrow: 'All quiet',
    timerText: 'Quiet',
    title: 'All quiet',
    description: 'Tap to log the first feed when the night starts moving.',
    actionLabel: 'Start sleep',
    progress: 0.08,
  };
}

/* ------------------------------------------------------------------ *
 * Derived current-night status (Phase 1).
 *
 * A pure, structured summary computed from the LIVE event list — no canned
 * values, no React, no side effects. Tonight uses this to fill the orb's
 * existing fields with real numbers; later phases can render it directly.
 * ------------------------------------------------------------------ */

export type NightStatus = {
  /** sleeping while a sleep interval is running, otherwise awake */
  babyStatus: 'awake' | 'sleeping';
  /** minutes the current running sleep has lasted (only when sleeping) */
  sleepingForMin?: number;
  /** ISO start of the current running sleep (only when sleeping) */
  sleepStartedAt?: string;
  /** minutes since the most recent feed was logged, if any */
  lastFeedAgoMin?: number;
  /** minutes since the most recent diaper was logged, if any */
  lastDiaperAgoMin?: number;
};

function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

function newestByCreatedAt(eventList: LogEvent[], type: LogEvent['type']): LogEvent | undefined {
  return eventList
    .filter((event) => event.type === type)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

/** Real current-night status derived from live events (Phase 1). */
export function deriveNightStatus(eventList: LogEvent[], now: number = Date.now()): NightStatus {
  const runningSleep = eventList
    .filter((event) => event.type === 'sleep' && event.endAt === null)
    .sort(byNewestStart)[0];

  const lastFeed = newestByCreatedAt(eventList, 'feed');
  const lastDiaper = newestByCreatedAt(eventList, 'diaper');

  return {
    babyStatus: runningSleep ? 'sleeping' : 'awake',
    sleepingForMin: runningSleep ? minutesSince(runningSleep.startAt, now) : undefined,
    sleepStartedAt: runningSleep?.startAt,
    lastFeedAgoMin: lastFeed ? minutesSince(lastFeed.createdAt, now) : undefined,
    lastDiaperAgoMin: lastDiaper ? minutesSince(lastDiaper.createdAt, now) : undefined,
  };
}

/** "h:mm ago" / "m ago" for an elapsed minute count. */
function agoLabel(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m ago`;
  }
  return `${mins}m ago`;
}

/**
 * A calm one-line status for the orb's calm state, e.g.
 * "Last feed 2h 45m ago · Last diaper 1h 10m ago". Returns null when nothing is
 * logged yet so the caller keeps the canned "Tap a tile…" copy.
 */
export function calmDescription(status: NightStatus): string | null {
  const parts: string[] = [];
  if (status.lastFeedAgoMin != null) parts.push(`Last feed ${agoLabel(status.lastFeedAgoMin)}`);
  if (status.lastDiaperAgoMin != null) parts.push(`Last diaper ${agoLabel(status.lastDiaperAgoMin)}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
