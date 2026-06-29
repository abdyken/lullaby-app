import type { OrbCoreKind, OrbSky, OrbStateIconKind } from '@/components/OrbHero';
import type { Caregiver, LogEvent } from '@/data/models';
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
  stateIcon?: OrbStateIconKind;
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
  skyTone: 'day',
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

  // Feed / diaper: keep the canned confirmation visuals but make the copy tell
  // the truth about the event the user just saved (side / kind), instead of the
  // fixed preview text. Only title + description change; the orb visuals stay.
  if (view === 'feed') {
    const latestFeed = newestByCreatedAt(eventList, 'feed');
    if (latestFeed) {
      return {
        ...base,
        title: 'Feed logged',
        description: `${feedDetailLabel(latestFeed.meta.side)} · added to tonight`,
      };
    }
  }

  if (view === 'diaper') {
    const latestDiaper = newestByCreatedAt(eventList, 'diaper');
    if (latestDiaper) {
      return {
        ...base,
        title: 'Diaper logged',
        description: `${diaperDetailLabel(latestDiaper.meta.kind)} · added to tonight`,
      };
    }
  }

  return base;
}

/** Hero detail for a feed: side L/R, or "Bottle" when no side was recorded. */
function feedDetailLabel(side: 'L' | 'R' | undefined): string {
  if (side === 'L') return 'Left side';
  if (side === 'R') return 'Right side';
  return 'Bottle';
}

/** Hero detail for a diaper: Wet / Dirty / Mixed (mixed = 'both' in the model). */
function diaperDetailLabel(kind: 'wet' | 'dirty' | 'both' | undefined): string {
  if (kind === 'dirty') return 'Dirty';
  if (kind === 'both') return 'Mixed';
  return 'Wet';
}

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
  eventList: LogEvent[] = [],
  reference: Date = new Date(),
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
    skyTone: 'day',
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

/* ------------------------------------------------------------------ *
 * Night recap (Phase 6) — a calm, NON-medical summary of what was logged,
 * read by the Reassure morning recap. Pure: events → counts + longest
 * COMPLETED sleep stretch. Deliberately not a dashboard and not a judgement:
 * no scoring, no prediction, no "normal/abnormal", no health claims. It only
 * counts what the parent already chose to log.
 * ------------------------------------------------------------------ */

export type NightRecap = {
  feedCount: number;
  diaperCount: number;
  noteCount: number;
  /** minutes of the longest COMPLETED sleep stretch, if any has finished */
  longestSleepMin?: number;
  /** a sleep interval is currently running (started, not yet ended) */
  sleepRunning: boolean;
  /** true when nothing at all has been logged */
  isEmpty: boolean;
};

/** Tally the local events into a calm recap. UI-free and side-effect-free. */
export function buildNightRecap(eventList: LogEvent[]): NightRecap {
  let feedCount = 0;
  let diaperCount = 0;
  let noteCount = 0;
  let longestSleepMin: number | undefined;
  let sleepRunning = false;

  for (const event of eventList) {
    switch (event.type) {
      case 'feed':
        feedCount += 1;
        break;
      case 'diaper':
        diaperCount += 1;
        break;
      case 'note':
        noteCount += 1;
        break;
      case 'sleep':
        if (event.endAt === null) {
          sleepRunning = true;
        } else {
          const mins = Math.max(
            0,
            Math.round((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60000),
          );
          if (longestSleepMin == null || mins > longestSleepMin) longestSleepMin = mins;
        }
        break;
      default:
        break;
    }
  }

  return { feedCount, diaperCount, noteCount, longestSleepMin, sleepRunning, isEmpty: eventList.length === 0 };
}

/** "1h 12m" / "45m" for a minute count — the recap's compact duration form. */
function durationWords(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }
  return `${mins}m`;
}

/**
 * The single calm recap line, e.g. "3 feeds · 2 diaper changes · longest sleep
 * 1h 12m". Counts are omitted when zero; the longest COMPLETED sleep is shown
 * when one exists, otherwise a running sleep reads "sleep currently running".
 * Returns null when nothing countable was logged so the caller can show its
 * calm empty copy. Non-medical by construction — counts only, no judgement.
 */
