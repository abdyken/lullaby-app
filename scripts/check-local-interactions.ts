/// <reference types="node" />
/**
 * Lightweight smoke test for the local Tonight interaction logic.
 *
 * Pure-function checks only — no phone, no React, no test framework. Run with:
 *   npm run check:local-interactions
 *
 * Covers: feed/diaper spam prevention, sleep dedup, Wake baby, End feed / Done,
 * and the 4-item timeline cap.
 */
import assert from 'node:assert/strict';

import {
  addDiaper,
  addFeed,
  addNote,
  cappedTimeline,
  handleDiaperTap,
  handleFeedTap,
  handlePrimaryAction,
  handleSleepTap,
  initTonightState,
  undoLastEvent,
  undoLastOwnEvent,
  type TonightState,
} from '../src/data/localInteractions';
import {
  buildHandoffSummary,
  buildNightRecap,
  buildTonightStatus,
  calmDescription,
  deriveHandoff,
  deriveNightStatus,
  getOrbView,
  recapSummaryLine,
} from '../src/data/currentState';
import { buildSeedEvents, getTonightTimeline } from '../src/data/mock';
import type { Caregiver, LogEvent, LogEventType } from '../src/data/models';
import { resolveSurfaceMode } from '../src/theme';
import { parsePersistedState, serializeState } from '../src/data/persistedState';
// Logging v2 foundation (plan Phase 1.1) — new model lives beside the legacy one.
import { createManualClock, systemClock } from '../src/features/logging/timer/clock';
import { newClientEventId, newUuid } from '../src/features/logging/domain/ids';
import {
  validateBottleAmount,
  validateBreastSegments,
  validateDiaperKind,
  validatePumpVolumes,
  validateSessionRange,
} from '../src/features/logging/domain/rules';
import {
  isBottleFeed,
  isBreastFeed,
  isDiaperEvent,
  isPumpEvent,
  isSleepEvent,
} from '../src/features/logging/domain/types';
import type {
  BottleFeedEvent,
  BreastFeedEvent,
  BreastSideSegment,
  CareEventBase,
  DiaperEvent,
  PumpEvent,
  SleepEvent,
} from '../src/features/logging/domain/types';
// Logging v2 repository/service layer (plan Phase 1.2) — interface, in-memory
// persistence, the impl, the legacy mapper, and the loggingV2 feature flag.
import {
  createInMemoryLoggingPersistence,
  parseLoggingSnapshot,
  serializeLoggingSnapshot,
} from '../src/features/logging/data/loggingPersistence';
import { createLoggingRepository } from '../src/features/logging/data/LoggingRepositoryImpl';
import {
  careEventToLegacyEvent,
  legacyEventToCareEvent,
  mapLegacyEvents,
} from '../src/features/logging/data/LegacyLoggingMapper';
import {
  isLoggingV2Enabled,
  resetLoggingFlags,
  resolveLoggingFlags,
  setLoggingV2Enabled,
} from '../src/features/logging/config/featureFlags';

// Fixed reference time so results are deterministic regardless of the real clock.
const NOW = Date.parse('2026-06-17T00:00:00.000Z');

// The seed is now built relative to "now"; pin it to NOW so the timestamps the
// assertions below depend on (sleep duration, last feed/diaper ago) are stable.
const seedEvents = buildSeedEvents(NOW);

const countKind = (s: TonightState, kind: LogEventType) =>
  s.events.filter((e) => e.type === kind).length;
const countRunningSleep = (s: TonightState) =>
  s.events.filter((e) => e.type === 'sleep' && e.endAt === null).length;

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('Local interaction smoke test\n');

// A. Feed spam prevention
check('A. two quick Feed taps add only one feed event', () => {
  let s = initTonightState(seedEvents);
  const before = countKind(s, 'feed');
  s = handleFeedTap(s, NOW);
  s = handleFeedTap(s, NOW + 1_000); // immediate repeat → swallowed
  assert.equal(countKind(s, 'feed'), before + 1);
  assert.equal(s.orbView, 'feed');
});

// B. Diaper spam prevention
check('B. two quick Diaper taps add only one diaper event', () => {
  let s = initTonightState(seedEvents);
  const before = countKind(s, 'diaper');
  s = handleDiaperTap(s, NOW);
  s = handleDiaperTap(s, NOW + 1_000);
  assert.equal(countKind(s, 'diaper'), before + 1);
  assert.equal(s.orbView, 'diaper');
});

// C. Sleep deduplication
check('C. tapping Sleep while sleeping does not start a second sleep', () => {
  let s = initTonightState(seedEvents);
  assert.equal(countRunningSleep(s), 1); // seed has one running sleep
  s = handleSleepTap(s, NOW);
  assert.equal(countRunningSleep(s), 1);
  assert.equal(s.orbView, 'sleep');
});

// D. Wake baby behavior
check('D. Wake baby ends the running sleep and returns to calm', () => {
  let s = initTonightState(seedEvents);
  assert.equal(s.orbView, 'sleep');
  assert.equal(countRunningSleep(s), 1);

  s = handlePrimaryAction(s, NOW); // "Wake baby"

  assert.equal(countRunningSleep(s), 0); // no sleep left running
  const sleepEvt = s.events.find((e) => e.type === 'sleep');
  assert.ok(sleepEvt && sleepEvt.endAt !== null, 'sleep event should have endAt');
  assert.equal(s.orbView, 'calm');

  const tl = cappedTimeline(s, NOW);
  assert.ok(!tl.some((row) => row.label === 'Sleep running'), 'timeline should not say "Sleep running"');
});

// E. End feed / Done behavior
check('E1. End feed returns to calm without adding a duplicate feed', () => {
  let s = initTonightState(seedEvents);
  s = handleFeedTap(s, NOW);
  const feeds = countKind(s, 'feed');
  assert.equal(s.orbView, 'feed');
  s = handlePrimaryAction(s, NOW + 2_000); // "End feed"
  assert.equal(s.orbView, 'calm');
  assert.equal(countKind(s, 'feed'), feeds);
});

check('E2. Done returns to calm without adding a duplicate diaper', () => {
  let s = initTonightState(seedEvents);
  s = handleDiaperTap(s, NOW);
  const diapers = countKind(s, 'diaper');
  assert.equal(s.orbView, 'diaper');
  s = handlePrimaryAction(s, NOW + 2_000); // "Done"
  assert.equal(s.orbView, 'calm');
  assert.equal(countKind(s, 'diaper'), diapers);
});

