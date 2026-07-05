/**
 * Logging v2 — timeline + quick-log presentation selectors (plan §7.1, §7.4).
 *
 * Pure derivations over `CareEvent`s for the rendered Today screen:
 *   - `formatTimelineEvent` — the plan §7.4 contract: one formatter that turns any
 *     `CareEvent` into `{ title, subtitle, icon, tint }`, so the timeline reads a
 *     single `CareEvent[]` and never hand-checks `type`/`method`.
 *   - `buildV2QuickLogSubtitles` — the plan §7.1 quick-log card second lines
 *     ("Feeding · 12m · right", "Sleeping · 42m", "Pumping · 18m · both",
 *     "Finished · add volume", "4h 20m ago · 90 ml").
 *   - `buildV2TonightStatus` — the compact "time since last…" strip, v2 source.
 *
 * The subtitle is built by a selector, not inside the card (plan §7.1). No React,
 * no I/O — every duration is recomputed from timestamps via `sessionMath`, so this
 * is unit-testable under the Node smoke test. `@/theme` is import-safe under Node
 * (the smoke test already imports it), so the §7.4 `tint` comes from there.
 */
import { colors } from '../../../theme';
import {
  isBottleFeed,
  isBreastFeed,
  isDiaperEvent,
  isNoteEvent,
  isPumpEvent,
  isSleepEvent,
  type BreastFeedEvent,
  type BreastSide,
  type CareEvent,
  type CareEventType,
  type DiaperKind,
  type ISODateTime,
  type MilkType,
  type PumpEvent,
  type PumpSide,
  type PumpVolumeDraft,
  type SleepEvent,
} from '../domain/types';
import { breastSegmentTotals, formatCompactDuration, sessionElapsedMs } from '../timer/sessionMath';
import { pumpTotalVolumeMl } from './loggingSelectors';

/* --------------------------- small label helpers --------------------------- */

const ms = (iso: ISODateTime): number => Date.parse(iso);

/** Whole minutes since an ISO timestamp, clamped to ≥ 0. */
function minutesSince(iso: ISODateTime, now: number): number {
  return Math.max(0, Math.floor((now - ms(iso)) / 60_000));
}

