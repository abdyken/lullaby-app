/// <reference types="node" />
/**
 * Smoke tests for the Lullaby logging v2 pure domain/application layer.
 *
 * Pure-function checks only — no phone, no React, no test framework. Run with:
 *   npm run check:logging-v2
 *
 * Covers: breast feed sessions, bottle feed, sleep sessions, diaper quick-log,
 * pump sessions, session math helpers, and all five validators.
 */
import assert from 'node:assert/strict';

import {
  validateBottleAmount,
  validateSessionRange,
  validateBreastSegments,
  validatePumpVolumes,
  validateDiaperKind,
} from '../src/features/logging/domain/types';
import {
  calcElapsedMs,
  calcBreastSegmentTotals,
  formatElapsedTime,
  formatElapsedHuman,
} from '../src/features/logging/timer/sessionMath';
import { buildStartBreastFeedEvent } from '../src/features/logging/application/startBreastFeed';
import { buildSwitchBreastSideEvent } from '../src/features/logging/application/switchBreastSide';
import { buildFinishBreastFeedEvent } from '../src/features/logging/application/finishBreastFeed';
import { buildSaveBottleFeedEvent } from '../src/features/logging/application/saveBottleFeed';
import { buildStartSleepEvent } from '../src/features/logging/application/startSleep';
import { buildFinishSleepEvent } from '../src/features/logging/application/finishSleep';
import { buildSaveDiaperEvent } from '../src/features/logging/application/saveDiaper';
import { buildStartPumpEvent } from '../src/features/logging/application/startPump';
import { buildSavePumpEvent, buildSavePumpWithoutVolume } from '../src/features/logging/application/savePump';

// Fixed reference time so results are deterministic.
const T0 = Date.parse('2026-06-17T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

const FAMILY = 'fam-1';
const CHILD = 'child-1';
const USER = 'user-1';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}
function checkThrows(name: string, fn: () => void) {
  try {
    fn();
    assert.fail(`Expected throw in: ${name}`);
  } catch (e) {
    if (e instanceof assert.AssertionError) throw e;
    passed += 1;
    console.log(`  ✓ ${name}`);
  }
}

console.log('Lullaby logging v2 smoke test\n');

// ─── A. Session math ──────────────────────────────────────────────────────────

check('A1. calcElapsedMs returns correct ms from a fixed startedAt', () => {
  const startMs = T0;
  const nowMs = T0 + 5 * 60_000; // 5 min later
  assert.equal(calcElapsedMs(iso(startMs), nowMs), 5 * 60_000);
});

check('A2. calcElapsedMs returns 0 for null input', () => {
  assert.equal(calcElapsedMs(null, T0), 0);
});

check('A3. calcElapsedMs never returns negative (clock skew guard)', () => {
  assert.equal(calcElapsedMs(iso(T0 + 60_000), T0), 0);
});

check('A4. calcBreastSegmentTotals sums left and right correctly', () => {
  const segments = [
    { id: 's1', side: 'left' as const, startedAt: iso(T0), endedAt: iso(T0 + 5 * 60_000) },
    { id: 's2', side: 'right' as const, startedAt: iso(T0 + 5 * 60_000), endedAt: iso(T0 + 8 * 60_000) },
  ];
  const { totalLeftMs, totalRightMs } = calcBreastSegmentTotals(segments, T0 + 8 * 60_000);
  assert.equal(totalLeftMs, 5 * 60_000);
  assert.equal(totalRightMs, 3 * 60_000);
});

check('A5. calcBreastSegmentTotals counts open segments up to nowMs', () => {
  const segments = [
    { id: 's1', side: 'left' as const, startedAt: iso(T0), endedAt: null },
  ];
  const nowMs = T0 + 10 * 60_000;
  const { totalLeftMs } = calcBreastSegmentTotals(segments, nowMs);
  assert.equal(totalLeftMs, 10 * 60_000);
});

check('A6. formatElapsedTime formats under-one-hour as MM:SS', () => {
  assert.equal(formatElapsedTime(4 * 60_000 + 32_000), '04:32');
  assert.equal(formatElapsedTime(0), '00:00');
});

check('A7. formatElapsedTime formats one-hour+ as H:MM:SS', () => {
  assert.equal(formatElapsedTime(3600_000 + 4 * 60_000 + 32_000), '1:04:32');
});

check('A8. formatElapsedHuman formats minutes under one hour', () => {
  assert.equal(formatElapsedHuman(3 * 60_000), '3m');
});

