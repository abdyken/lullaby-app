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
 * Sample events from "tonight" — fixed ISO timestamps (no Date.now so the seed
 * is stable and reproducible). Real timers come with the Tonight screen.
 */
export const events: LogEvent[] = [
  {
    id: 'evt-feed-1',
    babyId: BABY_ID,
    caregiverId: MOM_ID,
    type: 'feed',
    startAt: '2026-06-16T03:10:00.000Z',
    endAt: '2026-06-16T03:21:00.000Z',
    meta: { side: 'L' },
    createdAt: '2026-06-16T03:21:00.000Z',
  },
  {
    id: 'evt-diaper-1',
    babyId: BABY_ID,
    caregiverId: DAD_ID,
    type: 'diaper',
    startAt: '2026-06-16T03:48:00.000Z',
    endAt: null,
    meta: { kind: 'wet' },
    createdAt: '2026-06-16T03:48:00.000Z',
  },
  {
    id: 'evt-sleep-1',
    babyId: BABY_ID,
    caregiverId: MOM_ID,
    type: 'sleep',
    startAt: '2026-06-16T04:12:00.000Z',
    endAt: null,
    meta: {},
    createdAt: '2026-06-16T04:12:00.000Z',
  },
];

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
  /** human label, e.g. "Feed · left, 11m" / "Diaper · wet" / "Sleep running" */
  label: string;
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

function entryLabel(event: LogEvent): string {
  switch (event.type) {
    case 'feed': {
      const side = event.meta.side === 'L' ? 'left' : event.meta.side === 'R' ? 'right' : null;
      if (event.endAt) {
        const mins = minutesToLabel(intervalMinutes(event.startAt, event.endAt));
        return side ? `Feed · ${side}, ${mins}` : `Feed · ${mins}`;
      }
      return 'Feed in progress';
    }
    case 'sleep':
      return event.endAt ? `Sleep · ${minutesToLabel(intervalMinutes(event.startAt, event.endAt))}` : 'Sleep running';
    case 'diaper':
      return `Diaper · ${event.meta.kind ?? 'change'}`;
    case 'pump':
      return event.meta.amountMl ? `Pump · ${event.meta.amountMl} ml` : 'Pump';
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
/** Canned sleep duration finalized on "Wake baby" (matches the orb's 1h 12m). */
const SLEEP_FINALIZE_MIN = 72;

let localCounter = 0;
function nextId(type: LogEventType): string {
  localCounter += 1;
  return `local-${type}-${localCounter}`;
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

/** A just-finished 8-minute left-side feed → "Feed · left, 8m". */
export function createFeedEvent(now: number = Date.now()): LogEvent {
  const endAt = new Date(now).toISOString();
  const startAt = new Date(now - 8 * 60_000).toISOString();
  return {
    id: nextId('feed'),
    babyId: baby.id,
    caregiverId: caregivers[0].id,
    type: 'feed',
    startAt,
    endAt,
    meta: { side: 'L' },
    createdAt: endAt,
  };
}

/** A running sleep (no endAt) → "Sleep running", shows "Now". */
export function createSleepEvent(now: number = Date.now()): LogEvent {
  const startAt = new Date(now).toISOString();
  return {
    id: nextId('sleep'),
    babyId: baby.id,
    caregiverId: caregivers[0].id,
    type: 'sleep',
    startAt,
    endAt: null,
    meta: {},
    createdAt: startAt,
  };
}

/** An instant wet diaper → "Diaper · wet". */
export function createDiaperEvent(now: number = Date.now()): LogEvent {
  const startAt = new Date(now).toISOString();
  return {
    id: nextId('diaper'),
    babyId: baby.id,
    caregiverId: caregivers[0].id,
    type: 'diaper',
    startAt,
    endAt: null,
    meta: { kind: 'wet' },
    createdAt: startAt,
  };
}

/**
 * Finalize the running sleep ("Wake baby"). Sets endAt so the row stops reading
 * "Sleep running" and shows a clean "Sleep · 1h 12m". Returns a new list (no
 * mutation); a no-op if nothing is running.
 */
export function endRunningSleep(list: LogEvent[]): LogEvent[] {
  let ended = false;
  return list.map((e) => {
    if (!ended && e.type === 'sleep' && e.endAt === null) {
      ended = true;
      return {
        ...e,
        endAt: new Date(new Date(e.startAt).getTime() + SLEEP_FINALIZE_MIN * 60_000).toISOString(),
      };
    }
    return e;
  });
}
