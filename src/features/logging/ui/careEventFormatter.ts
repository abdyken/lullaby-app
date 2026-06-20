/**
 * Pure formatter: converts CareEvent → TimelineEntry for the Tonight/Log timeline.
 *
 * No side-effects, no I/O, no React — safe to call from useMemo or selectors.
 * Relies on session math helpers for duration labels.
 */
import type {
  BreastFeedEvent,
  BottleFeedEvent,
  CareEvent,
  DiaperEvent,
  PumpEvent,
  SleepEvent,
} from '../domain/types';
import type { TimelineEntry } from '@/data/mock';
import { calcElapsedMs, formatElapsedHuman } from '../timer/sessionMath';

/** Events created within this window are labelled "Now". */
const DISPLAY_NOW_MS = 120_000;

function clockLabel(iso: string): string {
  const date = new Date(iso);
  const h = date.getHours();
  const m = date.getMinutes();
  return `${h}:${m.toString().padStart(2, '0')}`;
}

const MILK_LABELS: Record<string, string> = {
  breast_milk: 'breast milk',
  formula: 'formula',
  mixed: 'mixed',
  other: 'other',
};

function formatEventLabel(event: CareEvent, nowMs: number): string {
  switch (event.type) {
    case 'feed': {
      const feedEvent = event as BreastFeedEvent | BottleFeedEvent;
      if (feedEvent.method === 'breast') {
        const breast = feedEvent as BreastFeedEvent;
        if (breast.status === 'active') {
          const elapsed = calcElapsedMs(breast.startedAt, nowMs);
          const side = breast.details.activeSide;
          return side
            ? `Feeding · ${formatElapsedHuman(elapsed)} · ${side}`
            : `Feeding · ${formatElapsedHuman(elapsed)}`;
        }
        const totalMs = (breast.details.totalLeftMs ?? 0) + (breast.details.totalRightMs ?? 0);
        return `Feed · breast, ${formatElapsedHuman(totalMs)}`;
      }
      const bottle = feedEvent as BottleFeedEvent;
      const milkLabel = MILK_LABELS[bottle.details.milkType] ?? bottle.details.milkType;
      return `Feed · bottle, ${bottle.details.amountMl} ml · ${milkLabel}`;
    }

    case 'sleep': {
      const sleep = event as SleepEvent;
      if (sleep.status === 'active') {
        const elapsed = calcElapsedMs(sleep.startedAt, nowMs);
        return `Sleeping · ${formatElapsedHuman(elapsed)}`;
      }
      if (sleep.startedAt && sleep.endedAt) {
        const ms = Math.max(
          0,
          new Date(sleep.endedAt).getTime() - new Date(sleep.startedAt).getTime(),
        );
        return `Sleep · ${formatElapsedHuman(ms)}`;
      }
      return 'Sleep';
    }

    case 'diaper': {
      const diaper = event as DiaperEvent;
      return `Diaper · ${diaper.details.kind}`;
    }

    case 'pump': {
      const pump = event as PumpEvent;
      // Timer still running.
      if (pump.status === 'active' && pump.endedAt === null) {
        const elapsed = calcElapsedMs(pump.startedAt, nowMs);
        return `Pumping · ${formatElapsedHuman(elapsed)} · ${pump.details.side}`;
      }
      // Timer stopped — awaiting volume entry.
      if (pump.status === 'active' && pump.endedAt !== null) {
        return `Pump · ${pump.details.side} · add volume`;
      }
      // Completed with volume.
      const left = pump.details.leftVolumeMl;
      const right = pump.details.rightVolumeMl;
      if (left !== null || right !== null) {
        const total = (left ?? 0) + (right ?? 0);
        return `Pump · ${pump.details.side}, ${total} ml`;
      }
      // Completed without volume — show duration.
      if (pump.startedAt && pump.endedAt) {
        const ms = Math.max(
          0,
          new Date(pump.endedAt).getTime() - new Date(pump.startedAt).getTime(),
        );
        return `Pump · ${pump.details.side}, ${formatElapsedHuman(ms)}`;
      }
      return `Pump · ${pump.details.side}`;
    }

    default:
      return 'Logged';
  }
}

export type CaregiverDisplay = { name: string; color: string };

/** Convert a single CareEvent to a display-ready TimelineEntry row. */
export function careEventToTimelineEntry(
  event: CareEvent,
  caregiverMap: Map<string, CaregiverDisplay>,
  nowMs: number = Date.now(),
): TimelineEntry {
  // Active timer (not yet stopped) → always "Now".
  const isTimerRunning = event.status === 'active' && event.endedAt === null;
  const justLogged = nowMs - new Date(event.createdAt).getTime() < DISPLAY_NOW_MS;
  const referenceTime = event.startedAt ?? event.occurredAt;
  const time = isTimerRunning || justLogged ? 'Now' : clockLabel(referenceTime);

  const label = formatEventLabel(event, nowMs);
  const cg = caregiverMap.get(event.createdByUserId);

  return {
    id: event.id,
    time,
    kind: event.type as TimelineEntry['kind'],
    label,
    caregiverName: cg?.name ?? null,
    caregiverColor: cg?.color ?? null,
  };
}

/**
 * Convert an array of CareEvents to display-ready TimelineEntry rows.
 *
 * Rules:
 * - Excludes deleted and cancelled events.
 * - Sorts newest-first by startedAt (or occurredAt for instant events).
 */
export function careEventsToTimeline(
  events: CareEvent[],
  caregiverMap: Map<string, CaregiverDisplay>,
  nowMs: number = Date.now(),
): TimelineEntry[] {
  return events
    .filter((e) => e.status !== 'deleted' && e.status !== 'cancelled')
    .sort((a, b) => {
      const aTime = new Date(a.startedAt ?? a.occurredAt).getTime();
      const bTime = new Date(b.startedAt ?? b.occurredAt).getTime();
      return bTime - aTime;
    })
    .map((e) => careEventToTimelineEntry(e, caregiverMap, nowMs));
}