check('A9. formatElapsedHuman formats hours and remaining minutes', () => {
  assert.equal(formatElapsedHuman((1 * 60 + 4) * 60_000), '1h 4m');
  assert.equal(formatElapsedHuman(2 * 3600_000), '2h');
});

// ─── B. Validators ────────────────────────────────────────────────────────────

checkThrows('B1. validateBottleAmount throws for 0', () => validateBottleAmount(0));
checkThrows('B2. validateBottleAmount throws for negative', () => validateBottleAmount(-10));

check('B3. validateBottleAmount accepts positive amount', () => {
  validateBottleAmount(120);
});

checkThrows('B4. validateSessionRange throws when endedAt < startedAt', () => {
  validateSessionRange(iso(T0 + 60_000), iso(T0));
});

check('B5. validateSessionRange accepts a valid range', () => {
  validateSessionRange(iso(T0), iso(T0 + 60_000));
});

check('B6. validateSessionRange is a no-op when either value is null', () => {
  validateSessionRange(null, iso(T0));
  validateSessionRange(iso(T0), null);
});

checkThrows('B7. validateBreastSegments throws for an invalid closed segment', () => {
  validateBreastSegments([
    { id: 's1', side: 'left', startedAt: iso(T0 + 60_000), endedAt: iso(T0) },
  ]);
});

check('B8. validateBreastSegments accepts an open segment (endedAt null)', () => {
  validateBreastSegments([{ id: 's1', side: 'left', startedAt: iso(T0), endedAt: null }]);
});

checkThrows('B9. validatePumpVolumes throws for negative left volume', () => {
  validatePumpVolumes({ side: 'left', leftVolumeMl: -5, rightVolumeMl: null });
});

checkThrows('B10. validatePumpVolumes throws for negative right volume (both side)', () => {
  validatePumpVolumes({ side: 'both', leftVolumeMl: 50, rightVolumeMl: -5 });
});

check('B11. validatePumpVolumes accepts null volumes', () => {
  validatePumpVolumes({ side: 'both', leftVolumeMl: null, rightVolumeMl: null });
});

checkThrows('B12. validateDiaperKind throws for unknown kind', () => {
  validateDiaperKind('purple');
});

check('B13. validateDiaperKind accepts all four valid kinds', () => {
  validateDiaperKind('wet');
  validateDiaperKind('dirty');
  validateDiaperKind('both');
  validateDiaperKind('dry');
});

// ─── C. Breast feed session ───────────────────────────────────────────────────

check('C1. buildStartBreastFeedEvent creates an active session with one open left segment', () => {
  const event = buildStartBreastFeedEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER,
    side: 'left', startedAt: iso(T0),
  });
  assert.equal(event.type, 'feed');
  assert.equal(event.method, 'breast');
  assert.equal(event.status, 'active');
  assert.equal(event.details.activeSide, 'left');
  assert.equal(event.details.segments.length, 1);
  assert.equal(event.details.segments[0].side, 'left');
  assert.equal(event.details.segments[0].endedAt, null);
});

check('C2. buildStartBreastFeedEvent initialises totals to zero', () => {
  const event = buildStartBreastFeedEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER,
    side: 'right', startedAt: iso(T0),
  });
  assert.equal(event.details.totalLeftMs, 0);
  assert.equal(event.details.totalRightMs, 0);
});

check('C3. buildSwitchBreastSideEvent closes the left segment and opens a right one', () => {
  const start = buildStartBreastFeedEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER,
    side: 'left', startedAt: iso(T0),
  });
  const switched = buildSwitchBreastSideEvent({
    event: start, newSide: 'right', nowIso: iso(T0 + 5 * 60_000),
  });
  assert.equal(switched.details.activeSide, 'right');
  assert.equal(switched.details.segments.length, 2);
  assert.equal(switched.details.segments[0].endedAt, iso(T0 + 5 * 60_000));
  assert.equal(switched.details.segments[1].endedAt, null);
  assert.equal(switched.details.totalLeftMs, 5 * 60_000);
  assert.equal(switched.details.totalRightMs, 0);
});

check('C4. buildSwitchBreastSideEvent is a no-op when already on that side', () => {
  const start = buildStartBreastFeedEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER,
    side: 'left', startedAt: iso(T0),
  });
  const noOp = buildSwitchBreastSideEvent({ event: start, newSide: 'left', nowIso: iso(T0 + 5 * 60_000) });
  assert.equal(noOp, start);
});