// F. Timeline cap
check('F. Tonight timeline renders at most 4 rows', () => {
  let s = initTonightState(seedEvents); // 3 seed events
  s = handleFeedTap(s, NOW); // +1
  s = handleDiaperTap(s, NOW + 60_000); // +1 (spaced beyond dedup window)
  assert.ok(s.events.length >= 5, 'state should retain all events');
  assert.equal(cappedTimeline(s, NOW + 60_000).length, 4);
});

// G. Persistence (de)serialization + validation (pure, no AsyncStorage/RN)
check('G1. serialize → parse round-trips events + orbView', () => {
  let s = initTonightState(seedEvents);
  s = handleFeedTap(s, NOW);
  const restored = parsePersistedState(serializeState(s));
  assert.ok(restored, 'round-trip should produce a valid state');
  assert.equal(restored.orbView, s.orbView);
  assert.equal(restored.events.length, s.events.length);
});

check('G2. invalid stored data falls back to null (no crash)', () => {
  assert.equal(parsePersistedState(null), null); // nothing saved
  assert.equal(parsePersistedState('not json {'), null); // unparseable
  assert.equal(parsePersistedState('42'), null); // not an object
  assert.equal(parsePersistedState('{"events":"nope","orbView":"calm"}'), null); // events not array
  assert.equal(parsePersistedState('{"events":[],"orbView":"banana"}'), null); // unknown orbView
});

check('G3. an empty event list with a known orbView is valid', () => {
  const restored = parsePersistedState('{"events":[],"orbView":"calm"}');
  assert.ok(restored && restored.events.length === 0 && restored.orbView === 'calm');
});

// H. Note events
check('H1. addNote appends one note and leaves the orb view unchanged', () => {
  let s = initTonightState(seedEvents);
  const before = countKind(s, 'note');
  s = addNote(s, { label: 'Fussy' }, NOW);
  assert.equal(countKind(s, 'note'), before + 1);
  assert.equal(s.orbView, 'sleep'); // seed has a running sleep → orb stays put
  const note = s.events.find((e) => e.type === 'note');
  assert.ok(note && note.meta.label === 'Fussy' && note.endAt === null);
});

check('H2. notes are not deduped (two explicit notes both land)', () => {
  let s = initTonightState(seedEvents);
  s = addNote(s, { note: 'cried briefly' }, NOW);
  s = addNote(s, { note: 'settled again' }, NOW + 1_000);
  assert.equal(countKind(s, 'note'), 2);
});

// I. Undo last event
check('I1. undo removes the most recently created event (the running sleep)', () => {
  let s = initTonightState(seedEvents);
  assert.equal(countRunningSleep(s), 1);
  s = undoLastEvent(s); // newest createdAt in the seed is the running sleep
  assert.equal(countRunningSleep(s), 0);
  assert.equal(s.orbView, 'calm'); // reconciled: no sleep running → calm
});

check('I2. undo removes a just-added note and restores the prior orb view', () => {
  let s = initTonightState(seedEvents);
  const noteCount = countKind(s, 'note');
  s = addNote(s, { label: 'Settled' }, NOW);
  s = undoLastEvent(s);
  assert.equal(countKind(s, 'note'), noteCount);
  assert.equal(s.orbView, 'sleep'); // sleep still running → back to sleep
});

check('I3. undo on an empty event list is a no-op', () => {
  const empty = initTonightState([]);
  const after = undoLastEvent(empty);
  assert.equal(after.events.length, 0);
  assert.equal(after.orbView, 'calm');
});

// J. Persistence round-trip including a note event
check('J1. serialize → parse round-trips a note event', () => {
  let s = initTonightState(seedEvents);
  s = addNote(s, { label: 'Fussy', note: 'hard to settle' }, NOW);
  const restored = parsePersistedState(serializeState(s));
  assert.ok(restored, 'round-trip should produce a valid state');
  const note = restored.events.find((e) => e.type === 'note');
  assert.ok(note && note.meta.label === 'Fussy' && note.meta.note === 'hard to settle');
});

check('J2. a stored note event passes validation', () => {
  const raw = JSON.stringify({
    events: [
      {
        id: 'n1',
        babyId: 'baby-mia',
        caregiverId: 'cg-mom',
        type: 'note',
        startAt: '2026-06-17T00:00:00.000Z',
        endAt: null,
        meta: { label: 'Cried' },
        createdAt: '2026-06-17T00:00:00.000Z',
      },
    ],
    orbView: 'calm',
  });
  const restored = parsePersistedState(raw);
  assert.ok(restored && restored.events.length === 1 && restored.events[0].type === 'note');
});

check('J3. duplicate stored event ids are repaired on load', () => {
  const raw = JSON.stringify({
    events: [
      {
        id: 'local-feed-7',
        babyId: 'baby-mia',
        caregiverId: 'cg-mom',
        type: 'feed',
        startAt: '2026-06-17T00:00:00.000Z',
        endAt: '2026-06-17T00:08:00.000Z',
        meta: { side: 'L' },
        createdAt: '2026-06-17T00:08:00.000Z',
      },
      {
        id: 'local-feed-7',
        babyId: 'baby-mia',
        caregiverId: 'cg-mom',
        type: 'feed',
        startAt: '2026-06-17T01:00:00.000Z',
        endAt: '2026-06-17T01:08:00.000Z',
        meta: { side: 'R' },
        createdAt: '2026-06-17T01:08:00.000Z',
      },
    ],
    orbView: 'calm',
  });
  const restored = parsePersistedState(raw);
  assert.ok(restored && restored.events.length === 2);
  assert.notEqual(restored.events[0].id, restored.events[1].id);
  assert.equal(restored.events[0].id, 'local-feed-7');
  assert.match(restored.events[1].id, /^local-feed-7-dup-/);
});

check('J4. locally-created ids include the event timestamp to avoid reload counter collisions', () => {
  const first = addFeed(initTonightState([]), { side: 'L' }, NOW);
  const second = addFeed(initTonightState([]), { side: 'L' }, NOW + 60_000);
  assert.notEqual(first.events[0].id, second.events[0].id);
  assert.ok(first.events[0].id.includes(String(NOW)));
  assert.ok(second.events[0].id.includes(String(NOW + 60_000)));
});

