/**
 * Reassure recap — code-computed tallies over the parent's saved logs for the
 * night window. This is the grounding layer: the numbers are ALWAYS computed
 * here in code; no LLM ever produces or edits a tally. (In Phase 2 an LLM may
 * rephrase the read text — Pro-gated, with recapReadText as the instant,
 * always-available fallback.)
 *
 * Reads canonical CareEvents. Legacy note rows are mapped into this shape by
 * the logging compatibility layer before they reach Reassure.
 *
 * PURE LEAF: type-only imports from app modules (tsx smoke-runner rule).
 */

import type { CareEvent } from '@/features/logging/domain/types';
import { nightWindowFor } from './nightWindow';
import type { ReassureNightRecap } from './types';

/**
 * UI label for the note preset. The recap itself counts canonical
 * `details.noteType === 'spit_up'`, so tally logic never depends on this text.
 */
export const SPITUP_NOTE_LABEL = 'Spit-up';

const MINUTE_MS = 60_000;

function inWindow(iso: string, startMs: number, endMs: number): boolean {
  const t = Date.parse(iso);
  return t >= startMs && t <= endMs;
}

function eventAnchor(event: CareEvent): string {
  return event.startedAt ?? event.occurredAt;
}

export function buildReassureRecap(events: CareEvent[], now: number): ReassureNightRecap {
  const window = nightWindowFor(now);
  const { startMs, endMs } = window;

  let feedCount = 0;
  let diaperCount = 0;
  let spitUpCount = 0;
  let otherNoteCount = 0;
  let longestSleepMs = 0;
  let sleepRunning = false;

  for (const event of events) {
    switch (event.type) {
      case 'feed':
        if (inWindow(eventAnchor(event), startMs, endMs)) feedCount += 1;
        break;
      case 'diaper':
        if (inWindow(event.occurredAt, startMs, endMs)) diaperCount += 1;
        break;
      case 'note':
        if (inWindow(event.occurredAt, startMs, endMs)) {
          if (event.details.noteType === 'spit_up') spitUpCount += 1;
          else otherNoteCount += 1;
        }
        break;
      case 'sleep': {
        // Sleeps count when they OVERLAP the window (a sleep that began before
        // 18:00 but ran into the night still belongs to the night).
        const sleepStart = Date.parse(event.startedAt ?? event.occurredAt);
        const sleepEnd = event.endedAt == null ? endMs : Date.parse(event.endedAt);
        if (sleepStart <= endMs && sleepEnd >= startMs) {
          if (event.status === 'active' && event.endedAt == null) sleepRunning = true;
          const overlapDuration = sleepEnd - sleepStart;
          if (overlapDuration > longestSleepMs) longestSleepMs = overlapDuration;
        }
        break;
      }
      case 'pump':
        // Pump belongs to the caregiver, not the baby's night read — excluded.
        break;
    }
  }

  const longestSleepMin =
    longestSleepMs > 0 ? Math.max(1, Math.round(longestSleepMs / MINUTE_MS)) : undefined;

  return {
    window,
    feedCount,
    diaperCount,
    spitUpCount,
    otherNoteCount,
    longestSleepMin,
    sleepRunning,
    isEmpty:
      feedCount === 0 &&
      diaperCount === 0 &&
      spitUpCount === 0 &&
      otherNoteCount === 0 &&
      longestSleepMin === undefined &&
      !sleepRunning,
  };
}

function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/**
 * The strictly DESCRIPTIVE read used in Phase 1 (and as the Phase-2 fallback).
 * Restates counts only — no "normal", no judgement, no interpretation. That
 * register is enforced by a smoke tripwire (§X): interpretive language is a
 * clinician-owned Phase-2 concern, never template text.
 */
export function recapReadText(recap: ReassureNightRecap): string {
  const opener = recap.window.label === 'tonight' ? 'Since 6pm' : 'For the 6pm-10am window';

  if (recap.isEmpty) {
    return `${opener} there are no saved logs yet. Your recap builds itself from every feed, sleep, diaper, or note you save.`;
  }

  const parts: string[] = [];
  if (recap.feedCount > 0) parts.push(plural(recap.feedCount, 'feed'));
  if (recap.diaperCount > 0) parts.push(plural(recap.diaperCount, 'diaper change'));
  if (recap.spitUpCount > 0) parts.push(plural(recap.spitUpCount, 'small spit-up'));
  if (recap.otherNoteCount > 0) parts.push(plural(recap.otherNoteCount, 'note'));

  const listed =
    parts.length > 1
      ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
      : (parts[0] ?? '');

  const sentences: string[] = [];
  sentences.push(
    listed.length > 0 ? `${opener} you've logged ${listed}.` : `${opener} you've logged sleep.`,
  );
  if (recap.sleepRunning) {
    sentences.push('A sleep is running right now.');
  } else if (recap.longestSleepMin !== undefined) {
    sentences.push(`Longest sleep: ${recap.longestSleepMin} min.`);
  }
  return sentences.join(' ');
}

/** Short label for the recap chip — descriptive source note, never a verdict. */
export function recapWindowLabel(recap: ReassureNightRecap): string {
  return recap.window.label === 'tonight' ? 'Since 6pm' : 'Morning recap';
}
