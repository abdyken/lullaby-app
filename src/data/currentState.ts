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

export function getCurrentBabyState(reference: Date = DEMO_NOW): CurrentBabyState {
  const activeSleep = events
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

  const activeFeed = events
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

  const latestDiaper = events.filter((event) => event.type === 'diaper').sort(byNewestStart)[0];
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
