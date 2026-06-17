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
  addNote,
  cappedTimeline,
  handleDiaperTap,
  handleFeedTap,
  handlePrimaryAction,
  handleSleepTap,
  initTonightState,
  undoLastEvent,
  type TonightState,
} from '../src/data/localInteractions';
import { calmDescription, deriveNightStatus, getOrbView } from '../src/data/currentState';
import { events as seedEvents } from '../src/data/mock';
import type { LogEventType } from '../src/data/models';
import { parsePersistedState, serializeState } from '../src/data/persistedState';

// Fixed reference time so results are deterministic regardless of the real clock.
const NOW = Date.parse('2026-06-17T00:00:00.000Z');

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

console.log(`\nAll ${passed} checks passed ✅`);
