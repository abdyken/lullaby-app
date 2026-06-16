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
