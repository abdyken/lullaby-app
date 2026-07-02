/**
 * Pure core of the night-read function: window math, tally computation, age
 * banding, and the prompt-fact builder. Tallies are computed IN CODE — the
 * model only ever sees these numbers plus a coarse age band (spec §3).
 *
 * IMPORT-FREE ON PURPOSE: the smoke runner (§X19 in
 * scripts/check-local-interactions.ts) require()s this file from Node, so no
 * Deno globals and no npm: imports. `nowMs` is a parameter for the same
 * reason — every function here is deterministic.
 */

export const NIGHT_START_HOUR = 18;
export const NIGHT_LENGTH_HOURS = 16; // 18:00 → 10:00 next day

/** Mirrors src/features/reassure/domain/recap.ts (guarded by smoke §X16). */
export const SPITUP_NOTE_LABEL = 'Spit-up';

export type EventRow = {
  type: 'feed' | 'sleep' | 'diaper' | 'pump' | 'note';
  start_at: string;
  end_at: string | null;
  meta: { label?: string } | null;
};

export type Tallies = {
  feeds: number;
  diapers: number;
  spitUps: number;
  longestSleepMin: number | null;
  sleepRunning: boolean;
};

/** The night window in UTC ms, from the night key + the client's tz offset. */
export function windowFor(
  nightKey: string,
  tzOffsetMinutes: number,
  nowMs: number,
): { startMs: number; endMs: number } {
  const [y, m, d] = nightKey.split('-').map((part) => Number.parseInt(part, 10));
  // Local 18:00 expressed in UTC: UTC = local + tzOffsetMinutes (JS convention).
  const startMs = Date.UTC(y, m - 1, d, NIGHT_START_HOUR, 0) + tzOffsetMinutes * 60_000;
  const endMs = Math.min(nowMs, startMs + NIGHT_LENGTH_HOURS * 3_600_000);
  return { startMs, endMs };
}

export function computeTallies(rows: EventRow[], startMs: number, endMs: number): Tallies {
  let feeds = 0;
  let diapers = 0;
  let spitUps = 0;
  let longestSleepMs = 0;
  let sleepRunning = false;

  for (const row of rows) {
    const t = Date.parse(row.start_at);
    switch (row.type) {
      case 'feed':
        if (t >= startMs && t <= endMs) feeds += 1;
        break;
      case 'diaper':
        if (t >= startMs && t <= endMs) diapers += 1;
        break;
      case 'note':
        if (t >= startMs && t <= endMs && row.meta?.label === SPITUP_NOTE_LABEL) spitUps += 1;
        break;
      case 'sleep': {
        const sleepEnd = row.end_at == null ? endMs : Date.parse(row.end_at);
        if (t <= endMs && sleepEnd >= startMs) {
          if (row.end_at == null) sleepRunning = true;
          longestSleepMs = Math.max(longestSleepMs, sleepEnd - t);
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    feeds,
    diapers,
    spitUps,
    longestSleepMin: longestSleepMs > 0 ? Math.max(1, Math.round(longestSleepMs / 60_000)) : null,
    sleepRunning,
  };
}

export function ageBandFromBirthDate(birthDate: string | null, nowMs: number): string {
  if (!birthDate) return 'unknown age';
  const weeks = Math.max(0, Math.floor((nowMs - Date.parse(birthDate)) / (7 * 24 * 3_600_000)));
  if (weeks < 4) return '0-4 weeks';
  if (weeks < 12) return '1-3 months';
  if (weeks < 26) return '3-6 months';
  if (weeks < 52) return '6-12 months';
  return 'over 12 months';
}

/**
 * The ONLY string that ever reaches the model's user turn — code-built from
 * numeric tallies. The caller still runs the shared red-flag scan over it
 * (belt-and-suspenders; the guard must survive future edits).
 */
export function buildPromptFacts(tallies: Tallies, ageBand: string): string {
  return [
    `Age band: ${ageBand}.`,
    `Feeds logged: ${tallies.feeds}.`,
    `Diaper changes logged: ${tallies.diapers}.`,
    `Spit-up notes logged: ${tallies.spitUps}.`,
    tallies.sleepRunning
      ? 'A sleep is currently running.'
      : tallies.longestSleepMin != null
        ? `Longest sleep logged: ${tallies.longestSleepMin} minutes.`
        : 'No sleep logged yet.',
  ].join(' ');
}
