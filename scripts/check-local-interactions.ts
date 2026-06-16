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
  cappedTimeline,
  handleDiaperTap,
  handleFeedTap,
  handlePrimaryAction,
  handleSleepTap,
  initTonightState,
  type TonightState,
} from '../src/data/localInteractions';
import { events as seedEvents } from '../src/data/mock';
import type { LogEventType } from '../src/data/models';

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

console.log(`\nAll ${passed} checks passed ✅`);