// K. Derived current-night status from live events
check('K1. derived status reports sleeping with last feed/diaper from the seed', () => {
  const status = deriveNightStatus(seedEvents, NOW);
  assert.equal(status.babyStatus, 'sleeping');
  assert.ok(typeof status.sleepingForMin === 'number' && status.sleepingForMin > 0);
  assert.ok(typeof status.lastFeedAgoMin === 'number');
  assert.ok(typeof status.lastDiaperAgoMin === 'number');
});

check('K2. after Wake baby the derived status reports awake', () => {
  let s = initTonightState(seedEvents);
  s = handlePrimaryAction(s, NOW); // Wake baby ends the running sleep
  const status = deriveNightStatus(s.events, NOW);
  assert.equal(status.babyStatus, 'awake');
  assert.equal(status.sleepingForMin, undefined);
});

check('K3. the calm orb uses real "last feed/diaper" copy when events exist', () => {
  const desc = getOrbView('calm', seedEvents, NOW).description;
  assert.ok(desc.includes('Last feed') && desc.includes('Last diaper'));
});

check('K4. the sleep orb shows the running sleep’s real duration (not a canned value)', () => {
  const orb = getOrbView('sleep', seedEvents, NOW);
  assert.notEqual(orb.timerText, '1h 12m'); // canned preview value
  assert.match(orb.timerText, /\d+h \d{2}m|\d+m/);
  assert.ok(orb.description.startsWith('Started '));
});

check('K5. with no events the calm orb keeps its canned copy', () => {
  assert.equal(calmDescription(deriveNightStatus([], NOW)), null);
  const desc = getOrbView('calm', [], NOW).description;
  assert.ok(!desc.includes('Last feed'));
});

// L. Detail-aware logging from the bottom sheets
check('L1. addFeed maps Left/Right to side metadata and selects the feed orb', () => {
  let s = initTonightState([]);
  s = addFeed(s, { side: 'R' }, NOW);
  assert.equal(s.events[0].type, 'feed');
  assert.equal(s.events[0].meta.side, 'R');
  assert.equal(s.orbView, 'feed');
});

check('L2. addFeed for Bottle records a feed with no side', () => {
  const s = addFeed(initTonightState([]), {}, NOW); // Bottle → {}
  assert.equal(s.events[0].type, 'feed');
  assert.equal(s.events[0].meta.side, undefined);
});

check('L3. addDiaper maps Wet/Dirty/Mixed to wet/dirty/both', () => {
  assert.equal(addDiaper(initTonightState([]), { kind: 'wet' }, NOW).events[0].meta.kind, 'wet');
  assert.equal(addDiaper(initTonightState([]), { kind: 'dirty' }, NOW).events[0].meta.kind, 'dirty');
  assert.equal(addDiaper(initTonightState([]), { kind: 'both' }, NOW).events[0].meta.kind, 'both');
});

check('L4. addNote stores the selected label', () => {
  const s = addNote(initTonightState([]), { label: 'Cried' }, NOW);
  assert.equal(s.events[0].type, 'note');
  assert.equal(s.events[0].meta.label, 'Cried');
});

check('L5. a rapid second feed/diaper save is swallowed (no duplicate)', () => {
  let s = initTonightState([]);
  s = addFeed(s, { side: 'L' }, NOW);
  s = addFeed(s, { side: 'R' }, NOW + 1_000); // within dedup window
  assert.equal(s.events.filter((e) => e.type === 'feed').length, 1);

  let d = initTonightState([]);
  d = addDiaper(d, { kind: 'wet' }, NOW);
  d = addDiaper(d, { kind: 'dirty' }, NOW + 1_000);
  assert.equal(d.events.filter((e) => e.type === 'diaper').length, 1);
});

// M. Hero confirmation copy derives from the saved event (not canned preview text)
check('M1. feed hero reflects the saved side (Right), not the canned "Left side · 4 min in"', () => {
  const s = addFeed(initTonightState([]), { side: 'R' }, NOW);
  const orb = getOrbView('feed', s.events, NOW);
  assert.equal(orb.title, 'Feed logged');
  assert.match(orb.description, /Right side/);
  assert.ok(!orb.description.includes('4 min in'));
});

check('M2. diaper hero reflects Mixed (both), not the canned "Wet"', () => {
  const s = addDiaper(initTonightState([]), { kind: 'both' }, NOW);
  const orb = getOrbView('diaper', s.events, NOW);
  assert.equal(orb.title, 'Diaper logged');
  assert.match(orb.description, /Mixed/);
});

check('M3. feed hero with no side (Bottle) reads "Bottle"', () => {
  const s = addFeed(initTonightState([]), {}, NOW);
  const orb = getOrbView('feed', s.events, NOW);
  assert.match(orb.description, /Bottle/);
});

check('M4. feed timeline with no side (Bottle) reads "bottle"', () => {
  const s = addFeed(initTonightState([]), {}, NOW);
  const row = getTonightTimeline(s.events, NOW)[0];
  assert.match(row.label, /Feed · bottle/);
});

// N. Night recap (Phase 6) — calm, non-medical summary from local events
check('N1. recap counts feeds/diapers and flags the seed’s running sleep', () => {
  const recap = buildNightRecap(seedEvents);
  assert.equal(recap.feedCount, 1);
  assert.equal(recap.diaperCount, 1);
  assert.equal(recap.noteCount, 0);
  assert.equal(recap.sleepRunning, true);
  assert.equal(recap.longestSleepMin, undefined); // nothing completed yet
  assert.equal(recap.isEmpty, false);
});

check('N2. after Wake baby the recap reports the longest completed sleep', () => {
  let s = initTonightState(seedEvents);
  s = handlePrimaryAction(s, NOW); // ends the running sleep (72m finalize)
  const recap = buildNightRecap(s.events);
  assert.equal(recap.sleepRunning, false);
  assert.equal(recap.longestSleepMin, 72);
  assert.match(recapSummaryLine(recap) ?? '', /longest sleep 1h 12m/);
});

check('N3. an empty event list yields an empty recap and a null summary line', () => {
  const recap = buildNightRecap([]);
  assert.equal(recap.isEmpty, true);
  assert.equal(recapSummaryLine(recap), null);
});

