/**
 * Local mock store + seed data for the foundation stage.
 *
 * In-memory only for now — no persistence, no backend. The whole night loop is
 * meant to be demoable with zero backend (§7). When Supabase arrives it
 * implements the same read shape, so screens won't change.
 *
 * Seed: baby Mia (7 weeks old), caregivers Mom + Dad, and a few sample
 * "tonight" events (sleep, feed, diaper).
 */

import type { Baby, BabyCaregiver, Caregiver, LogEvent, LogEventType } from './models';

const BABY_ID = 'baby-mia';
const MOM_ID = 'cg-mom';
const DAD_ID = 'cg-dad';

/** Birth date for a ~7-week-old as of mid-June 2026 (hardcoded for the stub). */
export const baby: Baby = {
  id: BABY_ID,
  name: 'Mia',
  birthDate: '2026-04-28',
  avatarKey: 'default',
  createdBy: MOM_ID,
};

export const caregivers: Caregiver[] = [
  { id: MOM_ID, displayName: 'Mom', colorHex: '#FF9E5E', role: 'mom' },
  { id: DAD_ID, displayName: 'Dad', colorHex: '#5560C6', role: 'dad' },
];

export const babyCaregivers: BabyCaregiver[] = [
  { babyId: BABY_ID, caregiverId: MOM_ID, role: 'mom' },
  { babyId: BABY_ID, caregiverId: DAD_ID, role: 'dad' },
];

/**
 * Sample events from "tonight", built RELATIVE to "now" (minutes ago) rather
 * than at fixed calendar timestamps. A fixed running sleep would, by demo day,
 * read as an absurd stale duration (e.g. "36h" — clipped inside the orb). By
 * anchoring the seed to the launch moment, a fresh launch always feels like a
 * live newborn night: a recent running sleep with a small, readable orb timer,
 * preceded by a feed and a diaper a little earlier in the night.
 *
 * Offsets are minutes-before-now. The running sleep starts ~1h ago so the orb
 * timer stays compact; the sleep duration is deliberately not the canned "1h
 * 12m" preview value so the orb shows a real elapsed time.
 */
const SEED_OFFSETS_MIN = {
  feedStart: 134,
  feedEnd: 123,
  diaper: 96,
  sleepStart: 68,
} as const;

function isoMinutesAgo(now: number, minutes: number): string {
  return new Date(now - minutes * 60_000).toISOString();
}

/**
 * Build the seed events relative to `now` (defaults to the real launch moment).
 * Kept as a builder so tests can pin `now` for deterministic results while the
 * app gets a fresh, live-feeling seed on every cold start.
 */
export function buildSeedEvents(now: number = Date.now()): LogEvent[] {
  return [
    {
      id: 'evt-feed-1',
      babyId: BABY_ID,
      caregiverId: MOM_ID,
      type: 'feed',
      startAt: isoMinutesAgo(now, SEED_OFFSETS_MIN.feedStart),
      endAt: isoMinutesAgo(now, SEED_OFFSETS_MIN.feedEnd),
      meta: { side: 'L' },
      createdAt: isoMinutesAgo(now, SEED_OFFSETS_MIN.feedEnd),
    },
    {
      id: 'evt-diaper-1',
      babyId: BABY_ID,
      caregiverId: DAD_ID,
      type: 'diaper',
      startAt: isoMinutesAgo(now, SEED_OFFSETS_MIN.diaper),
      endAt: null,
      meta: { kind: 'wet' },
      createdAt: isoMinutesAgo(now, SEED_OFFSETS_MIN.diaper),
    },
    {
      id: 'evt-sleep-1',
      babyId: BABY_ID,
      caregiverId: MOM_ID,
      type: 'sleep',
      startAt: isoMinutesAgo(now, SEED_OFFSETS_MIN.sleepStart),
      endAt: null,
      meta: {},
      createdAt: isoMinutesAgo(now, SEED_OFFSETS_MIN.sleepStart),
    },
  ];
}

export const events: LogEvent[] = buildSeedEvents();

/** Convenience lookups used by the placeholder screens. */
export function getCaregiver(id: string): Caregiver | undefined {
  return caregivers.find((c) => c.id === id);
}

/** A display-ready timeline row (decoupled from the raw LogEvent shape so the
 *  TimelineCard stays dumb). The Log tab will read the same builder later. */
export type TimelineEntry = {
  id: string;
  /** "Now" for a running interval, otherwise a "h:mm" clock label */
  time: string;
  kind: LogEvent['type'];
  /** human label, e.g. "Nursing · 11 min · L" / "Diaper · wet" / "Sleep in progress" */
  label: string;
  /** Optional second-line detail, used when a logged event has a meaningful breakdown. */
  detail?: string;
  caregiverName: string | null;
  caregiverColor: string | null;
};

