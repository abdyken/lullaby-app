/**
 * Logging v2 — legacy mapper (plan §2.4, §13 PR1 "legacy mapper skeleton").
 *
 * Bridges the existing flat `LogEvent` (src/data/models.ts) to the new
 * discriminated `CareEvent` so the v2 timeline can READ existing data before any
 * row is rewritten (plan §2.4 order: define old format → mapper → test on a copy
 * → switch timeline reads → only then stop writing the old format). It is
 * deliberately non-destructive: old rows stay valid; mapping is lossy only where
 * the old model never captured the field (see notes per type).
 *
 * Field mapping follows docs/LULLABY_LOGGING_MVP_AUDIT.md §10. Pure & type-only
 * imports, so this runs under the Node smoke test.
 */
import type { LogEvent, LogEventMeta } from '@/data/models';

import type {
  BottleFeedEvent,
  BreastFeedEvent,
  BreastSideSegment,
  CareEvent,
  CareEventBase,
  DiaperEvent,
  DiaperKind,
  PumpEvent,
  SleepEvent,
} from '../domain/types';

/** Options for resolving fields the legacy model never stored. */
export interface LegacyMapOptions {
  /**
   * Maps a legacy `babyId` to a `familyId`. The legacy model has no explicit
   * family, so the first pass mirrors the baby scope (audit §13). Override once a
   * real family concept exists.
   */
  resolveFamilyId?: (babyId: string) => string;
}

const sideToBreast = (side: 'L' | 'R' | undefined): 'left' | 'right' | null =>
  side === 'L' ? 'left' : side === 'R' ? 'right' : null;

/**
 * Build the shared base. Legacy rows predate most v2 metadata, so we default
 * sensibly and non-destructively:
 *  - `clientEventId` = the legacy id (stable → re-mapping the same row is idempotent),
 *  - `occurredAt` = legacy `startAt` (timeline anchor),
 *  - `updatedAt` = legacy `createdAt`, `version` = 1,
 *  - `syncStatus` = 'synced' (these rows already came from the store/backend),
 *  - `timezoneOffsetMinutes` = 0 (legacy never captured the offset).
 */
function mapBase(event: LogEvent, familyId: string): CareEventBase {
  return {
    id: event.id,
    clientEventId: event.id,
    familyId,
    childId: event.babyId,
    createdByUserId: event.caregiverId,
    type: event.type === 'note' ? 'feed' : event.type, // note never reaches here (guarded below)
    status: 'completed',
    occurredAt: event.startAt,
    startedAt: null,
    endedAt: null,
    timezoneOffsetMinutes: 0,
    createdAt: event.createdAt,
    updatedAt: event.createdAt,
    syncStatus: 'synced',
    version: 1,
  };
}

function mapFeed(event: LogEvent, base: CareEventBase): BreastFeedEvent | BottleFeedEvent {
  const meta: LogEventMeta = event.meta ?? {};
  const breastSide = sideToBreast(meta.side);

  // A side present → breastfeeding; absent → bottle (audit: bottle = "feed with no side").
  if (breastSide === null) {
    const bottle: BottleFeedEvent = {
      ...base,
      type: 'feed',
      childId: event.babyId,
      status: 'completed',
      method: 'bottle',
      details: {
        // Legacy bottles captured no volume / milk type — default and let edit fill in.
        amountMl: typeof meta.amountMl === 'number' ? meta.amountMl : 0,
        milkType: 'other',
      },
    };
    return bottle;
  }

  const isRunning = event.endAt === null;
  const segment: BreastSideSegment = {
    id: `${event.id}-seg-0`,
    side: breastSide,
    startedAt: event.startAt,
    endedAt: event.endAt,
  };
  // Totals come from the (single) segment; an open segment's elapsed time is left
  // to the live selector, so a not-yet-finished feed reports 0 here.
  const durationMs = event.endAt ? Date.parse(event.endAt) - Date.parse(event.startAt) : 0;
  const breast: BreastFeedEvent = {
    ...base,
    type: 'feed',
    childId: event.babyId,
    status: isRunning ? 'active' : 'completed',
    startedAt: event.startAt,
    endedAt: event.endAt,
    method: 'breast',
    details: {
      activeSide: isRunning ? breastSide : null,
      segments: [segment],
      totalLeftMs: breastSide === 'left' ? durationMs : 0,
      totalRightMs: breastSide === 'right' ? durationMs : 0,
    },
  };
  return breast;
}