check('N4. the summary line pluralizes and joins with " · "', () => {
  let s = initTonightState([]);
  s = addFeed(s, { side: 'L' }, NOW);
  s = addFeed(s, { side: 'R' }, NOW + 60_000);
  s = addDiaper(s, { kind: 'wet' }, NOW + 120_000);
  const line = recapSummaryLine(buildNightRecap(s.events));
  assert.equal(line, '2 feeds · 1 diaper change');
});

// O. Partner handoff (P0) — newest event drives "who handled the last …"
check('O1. empty events yield a "both ready" handoff (no caregiver, no label)', () => {
  const h = deriveHandoff([]);
  assert.equal(h.caregiverId, null);
  assert.equal(h.eventLabel, null);
});

check('O2. the seed handoff points at the running sleep (newest by createdAt)', () => {
  // Seed order by createdAt: sleep (newest) > diaper > feed. Sleep is running.
  const h = deriveHandoff(seedEvents);
  assert.equal(h.eventLabel, 'sleep start');
  assert.ok(typeof h.caregiverId === 'string');
});

check('O3. a just-saved feed becomes the latest handoff event', () => {
  let s = initTonightState(seedEvents);
  s = addFeed(s, { side: 'R' }, NOW + 10 * 60_000); // after the seed timestamps
  const h = deriveHandoff(s.events);
  assert.equal(h.eventLabel, 'feed');
});

check('O4. completed sleep reads "sleep", running sleep reads "sleep start"', () => {
  const running = deriveHandoff(buildSeedEvents(NOW));
  assert.equal(running.eventLabel, 'sleep start');

  let s = initTonightState(buildSeedEvents(NOW));
  s = handlePrimaryAction(s, NOW); // Wake baby → completes the sleep
  assert.equal(deriveHandoff(s.events).eventLabel, 'sleep');
});

// P. Surface mode resolution (P0.5 night mode)
check('P1. auto resolves to night at late/early hours (20:00–06:59)', () => {
  assert.equal(resolveSurfaceMode('auto', 20), 'night'); // boundary: night starts
  assert.equal(resolveSurfaceMode('auto', 23), 'night');
  assert.equal(resolveSurfaceMode('auto', 0), 'night');
  assert.equal(resolveSurfaceMode('auto', 6), 'night');
});

check('P2. auto resolves to day during daytime hours (07:00–19:59)', () => {
  assert.equal(resolveSurfaceMode('auto', 7), 'day'); // boundary: day starts
  assert.equal(resolveSurfaceMode('auto', 12), 'day');
  assert.equal(resolveSurfaceMode('auto', 19), 'day');
});

check('P3. forced day/night overrides ignore the clock', () => {
  assert.equal(resolveSurfaceMode('day', 3), 'day'); // 3am but forced day
  assert.equal(resolveSurfaceMode('night', 12), 'night'); // noon but forced night
});

// Q. Tonight status copy (P0.5 "time since last…")
check('Q1. status copy reflects seed feed/diaper ages and the running sleep', () => {
  const items = buildTonightStatus(seedEvents, NOW);
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  // seed: feed 123m ago, diaper 96m ago, sleep running 68m
  assert.equal(byKey.feed.label, 'Last feed');
  assert.equal(byKey.feed.value, '2h 03m ago');
  assert.equal(byKey.diaper.value, '1h 36m ago');
  assert.equal(byKey.sleep.label, 'Sleeping');
  assert.equal(byKey.sleep.value, '1h 08m');
});

check('Q2. status copy handles empty events (descriptive, no judgement)', () => {
  const items = buildTonightStatus([], NOW);
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(byKey.feed.value, 'None yet');
  assert.equal(byKey.diaper.value, 'None yet');
  assert.equal(byKey.sleep.label, 'Awake');
  assert.equal(byKey.sleep.value, 'now');
});

// R. Handoff summary (the wedge) — "what happened since you last checked?"
const MOM = 'cg-mom';
const DAD = 'cg-dad';
const SUMMARY_CAREGIVERS: Caregiver[] = [
  { id: MOM, displayName: 'Mom', colorHex: '#FF9E5E', role: 'mom' },
  { id: DAD, displayName: 'Dad', colorHex: '#5560C6', role: 'dad' },
];
// Minimal event factory: createdAt drives the cursor comparison.
const ev = (over: Partial<LogEvent> & Pick<LogEvent, 'type' | 'caregiverId' | 'createdAt'>): LogEvent => ({
  id: `${over.type}-${over.createdAt}`,
  babyId: 'baby-mia',
  startAt: over.createdAt,
  endAt: null,
  meta: {},
  ...over,
});

check('R1. nothing new since the cursor reads "Nothing new…"', () => {
  const events = [ev({ type: 'feed', caregiverId: DAD, createdAt: '2026-06-16T22:00:00.000Z' })];
  const s = buildHandoffSummary(events, SUMMARY_CAREGIVERS, MOM, Date.parse('2026-06-16T23:00:00.000Z'));
  assert.equal(s.hasNew, false);
  assert.equal(s.text, 'Nothing new since you last checked.');
});

check('R2. one feed by the partner is attributed by name', () => {
  const events = [ev({ type: 'feed', caregiverId: DAD, createdAt: '2026-06-16T23:30:00.000Z' })];
  const s = buildHandoffSummary(events, SUMMARY_CAREGIVERS, MOM, Date.parse('2026-06-16T23:00:00.000Z'));
  assert.equal(s.hasNew, true);
  assert.equal(s.text, 'Dad logged 1 feed.');
});

check('R3. multiple event types join naturally', () => {
  const events = [
    ev({ type: 'feed', caregiverId: DAD, createdAt: '2026-06-16T23:10:00.000Z' }),
    ev({ type: 'diaper', caregiverId: DAD, createdAt: '2026-06-16T23:20:00.000Z' }),
    ev({ type: 'note', caregiverId: DAD, createdAt: '2026-06-16T23:30:00.000Z', meta: { label: 'Fussy' } }),
  ];
  const s = buildHandoffSummary(events, SUMMARY_CAREGIVERS, MOM, Date.parse('2026-06-16T23:00:00.000Z'));
  assert.equal(s.text, 'Dad logged 1 feed, 1 diaper and 1 note.');
});