export function recapSummaryLine(recap: NightRecap): string | null {
  const parts: string[] = [];
  if (recap.feedCount > 0) parts.push(`${recap.feedCount} feed${recap.feedCount === 1 ? '' : 's'}`);
  if (recap.diaperCount > 0) {
    parts.push(`${recap.diaperCount} diaper change${recap.diaperCount === 1 ? '' : 's'}`);
  }
  if (recap.noteCount > 0) parts.push(`${recap.noteCount} note${recap.noteCount === 1 ? '' : 's'}`);
  if (recap.longestSleepMin != null) {
    parts.push(`longest sleep ${durationWords(recap.longestSleepMin)}`);
  } else if (recap.sleepRunning) {
    parts.push('sleep currently running');
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/* ------------------------------------------------------------------ *
 * Partner handoff (P0) — "are both parents in the loop, and who handled the
 * last thing?" Pure: events → the caregiver who logged the newest event + a
 * calm word for what it was. Local-only; implies nothing about realtime/cloud
 * sync. The card resolves the caregiver's name/color from this id.
 * ------------------------------------------------------------------ */

export type HandoffSummary = {
  /** caregiver id who logged the newest event (null when nothing is logged) */
  caregiverId: string | null;
  /** calm event word: 'feed' | 'diaper' | 'sleep start' | 'sleep' | 'note' */
  eventLabel: string | null;
};

/** Calm, non-technical word for the handoff line, by event type. */
function handoffLabelFor(event: LogEvent): string {
  switch (event.type) {
    case 'feed':
      return 'feed';
    case 'diaper':
      return 'diaper';
    case 'sleep':
      return event.endAt === null ? 'sleep start' : 'sleep';
    case 'note':
      return 'note';
    default:
      return 'log';
  }
}

/** Who handled the newest event (by createdAt) and what it was. UI-free. */
export function deriveHandoff(eventList: LogEvent[]): HandoffSummary {
  if (eventList.length === 0) return { caregiverId: null, eventLabel: null };
  const latest = [...eventList].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
  return { caregiverId: latest.caregiverId, eventLabel: handoffLabelFor(latest) };
}

/* ------------------------------------------------------------------ *
 * Handoff summary (the wedge) — "what happened since you last checked?"
 *
 * Pure: (events, caregivers, currentCaregiverId, since-cursor) → one calm,
 * FACTUAL line. Strictly descriptive: counts of what was logged + whether a
 * sleep is running + who logged it. No medical advice, no predictions, no
 * "normal/abnormal", no AI. The cursor (`since`, epoch ms or null) is owned by
 * the caller (device-local); this function never reads storage or the clock
 * except for the optional `now` used to phrase a fresh sleep-start.
 * ------------------------------------------------------------------ */

export type HandoffSummaryResult = {
  /** true when there is at least one event newer than the cursor */
  hasNew: boolean;
  /** the calm, ready-to-render summary line */
  text: string;
  feedCount: number;
  diaperCount: number;
  noteCount: number;
  /** completed sleep stretches in the new window */
  completedSleepCount: number;
  /** a sleep interval is currently running (from the full event list) */
  sleepRunning: boolean;
};

function caregiverDisplayName(caregivers: Caregiver[], id: string): string | null {
  const match = caregivers.find((c) => c.id === id);
  return match ? match.displayName : null;
}

/** "1 feed" / "2 feeds". */
function countWord(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Natural-language join: ["a","b","c"] → "a, b and c". */
function joinClause(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Build the calm handoff summary for the current caregiver. Events with
 * `createdAt` strictly after `since` are "new"; a null cursor treats everything
 * as new (a first, un-acknowledged view). Attribution is phrased carefully:
 *  - all new events are mine        → "You logged …"
 *  - all by one other, name known   → "Dad logged …"
 *  - mixed, or name unknown         → "While you were away: …"
 * A running sleep is appended as "Sleep is running."; if the ONLY new thing is a
 * fresh sleep start, it reads "Dad started sleep 42m ago."
 */
export function buildHandoffSummary(
  eventList: LogEvent[],
  caregivers: Caregiver[],
  currentCaregiverId: string | null,
  since: number | null,
  now: number = Date.now(),
): HandoffSummaryResult {
  const isNew = (e: LogEvent): boolean =>
    since == null ? true : new Date(e.createdAt).getTime() > since;
  const newEvents = eventList.filter(isNew);

  let feedCount = 0;
  let diaperCount = 0;
  let noteCount = 0;
  let completedSleepCount = 0;
  for (const event of newEvents) {
    switch (event.type) {
      case 'feed':
        feedCount += 1;
        break;
      case 'diaper':
        diaperCount += 1;
        break;
      case 'note':
        noteCount += 1;
        break;
      case 'sleep':
        if (event.endAt !== null) completedSleepCount += 1;
        break;
      default:
        break;
    }
  }

  // Running sleep is a current-state fact (from the full list), useful even if it
  // started before the cursor.
  const runningSleep = eventList
    .filter((e) => e.type === 'sleep' && e.endAt === null)
    .sort(byNewestStart)[0];
  const sleepRunning = runningSleep != null;

  if (newEvents.length === 0) {
    return {
      hasNew: false,
      text: since == null ? 'No activity to catch up on yet.' : 'Nothing new since you last checked.',
      feedCount: 0,
      diaperCount: 0,
      noteCount: 0,
      completedSleepCount: 0,
      sleepRunning,
    };
  }

  // Attribution across the new events.
  const ids = Array.from(new Set(newEvents.map((e) => e.caregiverId)));
  const allMine = currentCaregiverId != null && ids.length === 1 && ids[0] === currentCaregiverId;
  const singleOtherId = ids.length === 1 && ids[0] !== currentCaregiverId ? ids[0] : null;
  const singleOtherName = singleOtherId ? caregiverDisplayName(caregivers, singleOtherId) : null;
  const newRunningSleep = runningSleep && isNew(runningSleep) ? runningSleep : undefined;

  const parts: string[] = [];
  if (feedCount > 0) parts.push(countWord(feedCount, 'feed'));
  if (diaperCount > 0) parts.push(countWord(diaperCount, 'diaper'));
  if (noteCount > 0) parts.push(countWord(noteCount, 'note'));
  if (completedSleepCount > 0) parts.push(countWord(completedSleepCount, 'sleep'));

  // Only a fresh sleep start, nothing else counted → phrase it on its own.
  if (parts.length === 0 && newRunningSleep) {
    const who = allMine ? 'You' : (singleOtherName ?? 'A caregiver');
    return {
      hasNew: true,
      text: `${who} started sleep ${agoLabel(minutesSince(newRunningSleep.startAt, now))}.`,
      feedCount,
      diaperCount,
      noteCount,
      completedSleepCount,
      sleepRunning: true,
    };
  }

  // Defensive: new events but nothing we count or a running start (shouldn't
  // normally happen) → a calm generic line.
  if (parts.length === 0) {
    return {
      hasNew: true,
      text: "There's new activity since you last checked.",
      feedCount,
      diaperCount,
      noteCount,
      completedSleepCount,
      sleepRunning,
    };
  }

  const body = joinClause(parts);
  const prefix = allMine ? 'You logged ' : singleOtherName ? `${singleOtherName} logged ` : 'While you were away: ';
  let text = `${prefix}${body}`;
  if (sleepRunning) text += '. Sleep is running';
  text += '.';

  return { hasNew: true, text, feedCount, diaperCount, noteCount, completedSleepCount, sleepRunning };
}

/* ------------------------------------------------------------------ *
 * Tonight status strip (P0.5) — the #1 night question, answered at a glance:
 * "when did she last eat / change / how long asleep?". Pure: events → three
 * descriptive items. Reuses deriveNightStatus. Strictly descriptive — no goals,
 * targets, predictions, or judgement (no "normal/soon/healthy").
 * ------------------------------------------------------------------ */

export type TonightStatusItem = {
  key: 'feed' | 'diaper' | 'sleep';
  /** short top label, e.g. "Last feed" / "Sleeping" / "Awake" */
  label: string;
  /** the value below, e.g. "1h 12m ago" / "38m" / "now" / "None yet" */
  value: string;
};

/**
 * Three calm status items for the Tonight strip:
 *  - Last feed   → "1h 12m ago" (or "None yet")
 *  - Last diaper → "42m ago"    (or "None yet")
 *  - Sleep       → "Sleeping 38m" / "Awake now" (label + value split)
 */
export function buildTonightStatus(
  eventList: LogEvent[],
  now: number = Date.now(),
): TonightStatusItem[] {
  const status = deriveNightStatus(eventList, now);

  const sleep =
    status.babyStatus === 'sleeping'
      ? { label: 'Sleeping', value: durationWords(status.sleepingForMin ?? 0) }
      : { label: 'Awake', value: 'now' };

  return [
    {
      key: 'feed',
      label: 'Last feed',
      value: status.lastFeedAgoMin != null ? agoLabel(status.lastFeedAgoMin) : 'None yet',
    },
    {
      key: 'diaper',
      label: 'Last diaper',
      value: status.lastDiaperAgoMin != null ? agoLabel(status.lastDiaperAgoMin) : 'None yet',
    },
    { key: 'sleep', label: sleep.label, value: sleep.value },
  ];
}

/**
 * Honest, calm age label for the Tonight greeting (`BabyHeader`). "Newborn" in
 * the first week (no clinical "0 weeks old" for a brand-new baby), singular "1
 * week old", else "N weeks old". Clamps negative / non-finite weeks to Newborn.
 */
export function formatBabyAge(weeks: number): string {
  const wholeWeeks = Number.isFinite(weeks) ? Math.max(0, Math.floor(weeks)) : 0;
  if (wholeWeeks < 1) return 'Newborn';
  if (wholeWeeks === 1) return '1 week old';
  return `${wholeWeeks} weeks old`;
}

/* ------------------------------------------------------------------ *
 * Quick-log card secondary copy.
 *
 * A short, descriptive second line for each large quick-action card (Feed /
 * Sleep / Diaper / Pump). Pure: derived from the live events, no canned numbers,
 * no targets or judgement — just "what was the last one, and when". Kept concise
 * so it never wraps on a half-width card.
 * ------------------------------------------------------------------ */

export type QuickLogMeta = { feed: string; sleep: string; diaper: string; pump: string };

/** Short feed side for a card line: "Left" / "Right" / "Bottle". */
function feedSideShort(side: 'L' | 'R' | undefined): string {
  if (side === 'L') return 'Left';
  if (side === 'R') return 'Right';
  return 'Bottle';
}

export function buildQuickLogMeta(eventList: LogEvent[], now: number = Date.now()): QuickLogMeta {
  const lastFeed = newestByCreatedAt(eventList, 'feed');
  const runningSleep = eventList
    .filter((event) => event.type === 'sleep' && event.endAt === null)
    .sort(byNewestStart)[0];
  const lastSleep = eventList
    .filter((event) => event.type === 'sleep' && event.endAt !== null)
    .sort(byNewestStart)[0];
  const lastDiaper = newestByCreatedAt(eventList, 'diaper');
  const lastPump = newestByCreatedAt(eventList, 'pump');

  return {
    feed: lastFeed
      ? `${feedSideShort(lastFeed.meta.side)} · ${agoLabel(minutesSince(lastFeed.createdAt, now))}`
      : 'Tap to log',
    sleep: runningSleep
      ? 'Sleep running'
      : lastSleep && lastSleep.endAt
        ? `Last nap ${durationLabel(lastSleep.startAt, new Date(lastSleep.endAt))}`
        : 'Tap to start',
    diaper: lastDiaper
      ? `${diaperDetailLabel(lastDiaper.meta.kind)} · ${agoLabel(minutesSince(lastDiaper.createdAt, now))}`
      : 'Tap to log',
    pump: lastPump ? agoLabel(minutesSince(lastPump.createdAt, now)) : 'Log pump',
  };
}