/** Show recently-created events as "Now" instead of a clock time. */
const DISPLAY_NOW_MS = 120_000;

function clockLabel(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCHours()}:${date.getUTCMinutes().toString().padStart(2, '0')}`;
}

function minutesToLabel(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }
  return `${mins}m`;
}

function intervalMinutes(startAt: string, endAt: string): number {
  return Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000));
}

function feedDurationLabel(mins: number): string {
  if (mins >= 60) return minutesToLabel(mins);
  return `${mins} min`;
}

function entryLabel(event: LogEvent): string {
  switch (event.type) {
    case 'feed': {
      if (event.endAt) {
        if (event.meta.amountMl != null) return `Bottle · ${event.meta.amountMl} ml`;

        const duration = feedDurationLabel(intervalMinutes(event.startAt, event.endAt));
        if (event.meta.side === 'L' || event.meta.side === 'R') {
          return `Nursing · ${duration} · ${event.meta.side}`;
        }
        return `Bottle · ${duration}`;
      }
      return event.meta.side ? `Nursing in progress · ${event.meta.side}` : 'Feed in progress';
    }
    case 'sleep':
      return event.endAt ? `Sleep · ${minutesToLabel(intervalMinutes(event.startAt, event.endAt))}` : 'Sleep in progress';
    case 'diaper':
      return `Diaper · ${event.meta.kind ?? 'change'}`;
    case 'pump':
      return event.meta.amountMl ? `Pump · ${event.meta.amountMl} ml` : 'Pump';
    case 'note': {
      const text = event.meta.label ?? event.meta.note;
      return text ? `Note · ${text}` : 'Note';
    }
    default:
      return 'Logged';
  }
}

/**
 * Tonight's events as display-ready rows, newest first (by when they were
 * logged). Reads whatever event list it's given (defaults to the seed). A row
 * reads "Now" if it's a running interval or was logged in the last 2 minutes;
 * otherwise it shows the clock time it happened.
 */
export function getTonightTimeline(eventList: LogEvent[] = events, now: number = Date.now()): TimelineEntry[] {
  return [...eventList]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((event) => {
      const caregiver = getCaregiver(event.caregiverId);
      const running = event.endAt === null && (event.type === 'feed' || event.type === 'sleep');
      const justLogged = now - new Date(event.createdAt).getTime() < DISPLAY_NOW_MS;
      return {
        id: event.id,
        time: running || justLogged ? 'Now' : clockLabel(event.startAt),
        kind: event.type,
        label: entryLabel(event),
        caregiverName: caregiver?.displayName ?? null,
        caregiverColor: caregiver?.colorHex ?? null,
      };
    });
}

/** Age in whole weeks, derived from birthDate against a reference date. */
export function babyAgeInWeeks(reference: Date): number {
  const born = new Date(baby.birthDate).getTime();
  const ms = reference.getTime() - born;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24 * 7)));
}

/** Total events logged "tonight" (the whole seed, for now). */
export function tonightEventCount(): number {
  return events.length;
}

/* ------------------------------------------------------------------ *
 * Local-only event creation (P0 quick-log interaction).
 *
 * No persistence and no backend — these just mint LogEvent objects the Tonight
 * screen keeps in component state. New events use the REAL current time, so
 * they read "Now" in the timeline (see getTonightTimeline) and feel live,
 * instead of marching fake clock times forward on every tap.
 * ------------------------------------------------------------------ */

/** Don't append another event of the same kind within this window (demo-safe). */
const DUPLICATE_WINDOW_MS = 45_000;

let localCounter = 0;
function nextId(type: LogEventType, now: number): string {
  localCounter += 1;
  return `local-${type}-${now}-${localCounter}`;
}

/** Is a sleep currently running (started, not yet ended)? */
export function hasRunningSleep(list: LogEvent[]): boolean {
  return list.some((e) => e.type === 'sleep' && e.endAt === null);
}

/**
 * Was an event of this kind logged within the last ~45s? Used to swallow rapid
 * repeat taps so the timeline doesn't fill with identical rows.
 */
export function wasLoggedRecently(
  list: LogEvent[],
  kind: LogEventType,
  now: number = Date.now(),
): boolean {
  return list.some((e) => e.type === kind && now - new Date(e.createdAt).getTime() < DUPLICATE_WINDOW_MS);
}

/** Optional detail for a feed (from a later detail/sheet flow). */
export type FeedDetails = { side?: 'L' | 'R'; durationMin?: number; amountMl?: number };

/**
 * A just-finished feed. With no details it defaults to an 8-minute left-side
 * feed → "Nursing · 8 min · L" (preserves the zero-arg quick-log behavior). When
 * details are supplied, only the provided fields are recorded.
 */
export function createFeedEvent(now: number = Date.now(), details?: FeedDetails): LogEvent {
  const d = details ?? { side: 'L' };
  const durationMin = d.durationMin ?? 8;
  const endAt = new Date(now).toISOString();
  const startAt = new Date(now - durationMin * 60_000).toISOString();
  const meta: LogEvent['meta'] = {};
  if (d.side) meta.side = d.side;
  if (d.durationMin != null) meta.durationMin = d.durationMin;
  if (d.amountMl != null) meta.amountMl = d.amountMl;
  return {
    id: nextId('feed', now),
    babyId: baby.id,
    caregiverId: caregivers[0].id,
    type: 'feed',
    startAt,
    endAt,
    meta,
    createdAt: endAt,
  };
}

/** A running sleep (no endAt) → "Sleep in progress", shows "Now". */
export function createSleepEvent(now: number = Date.now()): LogEvent {
  const startAt = new Date(now).toISOString();
  return {
    id: nextId('sleep', now),
    babyId: baby.id,
    caregiverId: caregivers[0].id,
    type: 'sleep',
    startAt,
    endAt: null,
    meta: {},
    createdAt: startAt,
  };
}

/** Optional detail for a diaper (from a later detail/sheet flow). */
export type DiaperDetails = { kind?: 'wet' | 'dirty' | 'both'; note?: string };

/** An instant diaper → "Diaper · wet" by default; kind/note overridable. */
export function createDiaperEvent(now: number = Date.now(), details?: DiaperDetails): LogEvent {
  const startAt = new Date(now).toISOString();
  const meta: LogEvent['meta'] = { kind: details?.kind ?? 'wet' };
  if (details?.note) meta.note = details.note;
  return {
    id: nextId('diaper', now),
    babyId: baby.id,
    caregiverId: caregivers[0].id,
    type: 'diaper',
    startAt,
    endAt: null,
    meta,
    createdAt: startAt,
  };
}

/** Optional detail for a pump (from the Pump sheet). */
export type PumpDetails = { side?: 'L' | 'R' | 'both'; amountMl?: number };

/**
 * An instant pump → "Pump · 90 ml" when an amount is supplied, otherwise "Pump".
 * Side L/R is recorded in meta when given; "both" carries no side (the model's
 * side is L | R only) and just reads as a plain pump in the timeline.
 */
export function createPumpEvent(now: number = Date.now(), details?: PumpDetails): LogEvent {
  const startAt = new Date(now).toISOString();
  const meta: LogEvent['meta'] = {};
  if (details?.side === 'L' || details?.side === 'R') meta.side = details.side;
  if (details?.amountMl != null) meta.amountMl = details.amountMl;
  return {
    id: nextId('pump', now),
    babyId: baby.id,
    caregiverId: caregivers[0].id,
    type: 'pump',
    startAt,
    endAt: null,
    meta,
    createdAt: startAt,
  };
}

/** Optional detail for a note. */
export type NoteDetails = { label?: string; note?: string };

/** An instant note → "Note · Fussy" / "Note · <text>" / "Note". */
export function createNoteEvent(now: number = Date.now(), details?: NoteDetails): LogEvent {
  const startAt = new Date(now).toISOString();
  const meta: LogEvent['meta'] = {};
  if (details?.label) meta.label = details.label;
  if (details?.note) meta.note = details.note;
  return {
    id: nextId('note', now),
    babyId: baby.id,
    caregiverId: caregivers[0].id,
    type: 'note',
    startAt,
    endAt: null,
    meta,
    createdAt: startAt,
  };
}

/**
 * Finalize the running sleep ("Wake baby"). Sets `endAt = now` so the logged
 * duration is the REAL elapsed time (matching the orb's live timer), not a canned
 * value — the previous hardcoded "+72 minutes" was the audit's highest-priority
 * behavioral bug (it logged 1h 12m for every sleep regardless of how long the
 * baby actually slept). `now` is clamped to ≥ `startAt` so a backwards device
 * clock can never produce `endAt < startAt`. Returns a new list (no mutation); a
 * no-op if nothing is running.
 */
export function endRunningSleep(list: LogEvent[], now: number = Date.now()): LogEvent[] {
  let ended = false;
  return list.map((e) => {
    if (!ended && e.type === 'sleep' && e.endAt === null) {
      ended = true;
      const startMs = new Date(e.startAt).getTime();
      const endMs = Math.max(now, Number.isNaN(startMs) ? now : startMs);
      return { ...e, endAt: new Date(endMs).toISOString() };
    }
    return e;
  });
}