check('R4. a running sleep is reported as currently running', () => {
  const events = [
    ev({ type: 'feed', caregiverId: DAD, createdAt: '2026-06-16T23:10:00.000Z' }),
    ev({ type: 'sleep', caregiverId: DAD, createdAt: '2026-06-16T23:20:00.000Z', endAt: null }),
  ];
  const s = buildHandoffSummary(events, SUMMARY_CAREGIVERS, MOM, Date.parse('2026-06-16T23:00:00.000Z'));
  assert.equal(s.sleepRunning, true);
  assert.equal(s.text, 'Dad logged 1 feed. Sleep is running.');
});

check('R5. only a fresh sleep start reads "… started sleep Nm ago"', () => {
  const now = Date.parse('2026-06-17T00:00:00.000Z');
  const events = [
    ev({ type: 'sleep', caregiverId: DAD, createdAt: '2026-06-16T23:18:00.000Z', startAt: '2026-06-16T23:18:00.000Z', endAt: null }),
  ];
  const s = buildHandoffSummary(events, SUMMARY_CAREGIVERS, MOM, Date.parse('2026-06-16T23:00:00.000Z'), now);
  assert.equal(s.text, 'Dad started sleep 42m ago.');
});

check('R6. my own events read "You logged …" (current caregiver wording)', () => {
  const events = [ev({ type: 'feed', caregiverId: MOM, createdAt: '2026-06-16T23:30:00.000Z' })];
  const s = buildHandoffSummary(events, SUMMARY_CAREGIVERS, MOM, Date.parse('2026-06-16T23:00:00.000Z'));
  assert.equal(s.text, 'You logged 1 feed.');
});

check('R7. no caregivers loaded → neutral "While you were away" fallback (no throw)', () => {
  const events = [ev({ type: 'feed', caregiverId: DAD, createdAt: '2026-06-16T23:30:00.000Z' })];
  const s = buildHandoffSummary(events, [], MOM, Date.parse('2026-06-16T23:00:00.000Z'));
  assert.equal(s.hasNew, true);
  assert.equal(s.text, 'While you were away: 1 feed.');
});

check('R8. mixed caregivers use the neutral framing', () => {
  const events = [
    ev({ type: 'feed', caregiverId: MOM, createdAt: '2026-06-16T23:10:00.000Z' }),
    ev({ type: 'diaper', caregiverId: DAD, createdAt: '2026-06-16T23:20:00.000Z' }),
  ];
  const s = buildHandoffSummary(events, SUMMARY_CAREGIVERS, MOM, Date.parse('2026-06-16T23:00:00.000Z'));
  assert.equal(s.text, 'While you were away: 1 feed and 1 diaper.');
});

check('R9. a null cursor (never checked) counts everything as new', () => {
  const events = [ev({ type: 'feed', caregiverId: DAD, createdAt: '2026-06-16T20:00:00.000Z' })];
  const s = buildHandoffSummary(events, SUMMARY_CAREGIVERS, MOM, null);
  assert.equal(s.hasNew, true);
  assert.equal(s.text, 'Dad logged 1 feed.');
});

// S. Safer Undo (Supabase two-caregiver) — only the current caregiver's newest
// event is removable, so Undo never deletes a partner's newer event.
check('S1. undoLastOwnEvent removes only MY most recent event, never the partner’s', () => {
  const events = [
    ev({ type: 'feed', caregiverId: DAD, createdAt: '2026-06-16T23:40:00.000Z' }), // partner — newest overall
    ev({ type: 'diaper', caregiverId: MOM, createdAt: '2026-06-16T23:30:00.000Z' }), // mine — newest of mine
    ev({ type: 'feed', caregiverId: MOM, createdAt: '2026-06-16T23:10:00.000Z' }), // mine — older
  ];
  const after = undoLastOwnEvent({ events, orbView: 'calm' }, MOM);
  assert.ok(after.events.some((e) => e.caregiverId === DAD), "partner's newer event survives");
  assert.ok(!after.events.some((e) => e.type === 'diaper'), 'my newest (diaper) is removed');
  assert.equal(after.events.filter((e) => e.caregiverId === MOM).length, 1); // older feed remains
  assert.equal(after.events.length, 2);
});

check('S2. plain undo would delete the partner event; undoLastOwnEvent removes mine instead', () => {
  const events = [
    ev({ type: 'feed', caregiverId: DAD, createdAt: '2026-06-16T23:40:00.000Z' }), // partner — newest
    ev({ type: 'diaper', caregiverId: MOM, createdAt: '2026-06-16T23:30:00.000Z' }), // mine
  ];
  // Newest-overall undo (local behavior) would remove the partner's feed…
  const plain = undoLastEvent({ events, orbView: 'calm' });
  assert.ok(!plain.events.some((e) => e.caregiverId === DAD));
  // …the safe variant keeps it and removes my own event.
  const safe = undoLastOwnEvent({ events, orbView: 'calm' }, MOM);
  assert.ok(safe.events.some((e) => e.caregiverId === DAD));
  assert.ok(!safe.events.some((e) => e.caregiverId === MOM));
});

check('S3. undoLastOwnEvent is a calm no-op when the caregiver has nothing to undo', () => {
  const state: TonightState = {
    events: [ev({ type: 'feed', caregiverId: DAD, createdAt: '2026-06-16T23:40:00.000Z' })],
    orbView: 'calm',
  };
  const after = undoLastOwnEvent(state, MOM);
  assert.equal(after, state); // same reference → genuine no-op, shared night untouched
});

check('S4. undoLastOwnEvent reconciles the orb to sleep when a partner sleep is still running', () => {
  const events = [
    ev({ type: 'sleep', caregiverId: DAD, createdAt: '2026-06-16T23:00:00.000Z', endAt: null }),
    ev({ type: 'note', caregiverId: MOM, createdAt: '2026-06-16T23:30:00.000Z', meta: { label: 'Fussy' } }),
  ];
  const after = undoLastOwnEvent({ events, orbView: 'feed' }, MOM);
  assert.equal(after.events.length, 1);
  assert.equal(after.orbView, 'sleep'); // partner's sleep still running → orb stays asleep
});

// T. Handoff reset story — a cleared cursor (what a local demo reset produces)
// brings back the catch-up summary instead of "Nothing new".
check('T1. with a null cursor (post-reset) the seeded night shows its catch-up story', () => {
  const s = buildHandoffSummary(seedEvents, SUMMARY_CAREGIVERS, MOM, null);
  assert.equal(s.hasNew, true);
});