check('C5. finish after left 5m / right 3m gives correct totals', () => {
  let event = buildStartBreastFeedEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER,
    side: 'left', startedAt: iso(T0),
  });
  event = buildSwitchBreastSideEvent({ event, newSide: 'right', nowIso: iso(T0 + 5 * 60_000) });
  const finished = buildFinishBreastFeedEvent({ event, endedAt: iso(T0 + 8 * 60_000) });
  assert.equal(finished.status, 'completed');
  assert.equal(finished.details.activeSide, null);
  assert.equal(finished.details.totalLeftMs, 5 * 60_000);
  assert.equal(finished.details.totalRightMs, 3 * 60_000);
});

check('C6. multiple side switches sum correctly', () => {
  let event = buildStartBreastFeedEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER,
    side: 'left', startedAt: iso(T0),
  });
  // left 2m, right 3m, left 4m → Left=6m Right=3m
  event = buildSwitchBreastSideEvent({ event, newSide: 'right', nowIso: iso(T0 + 2 * 60_000) });
  event = buildSwitchBreastSideEvent({ event, newSide: 'left', nowIso: iso(T0 + 5 * 60_000) });
  const finished = buildFinishBreastFeedEvent({ event, endedAt: iso(T0 + 9 * 60_000) });
  assert.equal(finished.details.totalLeftMs, 6 * 60_000);
  assert.equal(finished.details.totalRightMs, 3 * 60_000);
});

checkThrows('C7. buildFinishBreastFeedEvent throws when endedAt is before a segment startedAt', () => {
  const event = buildStartBreastFeedEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER,
    side: 'left', startedAt: iso(T0 + 10 * 60_000),
  });
  buildFinishBreastFeedEvent({ event, endedAt: iso(T0) });
});

// ─── D. Bottle feed ───────────────────────────────────────────────────────────

check('D1. buildSaveBottleFeedEvent creates a completed bottle event with correct payload', () => {
  const event = buildSaveBottleFeedEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER,
    amountMl: 120, milkType: 'breast_milk', occurredAt: iso(T0),
  });
  assert.equal(event.type, 'feed');
  assert.equal(event.method, 'bottle');
  assert.equal(event.status, 'completed');
  assert.equal(event.details.amountMl, 120);
  assert.equal(event.details.milkType, 'breast_milk');
});

checkThrows('D2. buildSaveBottleFeedEvent throws for amount 0', () => {
  buildSaveBottleFeedEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER,
    amountMl: 0, milkType: 'formula', occurredAt: iso(T0),
  });
});

check('D3. buildSaveBottleFeedEvent assigns a clientEventId', () => {
  const event = buildSaveBottleFeedEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER,
    amountMl: 90, milkType: 'formula', occurredAt: iso(T0),
  });
  assert.ok(typeof event.clientEventId === 'string' && event.clientEventId.length > 0);
});

// ─── E. Sleep session ─────────────────────────────────────────────────────────

check('E1. buildStartSleepEvent creates an active sleep with the given startedAt', () => {
  const event = buildStartSleepEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER, startedAt: iso(T0),
  });
  assert.equal(event.type, 'sleep');
  assert.equal(event.status, 'active');
  assert.equal(event.startedAt, iso(T0));
  assert.equal(event.endedAt, null);
});

check('E2. buildFinishSleepEvent after 40 minutes marks status completed', () => {
  const active = buildStartSleepEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER, startedAt: iso(T0),
  });
  const finished = buildFinishSleepEvent({ event: active, endedAt: iso(T0 + 40 * 60_000) });
  assert.equal(finished.status, 'completed');
  assert.equal(finished.startedAt, iso(T0));
  assert.equal(finished.endedAt, iso(T0 + 40 * 60_000));
  const durationMs = new Date(finished.endedAt!).getTime() - new Date(finished.startedAt!).getTime();
  assert.equal(durationMs, 40 * 60_000);
});

check('E3. buildStartSleepEvent with backdated startedAt produces correct elapsed on finish', () => {
  const backdatedStart = iso(T0 - 5 * 60_000);
  const active = buildStartSleepEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER, startedAt: backdatedStart,
  });
  const finished = buildFinishSleepEvent({ event: active, endedAt: iso(T0 + 20 * 60_000) });
  const durationMs = new Date(finished.endedAt!).getTime() - new Date(finished.startedAt!).getTime();
  assert.equal(durationMs, 25 * 60_000);
});

checkThrows('E4. buildFinishSleepEvent throws when endedAt is before startedAt', () => {
  const active = buildStartSleepEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER, startedAt: iso(T0),
  });
  buildFinishSleepEvent({ event: active, endedAt: iso(T0 - 60_000) });
});

