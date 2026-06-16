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

import type { Baby, BabyCaregiver, Caregiver, LogEvent } from './models';

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

function clockLabel(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCHours()}:${date.getUTCMinutes().toString().padStart(2, '0')}`;
}

function intervalMinutes(startAt: string, endAt: string): number {
  return Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000));
}

function entryLabel(event: LogEvent): string {
  switch (event.type) {
    case 'feed': {
      const side = event.meta.side === 'L' ? 'left' : event.meta.side === 'R' ? 'right' : null;
      if (event.endAt) {
        const mins = intervalMinutes(event.startAt, event.endAt);
        return side ? `Feed · ${side}, ${mins}m` : `Feed · ${mins}m`;
      }
      return 'Feed in progress';
    }
    case 'sleep':
      return event.endAt ? `Sleep · ${intervalMinutes(event.startAt, event.endAt)}m` : 'Sleep running';
    case 'diaper':
      return `Diaper · ${event.meta.kind ?? 'change'}`;
    case 'pump':
      return event.meta.amountMl ? `Pump · ${event.meta.amountMl} ml` : 'Pump';
    default:
      return 'Logged';
  }
}

/**
 * Tonight's events as display-ready rows, newest first. Reads the same in-memory
 * store as the orb. A running interval (feed/sleep with no endAt) reads "Now".
 */
export function getTonightTimeline(): TimelineEntry[] {
  return [...events]
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
    .map((event) => {
      const caregiver = getCaregiver(event.caregiverId);
      const running = event.endAt === null && (event.type === 'feed' || event.type === 'sleep');
      return {
        id: event.id,
        time: running ? 'Now' : clockLabel(event.startAt),
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