// U. Logging v2 foundation (plan Phase 1.1) — discriminated CareEvent model,
// Clock, id helpers, and validators. These live beside the legacy LogEvent and
// are not wired into the app yet; this section locks down their behavior.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

check('U1. systemClock.now is a number and nowIso round-trips through Date', () => {
  assert.equal(typeof systemClock.now(), 'number');
  assert.ok(!Number.isNaN(Date.parse(systemClock.nowIso())));
});

check('U2. manual clock reports, sets, and advances a controllable "now"', () => {
  const clock = createManualClock(NOW);
  assert.equal(clock.now(), NOW);
  assert.equal(clock.nowIso(), new Date(NOW).toISOString());
  clock.advance(60_000);
  assert.equal(clock.now(), NOW + 60_000);
  clock.set(NOW);
  assert.equal(clock.now(), NOW);
});

check('U3. newUuid is a v4 UUID and successive ids/clientEventIds are unique', () => {
  const a = newUuid();
  const b = newUuid();
  assert.match(a, UUID_RE);
  assert.match(b, UUID_RE);
  assert.notEqual(a, b);
  assert.notEqual(newClientEventId(), newClientEventId());
});

check('U4. validateBottleAmount accepts a positive amount, rejects 0/negative/garbage/over-max', () => {
  assert.equal(validateBottleAmount(120).ok, true);
  assert.equal(validateBottleAmount(0).ok, false);
  assert.equal(validateBottleAmount(-10).ok, false);
  assert.equal(validateBottleAmount(Number.NaN).ok, false);
  assert.equal(validateBottleAmount(Number.POSITIVE_INFINITY).ok, false);
  assert.equal(validateBottleAmount(99999).ok, false);
});

check('U5. validateSessionRange enforces ordering, allows still-running, rejects future start', () => {
  const start = '2026-06-17T00:00:00.000Z';
  const later = '2026-06-17T00:40:00.000Z';
  assert.equal(validateSessionRange(start, later).ok, true);
  assert.equal(validateSessionRange(start, null).ok, true); // still running
  assert.equal(validateSessionRange(later, start).ok, false); // ends before it starts
  assert.equal(validateSessionRange('not-a-date', null).ok, false);
  const future = new Date(NOW + 60_000).toISOString();
  assert.equal(validateSessionRange(future, null, NOW).ok, false); // started_in_future
});

check('U6. validateBreastSegments accepts a clean chain and one trailing open segment', () => {
  const closed: BreastSideSegment = {
    id: 's1',
    side: 'left',
    startedAt: '2026-06-17T00:00:00.000Z',
    endedAt: '2026-06-17T00:05:00.000Z',
  };
  const open: BreastSideSegment = {
    id: 's2',
    side: 'right',
    startedAt: '2026-06-17T00:05:00.000Z',
    endedAt: null,
  };
  assert.equal(validateBreastSegments([]).ok, true); // empty is structurally valid
  assert.equal(validateBreastSegments([open]).ok, true); // single open
  assert.equal(validateBreastSegments([closed, open]).ok, true); // switch L→R
});

check('U7. validateBreastSegments rejects an open non-last segment and overlaps', () => {
  const openFirst: BreastSideSegment = {
    id: 's1',
    side: 'left',
    startedAt: '2026-06-17T00:00:00.000Z',
    endedAt: null,
  };
  const second: BreastSideSegment = {
    id: 's2',
    side: 'right',
    startedAt: '2026-06-17T00:05:00.000Z',
    endedAt: '2026-06-17T00:08:00.000Z',
  };
  assert.equal(validateBreastSegments([openFirst, second]).ok, false); // open must be last

  const a: BreastSideSegment = {
    id: 'a',
    side: 'left',
    startedAt: '2026-06-17T00:00:00.000Z',
    endedAt: '2026-06-17T00:05:00.000Z',
  };
  const overlapping: BreastSideSegment = {
    id: 'b',
    side: 'right',
    startedAt: '2026-06-17T00:03:00.000Z', // starts before `a` ended
    endedAt: null,
  };
  assert.equal(validateBreastSegments([a, overlapping]).ok, false);
});

check('U8. validatePumpVolumes: both 50/60 ok, save-without-volume ok, side mismatch rejected', () => {
  assert.equal(validatePumpVolumes({ side: 'both', leftVolumeMl: 50, rightVolumeMl: 60 }).ok, true);
  assert.equal(validatePumpVolumes({ side: 'left', leftVolumeMl: null, rightVolumeMl: null }).ok, true);
  assert.equal(validatePumpVolumes({ side: 'left', leftVolumeMl: 80, rightVolumeMl: null }).ok, true);
  assert.equal(validatePumpVolumes({ side: 'left', leftVolumeMl: 80, rightVolumeMl: 60 }).ok, false);
  assert.equal(validatePumpVolumes({ side: 'both', leftVolumeMl: 0, rightVolumeMl: 60 }).ok, false); // 0 not allowed
});

check('U9. validateDiaperKind accepts the four kinds and rejects legacy "mixed"', () => {
  assert.equal(validateDiaperKind('wet').ok, true);
  assert.equal(validateDiaperKind('dirty').ok, true);
  assert.equal(validateDiaperKind('both').ok, true);
  assert.equal(validateDiaperKind('dry').ok, true);
  assert.equal(validateDiaperKind('mixed').ok, false);
});

