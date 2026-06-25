/**
 * Logging v2 -> History timeline rows.
 *
 * The Today screen caps rows for the home card, but History needs the complete
 * current-day timeline. Keep this pure so the smoke script can verify that a
 * refreshed LoggingState immediately produces History rows without app restart.
 */
import type { TimelineEntry } from '../../../data/mock';
import type { Caregiver } from '../../../data/models';

import {
  isBottleFeed,
  isBreastFeed,
  isDiaperEvent,
  isPumpEvent,
  isSleepEvent,
  type BreastSide,
  type CareEvent,
  type PumpSide,
} from '../domain/types';
import { breastSegmentTotals, sessionElapsedMs } from '../timer/sessionMath';
import { pumpTotalVolumeMl } from './loggingSelectors';

const DISPLAY_NOW_MS = 120_000;

const ms = (iso: string): number => Date.parse(iso);

function clockLabel(iso: string): string {
  const date = new Date(iso);
  return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function timelineTime(event: CareEvent, now: number): string {
  if (event.status === 'active') return 'Now';
  if (now - ms(event.occurredAt) < DISPLAY_NOW_MS) return 'Now';
  return clockLabel(event.occurredAt);
}

function durationMinutesLabel(msValue: number): string {
  const mins = Math.max(0, Math.round(msValue / 60_000));
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }
  return `${mins} min`;
}

function compactDurationLabel(msValue: number): string {
  const mins = Math.max(0, Math.round(msValue / 60_000));
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }
  return `${mins}m`;
}

function sideInitial(side: BreastSide): string {
  return side === 'left' ? 'L' : 'R';
}

function pumpSideLabel(side: PumpSide): string {
  if (side === 'both') return 'both';
  return side === 'left' ? 'L' : 'R';
}

function historyLabel(event: CareEvent, now: number): string {
  if (isBreastFeed(event)) {
    if (event.status === 'active') {
      return event.details.activeSide
        ? `Nursing in progress · ${sideInitial(event.details.activeSide)}`
        : 'Nursing in progress';
    }

    const { totalLeftMs, totalRightMs } = breastSegmentTotals(event.details.segments, now);
    if (totalLeftMs > 0 && totalRightMs === 0) {
      return `Nursing · ${durationMinutesLabel(totalLeftMs)} · L`;
    }
    if (totalRightMs > 0 && totalLeftMs === 0) {
      return `Nursing · ${durationMinutesLabel(totalRightMs)} · R`;
    }

    const left = totalLeftMs > 0 ? `${durationMinutesLabel(totalLeftMs)} L` : null;
    const right = totalRightMs > 0 ? `${durationMinutesLabel(totalRightMs)} R` : null;
    const sides = [left, right].filter(Boolean).join(' · ');
    return sides ? `Nursing · ${sides}` : 'Nursing';
  }

  if (isBottleFeed(event)) {
    return `Bottle · ${event.details.amountMl} ml`;
  }

  if (isSleepEvent(event)) {
    if (event.status === 'active') return 'Sleep in progress';
    return `Sleep · ${compactDurationLabel(sessionElapsedMs(event, now))}`;
  }

  if (isDiaperEvent(event)) {
    return `Diaper · ${event.details.kind}`;
  }

  if (isPumpEvent(event)) {
    if (event.status === 'active' && event.endedAt === null) {
      return `Pumping in progress · ${pumpSideLabel(event.details.side)}`;
    }
    if (event.status === 'active' && event.endedAt !== null) {
      return 'Pump · finished';
    }

    const total = pumpTotalVolumeMl(event.details);
    if (total > 0) return `Pump · ${total} ml`;
    return `Pump · ${compactDurationLabel(sessionElapsedMs(event, now))}`;
  }

  return 'Logged';
}

export function buildV2HistoryTimeline(
  events: CareEvent[],
  caregivers: Caregiver[],
  now: number,
): TimelineEntry[] {
  const caregiverById = new Map(caregivers.map((caregiver) => [caregiver.id, caregiver]));

  return [...events]
    .sort((a, b) => ms(b.occurredAt) - ms(a.occurredAt))
    .map((event) => {
      const caregiver = caregiverById.get(event.createdByUserId);
      return {
        id: event.id,
        time: timelineTime(event, now),
        kind: event.type,
        label: historyLabel(event, now),
        caregiverName: caregiver?.displayName ?? null,
        caregiverColor: caregiver?.colorHex ?? null,
      };
    });
}