// ─── F. Diaper quick-log ──────────────────────────────────────────────────────

check('F1. buildSaveDiaperEvent creates a completed wet diaper event', () => {
  const event = buildSaveDiaperEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER, kind: 'wet', occurredAt: iso(T0),
  });
  assert.equal(event.type, 'diaper');
  assert.equal(event.status, 'completed');
  assert.equal(event.details.kind, 'wet');
});

check('F2. buildSaveDiaperEvent creates a correct event for each of the four kinds', () => {
  const kinds = ['wet', 'dirty', 'both', 'dry'] as const;
  for (const kind of kinds) {
    const event = buildSaveDiaperEvent({
      familyId: FAMILY, childId: CHILD, createdByUserId: USER, kind, occurredAt: iso(T0),
    });
    assert.equal(event.details.kind, kind, `kind mismatch for "${kind}"`);
  }
});

checkThrows('F3. buildSaveDiaperEvent throws for an invalid kind', () => {
  buildSaveDiaperEvent({
    familyId: FAMILY, childId: CHILD, createdByUserId: USER,
    kind: 'unknown' as 'wet', occurredAt: iso(T0),
  });
});

// ─── G. Pump session ──────────────────────────────────────────────────────────

check('G1. buildStartPumpEvent creates an active pump session with both sides', () => {
  const event = buildStartPumpEvent({
    familyId: FAMILY, childId: null, createdByUserId: USER, subjectUserId: USER,
    side: 'both', startedAt: iso(T0),
  });
  assert.equal(event.type, 'pump');
  assert.equal(event.status, 'active');
  assert.equal(event.details.side, 'both');
  assert.equal(event.details.leftVolumeMl, null);
  assert.equal(event.details.rightVolumeMl, null);
});

check('G2. buildSavePumpEvent with both + 50/60 ml stores the volumes', () => {
  const active = buildStartPumpEvent({
    familyId: FAMILY, childId: null, createdByUserId: USER, subjectUserId: USER,
    side: 'both', startedAt: iso(T0),
  });
  const draft = { eventId: active.id, side: 'both' as const, leftVolumeMl: 50, rightVolumeMl: 60 };
  const saved = buildSavePumpEvent({ event: active, draft, savedAt: iso(T0 + 18 * 60_000) });
  assert.equal(saved.status, 'completed');
  assert.equal(saved.details.leftVolumeMl, 50);
  assert.equal(saved.details.rightVolumeMl, 60);
  const total = (saved.details.leftVolumeMl ?? 0) + (saved.details.rightVolumeMl ?? 0);
  assert.equal(total, 110);
});

check('G3. buildSavePumpWithoutVolume stores null volumes and marks completed', () => {
  const active = buildStartPumpEvent({
    familyId: FAMILY, childId: null, createdByUserId: USER, subjectUserId: USER,
    side: 'left', startedAt: iso(T0),
  });
  const saved = buildSavePumpWithoutVolume({ event: active, savedAt: iso(T0 + 15 * 60_000) });
  assert.equal(saved.status, 'completed');
  assert.equal(saved.details.leftVolumeMl, null);
  assert.equal(saved.details.rightVolumeMl, null);
});

check('G4. buildSavePumpEvent preserves endedAt from the active session', () => {
  let active = buildStartPumpEvent({
    familyId: FAMILY, childId: null, createdByUserId: USER, subjectUserId: USER,
    side: 'right', startedAt: iso(T0),
  });
  // Simulate the timer-stopped state: endedAt was set but status stayed active.
  active = { ...active, endedAt: iso(T0 + 10 * 60_000) };
  const draft = { eventId: active.id, side: 'right' as const, leftVolumeMl: 0, rightVolumeMl: 80 };
  const saved = buildSavePumpEvent({ event: active, draft, savedAt: iso(T0 + 11 * 60_000) });
  assert.equal(saved.endedAt, iso(T0 + 10 * 60_000));
  assert.equal(saved.details.rightVolumeMl, 80);
  assert.equal(saved.details.leftVolumeMl, null); // 0 → stored as null
});

check('G5. pump childId can be null (pump belongs to caregiver, not child)', () => {
  const event = buildStartPumpEvent({
    familyId: FAMILY, childId: null, createdByUserId: USER, subjectUserId: USER,
    side: 'left', startedAt: iso(T0),
  });
  assert.equal(event.childId, null);
  assert.equal(event.subjectUserId, USER);
});

console.log(`\nAll ${passed} checks passed ✅`);