check('U10. CareEvent type guards narrow each event to its concrete shape', () => {
  const base = (over: Partial<CareEventBase> = {}): CareEventBase => ({
    id: 'evt-1',
    clientEventId: 'cid-1',
    familyId: 'fam-1',
    childId: 'baby-mia',
    createdByUserId: 'cg-mom',
    type: 'feed',
    status: 'completed',
    occurredAt: '2026-06-17T00:00:00.000Z',
    startedAt: null,
    endedAt: null,
    timezoneOffsetMinutes: 0,
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt: '2026-06-17T00:00:00.000Z',
    syncStatus: 'local',
    version: 1,
    ...over,
  });

  const breast: BreastFeedEvent = {
    ...base({ status: 'active' }),
    type: 'feed',
    childId: 'baby-mia',
    method: 'breast',
    details: { activeSide: 'left', segments: [], totalLeftMs: 0, totalRightMs: 0 },
  };
  const bottle: BottleFeedEvent = {
    ...base(),
    type: 'feed',
    childId: 'baby-mia',
    status: 'completed',
    method: 'bottle',
    details: { amountMl: 120, milkType: 'formula' },
  };
  const sleep: SleepEvent = {
    ...base({ type: 'sleep', status: 'active' }),
    type: 'sleep',
    childId: 'baby-mia',
    details: { sleepType: 'night' },
  };
  const diaper: DiaperEvent = {
    ...base({ type: 'diaper' }),
    type: 'diaper',
    childId: 'baby-mia',
    status: 'completed',
    details: { kind: 'wet' },
  };
  const pump: PumpEvent = {
    ...base({ type: 'pump', childId: null }),
    type: 'pump',
    childId: null,
    subjectUserId: 'cg-mom',
    details: { side: 'both', leftVolumeMl: null, rightVolumeMl: null },
  };

  assert.ok(isBreastFeed(breast) && !isBottleFeed(breast));
  assert.ok(isBottleFeed(bottle) && !isBreastFeed(bottle));
  assert.ok(isSleepEvent(sleep) && !isPumpEvent(sleep));
  assert.ok(isDiaperEvent(diaper) && !isSleepEvent(diaper));
  assert.ok(isPumpEvent(pump) && pump.childId === null);
  // The guard narrows: these property accesses are type-checked by tsc.
  assert.equal(breast.details.activeSide, 'left');
  assert.equal(bottle.details.amountMl, 120);
});