/** "42m ago" / "1h 10m ago" — the relative-time form used on cards + status. */
function agoLabel(iso: ISODateTime, now: number): string {
  const mins = minutesSince(iso, now);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m ago`;
  }
  return `${mins}m ago`;
}

/**
 * The moment a "last X ago" line counts from: when the event ended for a session
 * (so a just-finished 40m sleep reads "5m ago", not "45m ago"), or `occurredAt`
 * for an instant event (which has no `endedAt`).
 */
function recencyIso(event: CareEvent): ISODateTime {
  return event.endedAt ?? event.occurredAt;
}

const sideWord = (side: BreastSide): string => side; // 'left' | 'right'
const pumpSideWord = (side: PumpSide): string => side; // 'left' | 'right' | 'both'
const pumpSideTitle = (side: PumpSide): string => (side === 'both' ? 'Both' : side === 'left' ? 'Left' : 'Right');
const diaperWord = (kind: DiaperKind): string => kind; // wet | dirty | both | dry

const MILK_WORD: Record<MilkType, string> = {
  breast_milk: 'breast milk',
  formula: 'formula',
  mixed: 'mixed',
  other: 'other',
};

/** Per-side breastfeed summary, e.g. "5m left · 3m right" (falls back to the total). */
function breastSummary(totalLeftMs: number, totalRightMs: number): string {
  const parts: string[] = [];
  if (totalLeftMs > 0) parts.push(`${formatCompactDuration(totalLeftMs)} left`);
  if (totalRightMs > 0) parts.push(`${formatCompactDuration(totalRightMs)} right`);
  return parts.length > 0 ? parts.join(' · ') : formatCompactDuration(totalLeftMs + totalRightMs);
}

/** A running pump is one whose timer is still going (active, no `endedAt`). */
const isRunningPump = (e: PumpEvent): boolean => e.status === 'active' && e.endedAt === null;
/** A pump volume draft is a finished-but-unsaved pump (active, with an `endedAt`). */
const isDraftPump = (e: PumpEvent): boolean => e.status === 'active' && e.endedAt !== null;

function sleepDurationLabel(event: SleepEvent, now: number): string {
  return formatCompactDuration(sessionElapsedMs(event, now));
}

function pumpVolumeDetail(event: PumpEvent, now: number): { title: string; subtitle: string } {
  const duration = formatCompactDuration(sessionElapsedMs(event, now));
  const total = pumpTotalVolumeMl(event.details);
  if (total <= 0) {
    return { title: `Pump · ${duration}`, subtitle: pumpSideTitle(event.details.side) };
  }

  if (event.details.side === 'both') {
    const left = event.details.leftVolumeMl ?? 0;
    const right = event.details.rightVolumeMl ?? 0;
    return {
      title: `Pump · ${total} ml`,
      subtitle: `L ${left} ml · R ${right} ml · ${duration}`,
    };
  }

  return {
    title: `Pump · ${total} ml`,
    subtitle: `${pumpSideTitle(event.details.side)} · ${duration}`,
  };
}

/* ----------------------------- timeline §7.4 ----------------------------- */

/** The plan §7.4 timeline view-model for one event. `icon` keys the row glyph/tint. */
export interface TimelineEventView {
  title: string;
  subtitle: string;
  /** Drives the row icon + accent (the four core types). */
  icon: CareEventType;
  /** Accent colour for the event type (plan §7.4). */
  tint: string;
}

/** Accent colour per event type — the §7.4 `tint`. */
const TINT_BY_TYPE: Record<CareEventType, string> = {
  feed: colors.feed,
  sleep: colors.sleep,
  diaper: colors.diaper,
  pump: colors.pump,
  note: colors.sleep,
};

/**
 * Format any `CareEvent` for the timeline (plan §7.4). The formatter is purely
 * descriptive — it never mutates data (plan §8). Running sessions read in the
 * present tense ("Sleeping", "Breastfeeding", "Pumping"); completed/instant
 * events read as a noun + a compact detail.
 */
export function formatTimelineEvent(event: CareEvent, now: number): TimelineEventView {
  const tint = TINT_BY_TYPE[event.type];

  if (isBreastFeed(event)) {
    const { totalLeftMs, totalRightMs } = breastSegmentTotals(event.details.segments, now);
    if (event.status === 'active') {
      const total = formatCompactDuration(totalLeftMs + totalRightMs);
      const side = event.details.activeSide;
      return {
        title: 'Breastfeeding',
        subtitle: side ? `${total} · ${sideWord(side)}` : total,
        icon: 'feed',
        tint,
      };
    }
    return { title: 'Breastfeed', subtitle: breastSummary(totalLeftMs, totalRightMs), icon: 'feed', tint };
  }

  if (isBottleFeed(event)) {
    return {
      title: 'Bottle',
      subtitle: `${event.details.amountMl} ml · ${MILK_WORD[event.details.milkType]}`,
      icon: 'feed',
      tint,
    };
  }

  if (isSleepEvent(event)) {
    const dur = sleepDurationLabel(event, now);
    return { title: event.status === 'active' ? 'Sleeping' : 'Nap', subtitle: dur, icon: 'sleep', tint };
  }

  if (isDiaperEvent(event)) {
    return { title: 'Diaper', subtitle: diaperWord(event.details.kind), icon: 'diaper', tint };
  }

  if (isPumpEvent(event)) {
    if (isRunningPump(event)) {
      return {
        title: 'Pumping',
        subtitle: `${formatCompactDuration(sessionElapsedMs(event, now))} · ${pumpSideWord(event.details.side)}`,
        icon: 'pump',
        tint,
      };
    }
    if (isDraftPump(event)) {
      return { title: 'Pump', subtitle: 'finished · add volume', icon: 'pump', tint };
    }
    const view = pumpVolumeDetail(event, now);
    return { ...view, icon: 'pump', tint };
  }

  if (isNoteEvent(event)) {
    const label = event.details.noteType === 'spit_up' ? 'Spit-up' : (event.details.label ?? 'Note');
    const detail = event.details.note ?? (event.details.noteType === 'spit_up' ? 'small spit-up' : '');
    return { title: label, subtitle: detail, icon: 'note', tint };
  }

  // Unreachable for the closed union, but keeps the formatter total + type-safe.
  return { title: 'Logged', subtitle: '', icon: (event as CareEvent).type, tint };
}

/* ------------------------------ undo toast §8 ------------------------------ */

/**
 * The calm save-confirmation line for the Undo toast (plan §8, Phase 2/3/5/6
 * "Show Undo"). Built from the SAVED event so it matches the timeline copy:
 * "Diaper logged · wet", "Feed logged · 120 ml", "Nap logged · 40m",
 * "Pump logged · 110 ml" (or "Pump logged without volume"). The
 * trailing " · Undo" affordance is added by the toast component, not here.
 */
export function formatLoggingToast(event: CareEvent, now: number): string {
  if (isDiaperEvent(event)) return `Diaper logged · ${diaperWord(event.details.kind)}`;
  if (isBottleFeed(event)) return `Feed logged · ${event.details.amountMl} ml`;
  if (isBreastFeed(event)) {
    const { totalLeftMs, totalRightMs } = breastSegmentTotals(event.details.segments, now);
    return `Feed logged · ${formatCompactDuration(totalLeftMs + totalRightMs)}`;
  }
  if (isSleepEvent(event)) return `Nap logged · ${sleepDurationLabel(event, now)}`;
  if (isPumpEvent(event)) {
    const total = pumpTotalVolumeMl(event.details);
    if (total > 0) return `Pump logged · ${total} ml`;
    return 'Pump logged without volume';
  }
  if (isNoteEvent(event)) {
    return event.details.noteType === 'spit_up' ? 'Spit-up noted' : 'Note saved';
  }
  return 'Logged';
}

/* --------------------------- quick-log cards §7.1 -------------------------- */

/** Everything the quick-log subtitle selector needs from the live store. */
export interface V2QuickLogInput {
  todayEvents: CareEvent[];
  activeBreastFeed: BreastFeedEvent | null;
  activeSleep: SleepEvent | null;
  activePump: PumpEvent | null;
  pumpVolumeDraft: PumpVolumeDraft | null;
}

/** The four quick-log card second lines (same shape as the legacy `QuickLogMeta`). */
export interface V2QuickLogSubtitles {
  feed: string;
  sleep: string;
  diaper: string;
  pump: string;
}

/** Newest non-cancelled/deleted event matching `pred` (todayEvents is newest-first). */
function newest(
  events: CareEvent[],
  pred: (e: CareEvent) => boolean,
): CareEvent | undefined {
  // todayEvents arrives newest-first from the repo; sort defensively by occurredAt.
  return [...events].sort((a, b) => ms(b.occurredAt) - ms(a.occurredAt)).find(pred);
}

function feedSubtitle(input: V2QuickLogInput, now: number): string {
  if (input.activeBreastFeed) {
    const { totalLeftMs, totalRightMs } = breastSegmentTotals(input.activeBreastFeed.details.segments, now);
    const dur = formatCompactDuration(totalLeftMs + totalRightMs);
    const side = input.activeBreastFeed.details.activeSide;
    return side ? `Feeding · ${dur} · ${sideWord(side)}` : `Feeding · ${dur}`;
  }
  const last = newest(input.todayEvents, (e) => e.type === 'feed' && e.status === 'completed');
  if (last && isBottleFeed(last)) return `${agoLabel(recencyIso(last), now)} · ${last.details.amountMl} ml`;
  if (last && isBreastFeed(last)) return `${agoLabel(recencyIso(last), now)} · breast`;
  return 'Tap to log';
}

function sleepSubtitle(input: V2QuickLogInput, now: number): string {
  if (input.activeSleep) return `Sleeping · ${formatCompactDuration(sessionElapsedMs(input.activeSleep, now))}`;
  const last = newest(input.todayEvents, (e) => e.type === 'sleep' && e.status === 'completed');
  if (last && last.endedAt) return `Awake for ${formatCompactDuration(Math.max(0, now - ms(last.endedAt)))}`;
  return 'Awake · no sleep yet';
}

function diaperSubtitle(input: V2QuickLogInput, now: number): string {
  const last = newest(input.todayEvents, (e) => e.type === 'diaper');
  if (last && isDiaperEvent(last)) return `${agoLabel(recencyIso(last), now)} · ${diaperWord(last.details.kind)}`;
  return 'Tap to log';
}

function pumpSubtitle(input: V2QuickLogInput, now: number): string {
  if (input.activePump && isRunningPump(input.activePump)) {
    // Minute-resolution, matching the sleep/feed tiles — the Home tiles are an
    // ambient glance surface, not a live seconds stopwatch (calm-timer pass).
    return `Pumping · ${formatCompactDuration(sessionElapsedMs(input.activePump, now))}`;
  }
  if (input.pumpVolumeDraft) return 'Finished · add volume';
  const last = newest(input.todayEvents, (e) => e.type === 'pump' && e.status === 'completed');
  if (last && isPumpEvent(last)) {
    const total = pumpTotalVolumeMl(last.details);
    const detail = total > 0 ? `${total} ml` : formatCompactDuration(sessionElapsedMs(last, now));
    return `Last · ${detail}`;
  }
  return 'Log pump';
}

/**
 * Build the four quick-log card subtitles from the live store (plan §7.1). An
 * active session leads in the present tense ("Feeding · 12m · right"); otherwise
 * the card shows the last event + how long ago, or a calm "Tap to …" prompt.
 */
export function buildV2QuickLogSubtitles(input: V2QuickLogInput, now: number): V2QuickLogSubtitles {
  return {
    feed: feedSubtitle(input, now),
    sleep: sleepSubtitle(input, now),
    diaper: diaperSubtitle(input, now),
    pump: pumpSubtitle(input, now),
  };
}

/* ------------------------------ status strip ------------------------------ */

/** One column of the "time since last…" strip (same shape as the legacy item). */
export interface V2TonightStatusItem {
  key: 'feed' | 'diaper' | 'sleep';
  label: string;
  value: string;
}

/** Inputs for the status strip — last feed/diaper come from today's events. */
export interface V2TonightStatusInput {
  todayEvents: CareEvent[];
  activeSleep: SleepEvent | null;
}

/**
 * Three calm status columns from the v2 store: Last feed / Last diaper / Sleep,
 * mirroring the legacy `buildTonightStatus` so the strip stays coherent with the
 * v2 timeline + cards. Strictly descriptive — no goals, targets, or judgement.
 */
export function buildV2TonightStatus(input: V2TonightStatusInput, now: number): V2TonightStatusItem[] {
  const lastFeed = newest(input.todayEvents, (e) => e.type === 'feed');
  const lastDiaper = newest(input.todayEvents, (e) => e.type === 'diaper');
  const sleep = input.activeSleep
    ? { label: 'Sleeping', value: formatCompactDuration(sessionElapsedMs(input.activeSleep, now)) }
    : { label: 'Awake', value: 'now' };
  return [
    { key: 'feed', label: 'Last feed', value: lastFeed ? agoLabel(recencyIso(lastFeed), now) : 'None yet' },
    { key: 'diaper', label: 'Last diaper', value: lastDiaper ? agoLabel(recencyIso(lastDiaper), now) : 'None yet' },
    { key: 'sleep', label: sleep.label, value: sleep.value },
  ];
}