function mapSleep(event: LogEvent, base: CareEventBase): SleepEvent {
  const isRunning = event.endAt === null;
  return {
    ...base,
    type: 'sleep',
    childId: event.babyId,
    status: isRunning ? 'active' : 'completed',
    startedAt: event.startAt,
    endedAt: event.endAt,
    details: { sleepType: 'unknown' },
  };
}

function mapDiaper(event: LogEvent, base: CareEventBase): DiaperEvent {
  // Legacy kinds are wet/dirty/both — all valid v2 kinds (v2 adds 'dry').
  const kind: DiaperKind = (event.meta?.kind as DiaperKind) ?? 'wet';
  return {
    ...base,
    type: 'diaper',
    childId: event.babyId,
    status: 'completed',
    details: { kind },
  };
}

function mapPump(event: LogEvent, base: CareEventBase): PumpEvent {
  const isRunning = event.endAt === null;
  // Legacy pump stored only L/R (and dropped "both"); volume was never captured.
  const side = event.meta?.side === 'L' ? 'left' : event.meta?.side === 'R' ? 'right' : 'both';
  return {
    ...base,
    type: 'pump',
    childId: event.babyId,
    subjectUserId: event.caregiverId,
    status: isRunning ? 'active' : 'completed',
    startedAt: event.startAt,
    endedAt: event.endAt,
    details: { side, leftVolumeMl: null, rightVolumeMl: null },
  };
}

/**
 * Convert one legacy `LogEvent` to a `CareEvent`, or `null` for `note` events,
 * which are out of scope for the four core flows and stay on the legacy model.
 */
export function legacyEventToCareEvent(
  event: LogEvent,
  options: LegacyMapOptions = {},
): CareEvent | null {
  if (event.type === 'note') return null;

  const familyId = options.resolveFamilyId?.(event.babyId) ?? event.babyId;
  const base = mapBase(event, familyId);

  switch (event.type) {
    case 'feed':
      return mapFeed(event, base);
    case 'sleep':
      return mapSleep(event, base);
    case 'diaper':
      return mapDiaper(event, base);
    case 'pump':
      return mapPump(event, base);
    default:
      return null;
  }
}

/** Map a list of legacy events, dropping the ones (notes) that have no v2 equivalent. */
export function mapLegacyEvents(events: LogEvent[], options: LegacyMapOptions = {}): CareEvent[] {
  return events
    .map((event) => legacyEventToCareEvent(event, options))
    .filter((event): event is CareEvent => event !== null);
}

/* --------------------------- reverse (skeleton) --------------------------- */

/**
 * Best-effort `CareEvent` → legacy `LogEvent`, for writing v2 events back through
 * the existing `EventRepository` during the migration window (plan §2.4 step 4).
 * Lossy by nature — the legacy model cannot hold segments, split pump volumes, or
 * milk type — so it preserves only what the old shape supports.
 *
 * TODO(plan Phase 9 / PR9): finish the migration write-path (segment-aware
 * duration, volume handling) when legacy writes are actually retired.
 */
export function careEventToLegacyEvent(event: CareEvent): LogEvent {
  const meta: LogEventMeta = {};

  if (event.type === 'feed' && event.method === 'breast') {
    if (event.details.activeSide) meta.side = event.details.activeSide === 'left' ? 'L' : 'R';
  } else if (event.type === 'feed' && event.method === 'bottle') {
    meta.amountMl = event.details.amountMl;
  } else if (event.type === 'diaper') {
    // Legacy meta only modelled wet/dirty/both; 'dry' has no legacy equivalent.
    if (event.details.kind !== 'dry') meta.kind = event.details.kind;
  } else if (event.type === 'pump') {
    if (event.details.side === 'left') meta.side = 'L';
    else if (event.details.side === 'right') meta.side = 'R';
  }

  return {
    id: event.id,
    babyId: event.childId ?? '',
    caregiverId: event.createdByUserId,
    type: event.type,
    startAt: event.startedAt ?? event.occurredAt,
    endAt: event.endedAt,
    meta,
    createdAt: event.createdAt,
  };
}