// V. Logging v2 repository + mapper + feature flag (plan Phase 1.2). These are
// async (the repository contract returns Promises), so they run after the sync
// checks above and print the final summary on completion.
async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function runAsyncChecks(): Promise<void> {
  const iso = (msValue: number) => new Date(msValue).toISOString();

  const careBase = (over: Partial<CareEventBase> = {}): CareEventBase => ({
    id: 'evt',
    clientEventId: 'cid',
    familyId: 'fam-1',
    childId: 'baby-mia',
    createdByUserId: 'cg-mom',
    type: 'diaper',
    status: 'completed',
    occurredAt: iso(NOW),
    startedAt: null,
    endedAt: null,
    timezoneOffsetMinutes: 0,
    createdAt: iso(NOW),
    updatedAt: iso(NOW),
    syncStatus: 'local',
    version: 1,
    ...over,
  });

  const makeDiaper = (id: string, cid: string, over: Partial<CareEventBase> = {}): DiaperEvent => ({
    ...careBase({ id, clientEventId: cid, type: 'diaper', ...over }),
    type: 'diaper',
    childId: 'baby-mia',
    status: 'completed',
    details: { kind: 'wet' },
  });

  const makeSleep = (id: string, cid: string, status: 'active' | 'completed'): SleepEvent => ({
    ...careBase({
      id,
      clientEventId: cid,
      type: 'sleep',
      status,
      startedAt: iso(NOW),
      endedAt: status === 'completed' ? iso(NOW + 60_000) : null,
    }),
    type: 'sleep',
    childId: 'baby-mia',
    details: { sleepType: 'night' },
  });

  const makePump = (id: string, cid: string, subjectUserId: string): PumpEvent => ({
    ...careBase({ id, clientEventId: cid, type: 'pump', status: 'active', childId: null, startedAt: iso(NOW) }),
    type: 'pump',
    childId: null,
    subjectUserId,
    details: { side: 'both', leftVolumeMl: null, rightVolumeMl: null },
  });

  await checkAsync('V1. createEvent stores an event; getTodayEvents returns it; retry is idempotent by clientEventId', async () => {
    const repo = createLoggingRepository(createInMemoryLoggingPersistence(), createManualClock(NOW));
    const diaper = makeDiaper('evt-d1', 'cid-d1');
    await repo.createEvent(diaper);
    await repo.createEvent(diaper); // retried create — same clientEventId, must not duplicate
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.equal(today.length, 1);
    assert.equal(today[0].id, 'evt-d1');
  });

  await checkAsync('V2. getActiveSessions returns active sleep (by child) + pump (by caregiver), excludes completed and other caregivers', async () => {
    const repo = createLoggingRepository(createInMemoryLoggingPersistence(), createManualClock(NOW));
    await repo.createEvent(makeSleep('evt-s1', 'cid-s1', 'active'));
    await repo.createEvent(makeSleep('evt-s2', 'cid-s2', 'completed'));
    await repo.createEvent(makePump('evt-p1', 'cid-p1', 'cg-mom'));
    await repo.createEvent(makePump('evt-p2', 'cid-p2', 'cg-dad')); // a different caregiver's pump
    const active = await repo.getActiveSessions({ familyId: 'fam-1', childId: 'baby-mia', userId: 'cg-mom' });
    assert.deepEqual(active.map((e) => e.id).sort(), ['evt-p1', 'evt-s1']);
  });

  await checkAsync('V3. updateEvent bumps version/updatedAt; softDeleteEvent hides the event from the timeline', async () => {
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(createInMemoryLoggingPersistence(), clock);
    const diaper = makeDiaper('evt-d1', 'cid-d1');
    await repo.createEvent(diaper);
    clock.advance(60_000);
    const updated: DiaperEvent = { ...diaper, details: { kind: 'dirty' } };
    await repo.updateEvent(updated);
    let today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.equal(today.length, 1);
    assert.equal(today[0].version, 2); // bumped from 1
    assert.equal((today[0] as DiaperEvent).details.kind, 'dirty');
    assert.equal(today[0].updatedAt, iso(NOW + 60_000));
    await repo.softDeleteEvent('evt-d1');
    today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.equal(today.length, 0); // soft-deleted → not shown in the timeline
  });

  await checkAsync('V4. enqueueSync queues an id once (deduped)', async () => {
    const port = createInMemoryLoggingPersistence();
    const repo = createLoggingRepository(port, createManualClock(NOW));
    await repo.enqueueSync('evt-d1');
    await repo.enqueueSync('evt-d1'); // duplicate
    await repo.enqueueSync('evt-d2');
    const snap = await port.load();
    assert.deepEqual(snap.syncQueue, ['evt-d1', 'evt-d2']);
  });

  await checkAsync('V5. getTodayEvents excludes events from a previous day', async () => {
    const repo = createLoggingRepository(createInMemoryLoggingPersistence(), createManualClock(NOW));
    await repo.createEvent(makeDiaper('evt-today', 'cid-today'));
    await repo.createEvent(makeDiaper('evt-old', 'cid-old', { occurredAt: iso(NOW - 2 * 86_400_000) }));
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.deepEqual(today.map((e) => e.id), ['evt-today']);
  });

  await checkAsync('V6. legacyEventToCareEvent maps breast/bottle/sleep/diaper/pump and skips notes', async () => {
    const legacyBreast: LogEvent = {
      id: 'l-feed-L',
      babyId: 'baby-mia',
      caregiverId: 'cg-mom',
      type: 'feed',
      startAt: '2026-06-17T00:00:00.000Z',
      endAt: '2026-06-17T00:10:00.000Z',
      meta: { side: 'L' },
      createdAt: '2026-06-17T00:10:00.000Z',
    };
    const breast = legacyEventToCareEvent(legacyBreast);
    assert.ok(breast && isBreastFeed(breast));
    if (breast && isBreastFeed(breast)) {
      assert.equal(breast.familyId, 'baby-mia'); // familyId mirrors baby scope (audit §13)
      assert.equal(breast.clientEventId, 'l-feed-L'); // legacy id → stable idempotency key
      assert.equal(breast.details.segments.length, 1);
      assert.equal(breast.details.totalLeftMs, 10 * 60_000);
      assert.equal(breast.details.totalRightMs, 0);
      assert.equal(breast.status, 'completed');
    }

    const bottle = legacyEventToCareEvent({ ...legacyBreast, id: 'l-bottle', meta: { amountMl: 120 } });
    assert.ok(bottle && isBottleFeed(bottle));
    if (bottle && isBottleFeed(bottle)) {
      assert.equal(bottle.details.amountMl, 120);
      assert.equal(bottle.details.milkType, 'other');
    }

    const legacySleep: LogEvent = {
      id: 'l-sleep',
      babyId: 'baby-mia',
      caregiverId: 'cg-mom',
      type: 'sleep',
      startAt: '2026-06-17T00:00:00.000Z',
      endAt: null,
      meta: {},
      createdAt: '2026-06-17T00:00:00.000Z',
    };
    const sleep = legacyEventToCareEvent(legacySleep);
    assert.ok(sleep && isSleepEvent(sleep) && sleep.status === 'active'); // running sleep → active

    const diaper = legacyEventToCareEvent({ ...legacySleep, id: 'l-diaper', type: 'diaper', meta: { kind: 'both' } });
    assert.ok(diaper && isDiaperEvent(diaper) && diaper.details.kind === 'both');

    const pump = legacyEventToCareEvent({ ...legacySleep, id: 'l-pump', type: 'pump', endAt: '2026-06-17T00:15:00.000Z', meta: { side: 'R' } });
    assert.ok(pump && isPumpEvent(pump));
    if (pump && isPumpEvent(pump)) {
      assert.equal(pump.details.side, 'right');
      assert.equal(pump.subjectUserId, 'cg-mom');
      assert.equal(pump.details.leftVolumeMl, null);
    }

    const note = legacyEventToCareEvent({ ...legacySleep, id: 'l-note', type: 'note', meta: { label: 'Fussy' } });
    assert.equal(note, null); // notes are out of scope for the four core flows

    assert.equal(mapLegacyEvents([legacyBreast, legacySleep, { ...legacySleep, id: 'l-note', type: 'note', meta: {} }]).length, 2);
  });

  await checkAsync('V7. careEventToLegacyEvent preserves what the legacy shape can hold', async () => {
    const bottle: BottleFeedEvent = {
      ...careBase({ id: 'c-bottle', clientEventId: 'c-bottle' }),
      type: 'feed',
      childId: 'baby-mia',
      status: 'completed',
      method: 'bottle',
      details: { amountMl: 90, milkType: 'formula' },
    };
    const bottleBack = careEventToLegacyEvent(bottle);
    assert.equal(bottleBack.type, 'feed');
    assert.equal(bottleBack.meta.amountMl, 90);
    assert.equal(bottleBack.babyId, 'baby-mia');

    const pump: PumpEvent = {
      ...careBase({ id: 'c-pump', clientEventId: 'c-pump', type: 'pump', childId: null }),
      type: 'pump',
      childId: null,
      subjectUserId: 'cg-mom',
      details: { side: 'left', leftVolumeMl: 50, rightVolumeMl: null },
    };
    assert.equal(careEventToLegacyEvent(pump).meta.side, 'L');
    assert.equal(careEventToLegacyEvent(pump).babyId, ''); // childId null → placeholder (lossy)

    const diaperDry: DiaperEvent = {
      ...careBase({ id: 'c-dry', clientEventId: 'c-dry', type: 'diaper' }),
      type: 'diaper',
      childId: 'baby-mia',
      status: 'completed',
      details: { kind: 'dry' },
    };
    assert.equal(careEventToLegacyEvent(diaperDry).meta.kind, undefined); // 'dry' has no legacy kind
  });

  await checkAsync('V8. logging snapshot serialize → parse round-trips events + queue; bad input degrades safely', async () => {
    const snapshot = { events: [makeDiaper('evt-d1', 'cid-d1')], syncQueue: ['evt-d1'] };
    const restored = parseLoggingSnapshot(serializeLoggingSnapshot(snapshot));
    assert.ok(restored && restored.events.length === 1);
    assert.deepEqual(restored?.syncQueue, ['evt-d1']);
    assert.equal(parseLoggingSnapshot(null), null);
    assert.equal(parseLoggingSnapshot('not json {'), null);
    // a malformed row is dropped rather than failing the whole load
    const partial = parseLoggingSnapshot(JSON.stringify({ events: [{ id: 'x' }], syncQueue: [] }));
    assert.ok(partial && partial.events.length === 0);
  });

  await checkAsync('V9. loggingV2 flag honors a runtime override and resolves as a flag set', async () => {
    resetLoggingFlags();
    assert.equal(typeof isLoggingV2Enabled(), 'boolean');
    setLoggingV2Enabled(true);
    assert.equal(isLoggingV2Enabled(), true);
    assert.equal(resolveLoggingFlags().loggingV2, true);
    setLoggingV2Enabled(false);
    assert.equal(isLoggingV2Enabled(), false);
    resetLoggingFlags();
  });
}

runAsyncChecks()
  .then(() => {
    console.log(`\nAll ${passed} checks passed ✅`);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
