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
import { readFileSync } from 'node:fs';

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
  formatBabyAge,
  getOrbView,
  recapSummaryLine,
} from '../src/data/currentState';
import {
  FIRST_LOG_COACH_DISMISSED_KEY,
  firstLogNudgeText,
  firstLogThreadText,
  resolveFirstLogCoachPhase,
  tonightCalibratingText,
} from '../src/components/firstLogCoach';
import { buildSeedEvents, caregivers as seedCaregivers, getTonightTimeline } from '../src/data/mock';
import {
  DEFAULT_LOCAL_BABY_NAME,
  DEFAULT_LOCAL_CAREGIVER_NAME,
  LOCAL_BABY_ID,
  LOCAL_CAREGIVER_ID,
  birthDateFromWeeks,
  createLocalBaby,
  parseLocalBaby,
  parseWeeks,
  serializeLocalBaby,
} from '../src/data/localBaby';
import type { Caregiver, LogEvent, LogEventType } from '../src/data/models';
import { resolveSurfaceMode } from '../src/theme';
import { parsePersistedState, serializeState } from '../src/data/persistedState';
// Guest / local-first data preservation contract (auth Step 08) — the keys that
// must survive every auth transition + the "no silent data loss" predicate.
import {
  GUEST_OWNED_STORAGE_KEYS,
  LOCAL_BABY_STORAGE_KEY,
  LOCAL_EVENTS_STORAGE_KEY,
  LOGGING_STORAGE_KEY,
  isGuestDataPreserved,
} from '../src/data/guestData';
import {
  ONBOARDING_COMPLETE_KEY,
  isForceOnboardingEnabled,
  resolveOnboardingGateState,
} from '../src/components/onboarding/onboardingStorage';
import {
  INITIAL_ONBOARDING_FLOW,
  ONBOARDING_STEP_ORDER,
  isOnboardingComplete,
  onboardingFlowReducer,
  onboardingStepIndex,
  type OnboardingFlowState,
} from '../src/components/onboarding/onboardingFlow';
import {
  hasOnboardingFocusNeed,
  toggleOnboardingFocusNeed,
  type OnboardingFocusNeed,
} from '../src/components/onboarding/onboardingFocus';
import {
  ONBOARDING_NIGHT_SHIFT_CHOICES,
  hasOnboardingNightShiftChoice,
  type OnboardingNightShiftChoice,
} from '../src/components/onboarding/onboardingNightShift';
// Auth Phase 1 — secure session storage: the pure chunking core behind the
// SecureStore adapter. The adapter itself (secureSessionStore.ts) imports
// react-native / expo-secure-store and can't load here, so the chunk logic lives
// in this dependency-free leaf and is covered directly.
import {
  CHUNK_SIZE,
  createChunkedStorage,
  splitIntoChunks,
  type ChunkBackend,
} from '../src/lib/chunkedSessionStorage';
// Auth deep-link foundation (Step 04) — the pure redirect parser behind the
// password-reset / email-confirmation handler. authLinking.ts imports
// expo-linking + the Supabase client and can't load here, so the parsing logic
// lives in this dependency-free leaf and is covered directly.
import { parseAuthRedirect } from '../src/lib/authRedirect';
// Account-entry visibility (this task) — the pure "no Supabase session → which
// surface?" decision behind the AuthProvider bootstrap.
import { resolveNoSessionStatus } from '../src/state/authStatusResolver';
// Logging v2 foundation (plan Phase 1.1) — new model lives beside the legacy one.
import { createManualClock, systemClock } from '../src/features/logging/timer/clock';
import { newClientEventId, newUuid } from '../src/features/logging/domain/ids';
import {
  BOTTLE_MAX_ML,
  PUMP_MAX_ML,
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
  CareEvent,
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
// Logging v2 active-session model + timestamp-based timers (plan §1.3, §6, Phase 4).
import {
  breastSegmentTotals,
  elapsedMs,
  formatClock,
  formatCompactDuration,
  isReversedRange,
  sessionElapsedMs,
} from '../src/features/logging/timer/sessionMath';
import {
  applyActiveSessions,
  applyTodayEvents,
  clearError,
  createInitialLoggingState,
  withError,
} from '../src/features/logging/state/loggingStore';
import {
  pumpTotalVolumeMl,
  selectActiveBreastFeed,
  selectActivePump,
  selectActiveSleep,
  selectIsAnySessionActive,
} from '../src/features/logging/state/loggingSelectors';
import {
  hydrateLoggingState,
  reconcileLoggingState,
} from '../src/features/logging/state/loggingHydration';
// Logging v2 timeline + quick-log presentation selectors (plan §7.1, §7.4, task 09).
import {
  buildV2QuickLogSubtitles,
  buildV2TonightStatus,
  formatLoggingToast,
  formatTimelineEvent,
} from '../src/features/logging/state/timelineSelectors';
import { buildV2HistoryTimeline } from '../src/features/logging/state/historyTimeline';
import { buildInsightsViewModel } from '../src/features/insights/insightSelectors';
import { getInsightsViewModel } from '../src/features/insights/getInsightsViewModel';
import { loggingError } from '../src/features/logging/domain/errors';
// Logging v2 Feed use-cases (plan Phase 3 & 5, task 05) — pure async functions
// over an in-memory repository + a fake clock.
import {
  INSIGHTS_HISTORY_WINDOW_MS,
  buildUndoableMutation,
  cancelBreastFeed,
  cancelPump,
  cancelSleep,
  finishBreastFeed,
  finishPump,
  finishSleep,
  saveBottleFeed,
  saveCompletedSleep,
  saveDiaper,
  savePump,
  getInsightsSevenDayHistory,
  startBreastFeed,
  startPump,
  startSleep,
  switchBreastSide,
  undoLoggingMutation,
  type LoggingActor,
} from '../src/features/logging/application';

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

// G4-G6. First-run onboarding gate selection (pure resolver, no RN render needed)
check('G4. onboarding not completed selects OnboardingScreen', () => {
  assert.equal(ONBOARDING_COMPLETE_KEY, 'lullaby.onboarding.v2.complete');
  assert.equal(resolveOnboardingGateState(false, { rawFlag: 'false', isDev: true }), 'needed');
});

check('G5. onboarding completed continues the normal app flow', () => {
  assert.equal(resolveOnboardingGateState(true, { rawFlag: 'false', isDev: true }), 'complete');
});

check('G6. force onboarding selects OnboardingScreen even when completed', () => {
  assert.equal(isForceOnboardingEnabled({ rawFlag: 'true', isDev: true }), true);
  assert.equal(resolveOnboardingGateState(true, { rawFlag: 'true', isDev: true }), 'needed');
  assert.equal(resolveOnboardingGateState(true, { rawFlag: 'true', isDev: false }), 'complete');
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

check('M4. feed timeline with no side (Bottle) reads "Bottle"', () => {
  const s = addFeed(initTonightState([]), {}, NOW);
  const row = getTonightTimeline(s.events, NOW)[0];
  assert.match(row.label, /Bottle/);
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
  s = handlePrimaryAction(s, NOW); // ends the running sleep at NOW (real elapsed)
  const recap = buildNightRecap(s.events);
  assert.equal(recap.sleepRunning, false);
  // The seed sleep began 68m before NOW; finishing at NOW logs the real 68m, not
  // the old hardcoded 72m "+SLEEP_FINALIZE_MIN" finalize (the fixed audit bug).
  assert.equal(recap.longestSleepMin, 68);
  assert.match(recapSummaryLine(recap) ?? '', /longest sleep 1h 08m/);
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

// W. Local baby creation (Phase 0b) — the pure createLocalBaby factory + the
// weeks→birthDate helper that the live setup flow (Phase 1A) will write through
// AuthProvider. The seed stays the fallback until createLocalBaby actually runs.
const LB_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const lbDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

check('W1. birthDateFromWeeks maps whole weeks to an ISO date relative to now', () => {
  assert.equal(birthDateFromWeeks(0, NOW), lbDay(NOW));
  assert.equal(birthDateFromWeeks(6, NOW), lbDay(NOW - 6 * LB_WEEK_MS));
});

check('W2. birthDateFromWeeks clamps negative / non-finite weeks and floors fractions', () => {
  assert.equal(birthDateFromWeeks(-3, NOW), lbDay(NOW)); // negative → newborn (today)
  assert.equal(birthDateFromWeeks(Number.NaN, NOW), lbDay(NOW));
  assert.equal(birthDateFromWeeks(2.9, NOW), lbDay(NOW - 2 * LB_WEEK_MS)); // 2.9 → 2 whole weeks
});

check('W3. createLocalBaby builds a baby + caregiver from full inputs (trimmed)', () => {
  const { baby, caregiver } = createLocalBaby(
    { babyName: '  Noa  ', birthDate: '2026-05-01', caregiverName: '  Sam ', role: 'dad' },
    NOW,
  );
  assert.equal(baby.id, LOCAL_BABY_ID);
  assert.equal(baby.name, 'Noa');
  assert.equal(baby.birthDate, '2026-05-01');
  assert.equal(baby.avatarKey, 'default');
  assert.equal(baby.createdBy, LOCAL_CAREGIVER_ID);
  assert.equal(caregiver.id, LOCAL_CAREGIVER_ID);
  assert.equal(caregiver.displayName, 'Sam');
  assert.equal(caregiver.role, 'dad');
  assert.equal(caregiver.colorHex, '#5560C6'); // dad brand color
  // The real local ids never collide with the demo seed (baby-mia / cg-mom).
  assert.notEqual(baby.id, 'baby-mia');
  assert.notEqual(caregiver.id, 'cg-mom');
});

check('W4. createLocalBaby fills calm defaults for the skip / "Set up later" path', () => {
  const { baby, caregiver } = createLocalBaby({}, NOW);
  assert.equal(baby.name, DEFAULT_LOCAL_BABY_NAME); // "Your baby"
  assert.equal(baby.birthDate, birthDateFromWeeks(0, NOW)); // generic newborn
  assert.equal(caregiver.displayName, DEFAULT_LOCAL_CAREGIVER_NAME); // "Mom"
  assert.equal(caregiver.role, 'mom');
  assert.equal(caregiver.colorHex, '#FF9E5E'); // mom brand color (role default)
});

check('W5. blank / whitespace-only inputs fall back to defaults', () => {
  const { baby, caregiver } = createLocalBaby(
    { babyName: '   ', caregiverName: '', colorHex: '   ' },
    NOW,
  );
  assert.equal(baby.name, DEFAULT_LOCAL_BABY_NAME);
  assert.equal(caregiver.displayName, DEFAULT_LOCAL_CAREGIVER_NAME);
  assert.equal(caregiver.colorHex, '#FF9E5E'); // blank colorHex → role color
});

check('W6. an explicit colorHex overrides the role color', () => {
  assert.equal(createLocalBaby({ role: 'mom', colorHex: '#123456' }, NOW).caregiver.colorHex, '#123456');
});

check('W7. createLocalBaby is pure — same (input, now) deep-equals', () => {
  const input = { babyName: 'Mia', role: 'other' as const };
  assert.deepEqual(createLocalBaby(input, NOW), createLocalBaby(input, NOW));
});

check('W8. birthDate from the age control flows through createLocalBaby unchanged', () => {
  const birthDate = birthDateFromWeeks(8, NOW);
  assert.equal(createLocalBaby({ babyName: 'Eli', birthDate }, NOW).baby.birthDate, birthDate);
});

check('W9. serialize → parse round-trips the local baby record', () => {
  const record = createLocalBaby({ babyName: 'Ivy', birthDate: '2026-04-10', role: 'mom' }, NOW);
  assert.deepEqual(parseLocalBaby(serializeLocalBaby(record)), record);
});

check('W10. parseLocalBaby rejects junk so the caller falls back to the seed', () => {
  assert.equal(parseLocalBaby(null), null); // nothing saved
  assert.equal(parseLocalBaby('not json {'), null); // unparseable
  assert.equal(parseLocalBaby('42'), null); // not an object
  assert.equal(parseLocalBaby('{"caregiver":{}}'), null); // missing baby
  const onlyBaby = JSON.stringify({ baby: createLocalBaby({}, NOW).baby });
  assert.equal(parseLocalBaby(onlyBaby), null); // missing caregiver
  const badRole = JSON.stringify({
    baby: createLocalBaby({}, NOW).baby,
    caregiver: { ...createLocalBaby({}, NOW).caregiver, role: 'grandma' },
  });
  assert.equal(parseLocalBaby(badRole), null); // unknown caregiver role
});

// X. Setup field helpers (Phase 1A foundation) — parseWeeks now lives beside
// birthDateFromWeeks in localBaby (single source, extracted from BabySetupScreen).
check('X1. parseWeeks reads a whole-week number, trims, and floors fractions', () => {
  assert.equal(parseWeeks('7'), 7);
  assert.equal(parseWeeks('  12 '), 12); // surrounding whitespace trimmed
  assert.equal(parseWeeks('2.9'), 2); // fraction floored to whole weeks
  assert.equal(parseWeeks('0'), 0); // newborn
});

check('X2. parseWeeks rejects blank / non-numeric / out-of-range input as null', () => {
  assert.equal(parseWeeks(''), null);
  assert.equal(parseWeeks('   '), null);
  assert.equal(parseWeeks('abc'), null);
  assert.equal(parseWeeks('-1'), null); // negative age
  assert.equal(parseWeeks('261'), null); // > 260 weeks (~5y) → out of range
  assert.equal(parseWeeks('260'), 260); // upper boundary stays valid
});

// Y. Onboarding flow reducer (Phase 1A foundation) — the pure step machine behind
// useOnboardingFlow: beat -> baby -> focus -> nightShift -> nightReassurance
// -> creating -> done. Early skips jump straight to creating; night-shift skip
// still pauses on the reassurance handoff before creation.
const flow = (step: OnboardingFlowState['step']): OnboardingFlowState => ({ step });

check('Y1. the flow starts on the emotional beat', () => {
  assert.equal(INITIAL_ONBOARDING_FLOW.step, 'beat');
});

check('Y2. begin -> baby, submit -> focus -> nightShift -> nightReassurance -> creating -> done', () => {
  let s: OnboardingFlowState = INITIAL_ONBOARDING_FLOW;
  s = onboardingFlowReducer(s, { type: 'begin' });
  assert.equal(s.step, 'baby');
  s = onboardingFlowReducer(s, { type: 'submit' });
  assert.equal(s.step, 'focus');
  s = onboardingFlowReducer(s, { type: 'submit' });
  assert.equal(s.step, 'nightShift');
  s = onboardingFlowReducer(s, { type: 'submit' });
  assert.equal(s.step, 'nightReassurance');
  s = onboardingFlowReducer(s, { type: 'submit' });
  assert.equal(s.step, 'creating');
  s = onboardingFlowReducer(s, { type: 'created' });
  assert.equal(s.step, 'done');
  assert.equal(INITIAL_ONBOARDING_FLOW.step, 'beat'); // the shared initial constant was not mutated
});

check('Y3. skip jumps early setup to creating, but nightShift skip routes to reassurance', () => {
  assert.equal(onboardingFlowReducer(flow('beat'), { type: 'skip' }).step, 'creating');
  assert.equal(onboardingFlowReducer(flow('baby'), { type: 'skip' }).step, 'creating');
  assert.equal(onboardingFlowReducer(flow('focus'), { type: 'skip' }).step, 'creating');
  assert.equal(onboardingFlowReducer(flow('nightShift'), { type: 'skip' }).step, 'nightReassurance');
});

check('Y4. back returns reassurance to nightShift, then focus, baby, and beat', () => {
  assert.equal(onboardingFlowReducer(flow('nightReassurance'), { type: 'back' }).step, 'nightShift');
  assert.equal(onboardingFlowReducer(flow('nightShift'), { type: 'back' }).step, 'focus');
  assert.equal(onboardingFlowReducer(flow('focus'), { type: 'back' }).step, 'baby');
  assert.equal(onboardingFlowReducer(flow('baby'), { type: 'back' }).step, 'beat');
});

check('Y5. reset returns to the beat from anywhere (and is a no-op on the beat)', () => {
  assert.equal(onboardingFlowReducer(flow('done'), { type: 'reset' }).step, 'beat');
  const beat = flow('beat');
  assert.equal(onboardingFlowReducer(beat, { type: 'reset' }), beat); // same reference
});

check('Y6. out-of-order actions are no-ops that return the same state reference', () => {
  const creating = flow('creating');
  assert.equal(onboardingFlowReducer(creating, { type: 'begin' }), creating);
  assert.equal(onboardingFlowReducer(creating, { type: 'submit' }), creating);
  assert.equal(onboardingFlowReducer(creating, { type: 'back' }), creating);
  const nightShift = flow('nightShift');
  assert.equal(onboardingFlowReducer(nightShift, { type: 'begin' }), nightShift);
  assert.equal(onboardingFlowReducer(nightShift, { type: 'created' }), nightShift);
  const nightReassurance = flow('nightReassurance');
  assert.equal(onboardingFlowReducer(nightReassurance, { type: 'begin' }), nightReassurance);
  assert.equal(onboardingFlowReducer(nightReassurance, { type: 'created' }), nightReassurance);
  assert.equal(onboardingFlowReducer(nightReassurance, { type: 'skip' }), nightReassurance);
  const focus = flow('focus');
  assert.equal(onboardingFlowReducer(focus, { type: 'begin' }), focus);
  assert.equal(onboardingFlowReducer(focus, { type: 'created' }), focus);
  const done = flow('done');
  assert.equal(onboardingFlowReducer(done, { type: 'created' }), done);
  assert.equal(onboardingFlowReducer(done, { type: 'skip' }), done);
});

check('Y7. step index follows the canonical order and completion is done-only', () => {
  assert.deepEqual([...ONBOARDING_STEP_ORDER], [
    'beat',
    'baby',
    'focus',
    'nightShift',
    'nightReassurance',
    'creating',
    'done',
  ]);
  assert.equal(onboardingStepIndex('beat'), 0);
  assert.equal(onboardingStepIndex('done'), 6);
  assert.ok(onboardingStepIndex('baby') < onboardingStepIndex('focus'));
  assert.ok(onboardingStepIndex('focus') < onboardingStepIndex('nightShift'));
  assert.ok(onboardingStepIndex('nightShift') < onboardingStepIndex('nightReassurance'));
  assert.ok(onboardingStepIndex('nightReassurance') < onboardingStepIndex('creating'));
  assert.ok(onboardingStepIndex('nightShift') < onboardingStepIndex('creating'));
  assert.ok(onboardingStepIndex('focus') < onboardingStepIndex('creating'));
  assert.ok(onboardingStepIndex('baby') < onboardingStepIndex('creating'));
  assert.equal(isOnboardingComplete(flow('nightReassurance')), false);
  assert.equal(isOnboardingComplete(flow('creating')), false);
  assert.equal(isOnboardingComplete(flow('done')), true);
});

check('Y8. focus selection allows multi-select except everything is exclusive', () => {
  let selected: OnboardingFocusNeed[] = [];
  assert.equal(hasOnboardingFocusNeed(selected), false);

  selected = toggleOnboardingFocusNeed(selected, 'sleep');
  assert.deepEqual(selected, ['sleep']);
  selected = toggleOnboardingFocusNeed(selected, 'feeding');
  assert.deepEqual(selected, ['sleep', 'feeding']);
  selected = toggleOnboardingFocusNeed(selected, 'everything');
  assert.deepEqual(selected, ['everything']);
  selected = toggleOnboardingFocusNeed(selected, 'reassurance');
  assert.deepEqual(selected, ['reassurance']);
  selected = toggleOnboardingFocusNeed(selected, 'sleep');
  assert.deepEqual(selected, ['reassurance', 'sleep']);
  selected = toggleOnboardingFocusNeed(selected, 'reassurance');
  assert.deepEqual(selected, ['sleep']);
  selected = toggleOnboardingFocusNeed(selected, 'sleep');
  assert.deepEqual(selected, []);

  selected = toggleOnboardingFocusNeed(selected, 'everything');
  assert.equal(hasOnboardingFocusNeed(selected), true);
  selected = toggleOnboardingFocusNeed(selected, 'everything');
  assert.equal(hasOnboardingFocusNeed(selected), false);
});

check('Y9. night shift choice is single-select and later counts as a valid choice', () => {
  let selected: OnboardingNightShiftChoice | null = null;
  assert.deepEqual([...ONBOARDING_NIGHT_SHIFT_CHOICES], ['solo', 'partner', 'later']);
  assert.equal(hasOnboardingNightShiftChoice(selected), false);
  selected = 'solo';
  assert.equal(hasOnboardingNightShiftChoice(selected), true);
  selected = 'partner';
  assert.equal(selected, 'partner');
  selected = 'later';
  assert.equal(selected, 'later');
  assert.equal(hasOnboardingNightShiftChoice(selected), true);
  selected = null;
  assert.equal(hasOnboardingNightShiftChoice(selected), false);
});

// Z. Personalized Tonight (Phase 1A) — the brand-new-night greeting age label, the
// honest Calibrating line, and the first-log coach phase machine (pure parts; the
// component owns the AsyncStorage dismissal + the "started empty" latch).
check('Z1. formatBabyAge reads "Newborn" in week 0, singular at 1, plural after', () => {
  assert.equal(formatBabyAge(0), 'Newborn');
  assert.equal(formatBabyAge(0.6), 'Newborn'); // floored to 0 weeks
  assert.equal(formatBabyAge(1), '1 week old');
  assert.equal(formatBabyAge(8), '8 weeks old');
  assert.equal(formatBabyAge(-3), 'Newborn'); // clamped
  assert.equal(formatBabyAge(Number.NaN), 'Newborn'); // non-finite → newborn
});

check('Z2. the Calibrating + coach copy is personal, honest, and not fake-precise', () => {
  assert.match(tonightCalibratingText('Mia'), /Mia's nights/);
  assert.match(tonightCalibratingText('Mia'), /rhythm will fill in/);
  assert.match(firstLogNudgeText('Mia'), /Mia's first feed/);
  assert.match(firstLogNudgeText('Mia'), /timeline/);
  assert.match(firstLogThreadText(), /thread/);
  // Honest empty state: never a fake number, never the false "both caregivers".
  assert.ok(!/\d/.test(tonightCalibratingText('Mia')));
  assert.ok(!/both caregivers/i.test(firstLogThreadText()));
});

check('Z3. a blank baby name falls back to "your baby" in the possessive copy', () => {
  assert.match(tonightCalibratingText('   '), /your baby's nights/);
  assert.match(firstLogNudgeText(''), /your baby's first feed/);
});

check('Z4. the coach stays hidden until hydrated and once dismissed', () => {
  const live = { dismissed: false, hasRealEvents: false, startedEmpty: true };
  assert.equal(resolveFirstLogCoachPhase({ ...live, hydrated: false }), 'hidden');
  assert.equal(
    resolveFirstLogCoachPhase({ hydrated: true, dismissed: true, hasRealEvents: false, startedEmpty: true }),
    'hidden',
  );
  assert.equal(FIRST_LOG_COACH_DISMISSED_KEY, 'lullaby.coach.firstLog.v1.dismissed');
});

check('Z5. zero real events nudges the first log; the first log points at the thread', () => {
  assert.equal(
    resolveFirstLogCoachPhase({ hydrated: true, dismissed: false, hasRealEvents: false, startedEmpty: true }),
    'nudge',
  );
  assert.equal(
    resolveFirstLogCoachPhase({ hydrated: true, dismissed: false, hasRealEvents: true, startedEmpty: true }),
    'thread',
  );
});

check('Z6. a returning parent with a timeline never sees the coach (started non-empty)', () => {
  assert.equal(
    resolveFirstLogCoachPhase({ hydrated: true, dismissed: false, hasRealEvents: true, startedEmpty: false }),
    'hidden',
  );
});

// AR. Auth deep-link redirect parsing (Step 04) — the pure classifier behind the
// password-reset / email-confirmation deep-link foundation. Covers the implicit
// (fragment tokens) + PKCE (query code) + error shapes Supabase redirects with,
// and the "not an auth link → ignore" guard that keeps ordinary deep links safe.
check('AR1. an implicit recovery redirect yields kind "recovery" with both tokens', () => {
  const r = parseAuthRedirect('lullaby://auth-callback#access_token=aaa&refresh_token=bbb&type=recovery');
  assert.ok(r);
  assert.equal(r.kind, 'recovery');
  assert.equal(r.accessToken, 'aaa');
  assert.equal(r.refreshToken, 'bbb');
  assert.equal(r.code, null);
});

check('AR2. an email-confirmation (signup) redirect is classified "signup"', () => {
  const r = parseAuthRedirect('lullaby://auth-callback#access_token=x&refresh_token=y&type=signup');
  assert.ok(r);
  assert.equal(r.kind, 'signup');
  assert.equal(r.accessToken, 'x');
});

check('AR3. a PKCE code redirect (query ?code=) carries the code', () => {
  const r = parseAuthRedirect('lullaby://auth-callback?code=abc123');
  assert.ok(r);
  assert.equal(r.code, 'abc123');
  assert.equal(r.accessToken, null);
  assert.equal(r.kind, 'unknown'); // no `type` hint with a bare PKCE code
});

check('AR4. an error redirect is "error" with a decoded description', () => {
  const r = parseAuthRedirect(
    'lullaby://auth-callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
  );
  assert.ok(r);
  assert.equal(r.kind, 'error');
  assert.equal(r.errorCode, 'otp_expired');
  assert.equal(r.errorDescription, 'Email link is invalid or has expired');
});

check('AR5. a non-auth URL (no credentials/error) returns null', () => {
  assert.equal(parseAuthRedirect('lullaby://auth-callback'), null);
  assert.equal(parseAuthRedirect('lullaby://tonight?ref=home'), null);
  assert.equal(parseAuthRedirect('https://example.com/page?foo=bar'), null);
});

check('AR6. null / empty / non-string input is a calm null (no throw)', () => {
  assert.equal(parseAuthRedirect(null), null);
  assert.equal(parseAuthRedirect(undefined), null);
  assert.equal(parseAuthRedirect(''), null);
});

check('AR7. params are read from both query and fragment together', () => {
  // Supabase can place `type` in the query and tokens in the fragment.
  const r = parseAuthRedirect('lullaby://auth-callback?type=recovery#access_token=t1&refresh_token=t2');
  assert.ok(r);
  assert.equal(r.kind, 'recovery');
  assert.equal(r.accessToken, 't1');
  assert.equal(r.refreshToken, 't2');
});

// GP. Guest / local-first data preservation (auth Step 08). The guest baby +
// local logs must survive every auth transition a guest can reach — opening the
// account-entry surface, sign-in, sign-up, sign-out, and an app restart — with no
// destructive clear before an explicit, confirmed action. GP1–GP3 pin the
// preservation contract (src/data/guestData.ts) against the REAL serializers;
// GP4–GP6 read the auth state machine's source and guard its transitions so a
// future edit can't silently re-introduce a guest-data wipe. The pure modules
// can't import AuthProvider/LocalEventProvider (React Native), so the transition
// guards scan source text — the only way to cover them here. See
// docs/auth/guest-data-preservation.md.
const AUTH_PROVIDER_SRC = readFileSync(
  new URL('../src/state/AuthProvider.tsx', import.meta.url),
  'utf8',
);
const LOCAL_EVENT_PROVIDER_SRC = readFileSync(
  new URL('../src/state/LocalEventProvider.tsx', import.meta.url),
  'utf8',
);

// A guest storage snapshot built with the production serializers, so the
// round-trip below exercises real (de)serialization, not a stand-in.
function seedGuestSnapshot(): Record<string, string> {
  return {
    [LOCAL_BABY_STORAGE_KEY]: serializeLocalBaby(
      createLocalBaby({ babyName: 'Aria', caregiverName: 'Sam' }, NOW),
    ),
    [LOCAL_EVENTS_STORAGE_KEY]: serializeState(initTonightState(seedEvents)),
    [LOGGING_STORAGE_KEY]: serializeLoggingSnapshot({ events: [], syncQueue: ['evt-1'] }),
  };
}

check('GP1. the guest-owned key set is exactly the three local-first stores', () => {
  assert.deepEqual(
    [...GUEST_OWNED_STORAGE_KEYS],
    ['lullaby/local-baby/v1', 'lullaby/local-events/v1', 'lullaby/logging-v2/v1'],
  );
  // The sticky "prefers local" flag and the Supabase session are auth-owned, not
  // guest data — clearing them is allowed, so they must NOT be in the protected set.
  const keys = GUEST_OWNED_STORAGE_KEYS as readonly string[];
  assert.ok(!keys.includes('lullaby/auth/prefers-local/v1'));
});

check('GP2. guest data survives a transition that touches only auth/session keys', () => {
  // Model "open account entry" (goToAccountEntry) + "sign out": both only remove
  // auth-owned keys (the prefers-local flag here; sign-out also drops the chunked
  // Supabase session, likewise not a guest key).
  const before: Record<string, string> = {
    ...seedGuestSnapshot(),
    'lullaby/auth/prefers-local/v1': 'true',
  };
  const after: Record<string, string> = { ...before };
  delete after['lullaby/auth/prefers-local/v1'];

  assert.ok(isGuestDataPreserved(before, after));
  // …and each store still re-parses to its original record (no silent corruption).
  assert.equal(parseLocalBaby(after[LOCAL_BABY_STORAGE_KEY])?.baby.name, 'Aria');
  const reEvents = parsePersistedState(after[LOCAL_EVENTS_STORAGE_KEY]);
  assert.ok(reEvents !== null);
  assert.equal(reEvents.events.length, initTonightState(seedEvents).events.length);
  assert.deepEqual(parseLoggingSnapshot(after[LOGGING_STORAGE_KEY]), {
    events: [],
    syncQueue: ['evt-1'],
  });
});

check('GP3. the preservation predicate catches a wipe (not vacuously true)', () => {
  const before = seedGuestSnapshot();
  const wiped: Record<string, string> = { ...before };
  delete wiped[LOCAL_EVENTS_STORAGE_KEY]; // a sign-out that cleared the local night
  assert.ok(!isGuestDataPreserved(before, wiped));
  const corrupted: Record<string, string> = { ...before, [LOCAL_BABY_STORAGE_KEY]: '{}' };
  assert.ok(!isGuestDataPreserved(before, corrupted));
});

check('GP4. AuthProvider never bulk-clears or removes a guest-owned store', () => {
  // No nuclear clears anywhere in the auth state machine.
  assert.ok(!/AsyncStorage\.clear\s*\(/.test(AUTH_PROVIDER_SRC), 'AuthProvider must not call AsyncStorage.clear()');
  assert.ok(!/\.multiRemove\s*\(/.test(AUTH_PROVIDER_SRC), 'AuthProvider must not multiRemove keys');
  // The only local-store clear is the onboarding baby mint (createLocalBaby drops
  // the seed night). It must appear exactly once and never creep into a transition.
  const clearCalls = AUTH_PROVIDER_SRC.match(/clearLocalEventStorage\s*\(/g) ?? [];
  assert.equal(clearCalls.length, 1, 'clearLocalEventStorage must be called exactly once (createLocalBaby only)');
  // The logging-v2 store is never even referenced here, so its clear() can't be wired to sign-out.
  assert.ok(!AUTH_PROVIDER_SRC.includes('LOGGING_STORAGE_KEY'));
  // Every removeItem in AuthProvider targets the auth-owned prefers-local flag —
  // never the guest baby / night / logging stores.
  const removeArgs = [...AUTH_PROVIDER_SRC.matchAll(/\.removeItem\(\s*([A-Za-z_][\w.]*)/g)].map((m) => m[1]);
  assert.ok(removeArgs.length >= 1, 'expected at least one removeItem (the prefers-local clear)');
  for (const arg of removeArgs) {
    assert.equal(arg, 'PREFERS_LOCAL_STORAGE_KEY', `removeItem(${arg}) would drop a non-auth key`);
  }
});

check('GP5. signOut clears only the Supabase session, never local-first data', () => {
  // Isolate the signOut callback body (declaration → the next callback, clearError).
  const start = AUTH_PROVIDER_SRC.indexOf('const signOut = useCallback');
  const end = AUTH_PROVIDER_SRC.indexOf('const clearError', start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'could not locate the signOut callback');
  const signOutBody = AUTH_PROVIDER_SRC.slice(start, end);
  assert.ok(signOutBody.includes('supabase.auth.signOut()'), 'signOut must clear the Supabase session');
  for (const forbidden of ['clearLocalEventStorage', 'removeItem', 'multiRemove', 'AsyncStorage']) {
    assert.ok(!signOutBody.includes(forbidden), `signOut must not reference ${forbidden} (would touch guest data)`);
  }
});

check('GP6. LocalEventProvider clears the local night only via the local-only debug reset', () => {
  // The single repository.clear() lives in resetLocalEvents, which early-returns
  // in Supabase mode and reseeds the demo locally — never reachable from an auth
  // transition. Guard the count + the supabase-mode early return so no new clear
  // path can slip in unnoticed.
  const clears = LOCAL_EVENT_PROVIDER_SRC.match(/repositoryRef\.current\.clear\(\)/g) ?? [];
  assert.equal(clears.length, 1, 'only resetLocalEvents may clear the local repository');
  const clearIdx = LOCAL_EVENT_PROVIDER_SRC.indexOf('repositoryRef.current.clear()');
  const guardWindow = LOCAL_EVENT_PROVIDER_SRC.slice(Math.max(0, clearIdx - 250), clearIdx);
  assert.ok(
    guardWindow.includes("=== 'supabase'") && guardWindow.includes('return;'),
    'the local repository.clear() must stay behind the supabase-mode early return',
  );
});

// AE. Account-entry visibility after onboarding. The account-entry surface must
// be reachable after onboarding in BOTH a configured build (no session) and an
// unconfigured local build — previously the unconfigured build sat permanently in
// 'local-only' and the entry never appeared, and the Tonight baby-header account
// tap was gated behind isSupabaseConfigured (inert in a local build). The
// decision is the pure resolveNoSessionStatus; the RN screens/providers can't
// load here, so the wiring is covered by GP-style source scans.
const ACCOUNT_ENTRY_SRC = readFileSync(
  new URL('../src/components/auth/AccountEntryScreen.tsx', import.meta.url),
  'utf8',
);
const ACCOUNT_SHEET_SRC = readFileSync(
  new URL('../src/components/auth/AccountSheet.tsx', import.meta.url),
  'utf8',
);
const TONIGHT_SRC = readFileSync(
  new URL('../src/app/(tabs)/index.tsx', import.meta.url),
  'utf8',
);
const BABY_HEADER_SRC = readFileSync(
  new URL('../src/components/BabyHeader.tsx', import.meta.url),
  'utf8',
);

check('AE1. onboarding done + no account decision → the account entry is shown (signed-out)', () => {
  assert.equal(resolveNoSessionStatus(false), 'signed-out');
});

check('AE2. a returning "Continue locally" guest is never re-walled (local-only)', () => {
  assert.equal(resolveNoSessionStatus(true), 'local-only');
});

check('AE3. AuthProvider resolves the no-session/unconfigured launch via the shared resolver', () => {
  assert.ok(
    AUTH_PROVIDER_SRC.includes('resolveNoSessionStatus'),
    'the bootstrap must use resolveNoSessionStatus so the account entry appears after onboarding',
  );
  // The unconfigured build must no longer pin itself to a permanent 'local-only'
  // initial status — that was the bug that hid the entry.
  assert.ok(
    /useState<AuthStatus>\('loading'\)/.test(AUTH_PROVIDER_SRC),
    'initial status should be loading until the prefers-local preference resolves',
  );
  assert.ok(
    !/useState<AuthStatus>\(configured \? 'loading' : 'local-only'\)/.test(AUTH_PROVIDER_SRC),
    'the unconfigured build must not start in a permanent local-only state',
  );
});

check('AE4. the account entry keeps "Continue locally" and a calm state when Supabase is unconfigured', () => {
  assert.ok(
    ACCOUNT_ENTRY_SRC.includes('continueLocally'),
    'Continue locally must remain the escape hatch (never force account creation)',
  );
  assert.ok(
    ACCOUNT_ENTRY_SRC.includes('isSupabaseConfigured'),
    'the entry must adapt to an unconfigured build, not hide silently',
  );
});

check('AE5. the account surface is reopenable from Tonight in any build (not gated on Supabase config)', () => {
  assert.ok(TONIGHT_SRC.includes('setAccountOpen(true)'), 'Tonight must open the account surface');
  // The old gate (`isSupabaseConfigured ? () => setAccountOpen(true) : undefined`)
  // left the header inert in a local build, so the baby head was the only entry.
  assert.ok(
    !/isSupabaseConfigured\s*\?\s*\(\)\s*=>\s*setAccountOpen/.test(TONIGHT_SRC),
    'the account surface must not be gated behind isSupabaseConfigured',
  );
  // The in-app surface still shows a guest a calm local-only state.
  assert.ok(ACCOUNT_SHEET_SRC.includes('isSupabaseConfigured'));
});

check('AE6. reaching the account entry never clears guest baby/log data (only the prefers-local flag moves)', () => {
  const start = AUTH_PROVIDER_SRC.indexOf('const continueLocally = useCallback');
  const end = AUTH_PROVIDER_SRC.indexOf('const goToAccountEntry', start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'could not locate the continueLocally callback');
  const body = AUTH_PROVIDER_SRC.slice(start, end);
  assert.ok(
    body.includes('PREFERS_LOCAL_STORAGE_KEY'),
    'continueLocally persists the sticky local-first choice',
  );
  for (const forbidden of [
    'clearLocalEventStorage',
    'multiRemove',
    'LOCAL_BABY_STORAGE_KEY',
    'LOCAL_EVENTS_STORAGE_KEY',
  ]) {
    assert.ok(!body.includes(forbidden), `continueLocally must not touch ${forbidden} (would lose guest data)`);
  }
});

check('AE7. the main app has an explicit, labeled account entry (not only the baby-head tap)', () => {
  // BabyHeader exposes a dedicated, labeled account affordance separate from the
  // baby-profile press, so the account entry is discoverable.
  assert.ok(BABY_HEADER_SRC.includes('onAccount'), 'BabyHeader must expose a dedicated account affordance');
  assert.ok(
    /accessibilityLabel="Account/.test(BABY_HEADER_SRC),
    'the account button must be labeled for discoverability + a11y',
  );
  // …and Tonight actually wires it.
  assert.ok(TONIGHT_SRC.includes('onAccount='), 'Tonight must wire the dedicated account entry');
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

  const makeBreast = (id: string, cid: string, status: 'active' | 'completed'): BreastFeedEvent => ({
    ...careBase({
      id,
      clientEventId: cid,
      type: 'feed',
      status,
      startedAt: iso(NOW),
      endedAt: status === 'completed' ? iso(NOW + 8 * 60_000) : null,
    }),
    type: 'feed',
    childId: 'baby-mia',
    method: 'breast',
    details: {
      activeSide: status === 'completed' ? null : 'left',
      segments: [
        {
          id: `${id}-seg1`,
          side: 'left',
          startedAt: iso(NOW),
          endedAt: status === 'completed' ? iso(NOW + 8 * 60_000) : null,
        },
      ],
      totalLeftMs: status === 'completed' ? 8 * 60_000 : 0,
      totalRightMs: 0,
    },
  });

  const localTime = (daysAgo: number, hour: number, minute = 0): number => {
    const date = new Date(NOW);
    date.setHours(hour, minute, 0, 0);
    date.setDate(date.getDate() - daysAgo);
    return date.getTime();
  };

  const makeBottleAt = (id: string, cid: string, at: number): BottleFeedEvent => ({
    ...careBase({
      id,
      clientEventId: cid,
      type: 'feed',
      status: 'completed',
      occurredAt: iso(at),
      startedAt: null,
      endedAt: null,
      createdAt: iso(at),
      updatedAt: iso(at),
    }),
    type: 'feed',
    childId: 'baby-mia',
    status: 'completed',
    method: 'bottle',
    details: { amountMl: 120, milkType: 'formula' },
  });

  const makeCompletedSleepAt = (id: string, cid: string, startedAt: number, endedAt: number): SleepEvent => ({
    ...careBase({
      id,
      clientEventId: cid,
      type: 'sleep',
      status: 'completed',
      occurredAt: iso(startedAt),
      startedAt: iso(startedAt),
      endedAt: iso(endedAt),
      createdAt: iso(startedAt),
      updatedAt: iso(endedAt),
    }),
    type: 'sleep',
    childId: 'baby-mia',
    details: { sleepType: 'night' },
  });

  await checkAsync(
    'IH1. getEventsInRange includes the 7-day boundaries and excludes older/future/invalid events',
    async () => {
      const now = Date.parse('2026-06-23T10:00:00.000Z');
      const fromMs = now - INSIGHTS_HISTORY_WINDOW_MS;
      const repo = createLoggingRepository(createInMemoryLoggingPersistence(), createManualClock(now));
      const inside = makeDiaper('ih-inside', 'ih-cid-inside', { occurredAt: iso(now - 2 * 86_400_000) });
      const atWindowStart = makeDiaper('ih-window-start', 'ih-cid-window-start', { occurredAt: iso(fromMs) });
      const older = makeDiaper('ih-older', 'ih-cid-older', { occurredAt: iso(fromMs - 1) });
      const future = makeDiaper('ih-future', 'ih-cid-future', { occurredAt: iso(now + 1) });
      const atNow = makeDiaper('ih-now', 'ih-cid-now', { occurredAt: iso(now) });
      const invalid = makeDiaper('ih-invalid', 'ih-cid-invalid', { occurredAt: 'not-a-date' });
      const beforeJson = JSON.stringify([atNow, inside, atWindowStart]);

      for (const event of [inside, atWindowStart, older, future, atNow, invalid]) {
        await repo.createEvent(event);
      }

      const history = await repo.getEventsInRange({
        familyId: 'fam-1',
        childId: 'baby-mia',
        fromMs,
        toMs: now,
      });

      assert.deepEqual(history.map((event) => event.id), ['ih-now', 'ih-inside', 'ih-window-start']);
      assert.deepEqual(history[0], atNow);
      assert.deepEqual(history[1], inside);
      assert.deepEqual(history[2], atWindowStart);
      assert.ok(!history.includes(older), 'older-than-window event should be excluded');
      assert.ok(!history.includes(future), 'future event should be excluded');
      assert.ok(!history.includes(invalid), 'invalid timestamp event should be excluded');
      assert.equal(JSON.stringify([atNow, inside, atWindowStart]), beforeJson);
    },
  );

  await checkAsync('IH2. getEventsInRange does not change getTodayEvents today-only behavior', async () => {
    const now = Date.parse('2026-06-23T10:00:00.000Z');
    const fromMs = now - INSIGHTS_HISTORY_WINDOW_MS;
    const repo = createLoggingRepository(createInMemoryLoggingPersistence(), createManualClock(now));
    await repo.createEvent(makeDiaper('ih-today-only', 'ih-cid-today-only', { occurredAt: iso(now) }));
    await repo.createEvent(makeDiaper('ih-yesterday', 'ih-cid-yesterday', { occurredAt: iso(now - 86_400_000) }));
    await repo.createEvent(makeDiaper('ih-range-start', 'ih-cid-range-start', { occurredAt: iso(fromMs) }));

    const history = await repo.getEventsInRange({
      familyId: 'fam-1',
      childId: 'baby-mia',
      fromMs,
      toMs: now,
    });
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });

    assert.deepEqual(history.map((event) => event.id), ['ih-today-only', 'ih-yesterday', 'ih-range-start']);
    assert.deepEqual(today.map((event) => event.id), ['ih-today-only']);
  });

  await checkAsync('IH3. getInsightsSevenDayHistory reads the last 7 days through the repository range path', async () => {
    const now = Date.parse('2026-06-23T10:00:00.000Z');
    const repo = createLoggingRepository(createInMemoryLoggingPersistence(), createManualClock(now));
    await repo.createEvent(makeDiaper('ih-helper-now', 'ih-cid-helper-now', { occurredAt: iso(now) }));
    await repo.createEvent(makeDiaper('ih-helper-boundary', 'ih-cid-helper-boundary', {
      occurredAt: iso(now - INSIGHTS_HISTORY_WINDOW_MS),
    }));
    await repo.createEvent(makeDiaper('ih-helper-old', 'ih-cid-helper-old', {
      occurredAt: iso(now - INSIGHTS_HISTORY_WINDOW_MS - 1),
    }));
    await repo.createEvent(makeDiaper('ih-helper-future', 'ih-cid-helper-future', { occurredAt: iso(now + 1) }));

    const history = await getInsightsSevenDayHistory(
      repo,
      { familyId: 'fam-1', childId: 'baby-mia' },
      now,
    );

    assert.deepEqual(history.map((event) => event.id), ['ih-helper-now', 'ih-helper-boundary']);
  });

  await checkAsync('IH4. getInsightsViewModel builds the view model from repository-backed 7-day history', async () => {
    const now = Date.parse('2026-06-23T10:00:00.000Z');
    const repo = createLoggingRepository(createInMemoryLoggingPersistence(), createManualClock(now));
    const scope = { familyId: 'fam-1', childId: 'baby-mia' };
    const todayFeed = makeBottleAt('ih-vm-today-feed', 'ih-cid-vm-today-feed', now - 60 * 60_000);
    const recentFeed = makeBottleAt('ih-vm-recent-feed', 'ih-cid-vm-recent-feed', now - 2 * 86_400_000);
    const weekFeed = makeBottleAt('ih-vm-week-feed', 'ih-cid-vm-week-feed', now - 6 * 86_400_000);
    const olderFeed = makeBottleAt(
      'ih-vm-older-feed',
      'ih-cid-vm-older-feed',
      now - INSIGHTS_HISTORY_WINDOW_MS - 1,
    );
    const futureFeed = makeBottleAt('ih-vm-future-feed', 'ih-cid-vm-future-feed', now + 2 * 86_400_000);
    const beforeJson = JSON.stringify([todayFeed, recentFeed, weekFeed, olderFeed, futureFeed]);

    for (const event of [todayFeed, recentFeed, weekFeed, olderFeed, futureFeed]) {
      await repo.createEvent(event);
    }

    const vm = await getInsightsViewModel({
      loadHistory: (requestedNowMs) => getInsightsSevenDayHistory(repo, scope, requestedNowMs),
      nowMs: now,
    });
    const history = await getInsightsSevenDayHistory(repo, scope, now);
    const expected = buildInsightsViewModel({ events: history, now });
    const today = await repo.getTodayEvents(scope);

    assert.deepEqual(history.map((event) => event.id), [
      'ih-vm-today-feed',
      'ih-vm-recent-feed',
      'ih-vm-week-feed',
    ]);
    assert.deepEqual(vm, expected);
    assert.deepEqual(today.map((event) => event.id), ['ih-vm-today-feed']);
    assert.equal(JSON.stringify([todayFeed, recentFeed, weekFeed, olderFeed, futureFeed]), beforeJson);
  });

  await checkAsync('IG1. Insights selectors return seven empty chart days and fallback copy', async () => {
    const vm = buildInsightsViewModel({ events: [], now: NOW });
    assert.equal(vm.updatedAt, NOW);
    assert.equal(vm.hasEnoughData, false);
    assert.equal(vm.dataDays, 0);
    assert.equal(vm.weeklySleep.length, 7);
    assert.ok(vm.weeklySleep.every((day) => day.minutes === 0));
    assert.equal(vm.cards[0].text, 'Feed rhythm will appear after a few more logs.');
    assert.equal(vm.cards[0].source, 'Keep logging');
    assert.equal(vm.cards[1].text, 'Sleep patterns will build as you log more completed sleeps.');
    assert.equal(vm.cards[1].source, 'Building pattern');
    assert.equal(vm.cards[2].text, 'Wake windows need a few completed sleeps to estimate.');
    assert.equal(vm.cards[2].source, 'A few more logs needed');
    assert.equal(vm.stats.feedsPerDay.value, '0');
    assert.equal(vm.stats.sleepPerDay.value, '0');
    assert.equal(vm.stats.diapersPerDay.value, '0');
  });

  await checkAsync(
    'IG2. Insights selectors derive feed rhythm, sleep bars, and wake windows deterministically',
    async () => {
      const now = localTime(0, 12);
      const events: CareEvent[] = [
        makeBottleAt('ins-feed-1', 'ins-cid-feed-1', localTime(0, 6)),
        makeBottleAt('ins-feed-2', 'ins-cid-feed-2', localTime(0, 8, 45)),
        makeBottleAt('ins-feed-3', 'ins-cid-feed-3', localTime(0, 11, 30)),
        makeCompletedSleepAt('ins-sleep-1', 'ins-cid-sleep-1', localTime(1, 20), localTime(1, 23)),
        makeCompletedSleepAt('ins-sleep-2', 'ins-cid-sleep-2', localTime(0, 1), localTime(0, 7, 10)),
        makeDiaper('ins-diaper-1', 'ins-cid-diaper-1', { occurredAt: iso(localTime(2, 9)) }),
        makeDiaper('ins-diaper-2', 'ins-cid-diaper-2', { occurredAt: iso(localTime(3, 9)) }),
      ];

      const vm = buildInsightsViewModel({ events, now });
      assert.equal(vm.hasEnoughData, true);
      assert.equal(vm.weeklySleep.length, 7);
      assert.ok(vm.weeklySleep.some((day) => day.minutes === 370));
      assert.equal(vm.cards[0].text, 'Feeds are settling into a 2h 45m rhythm based on recent logs.');
      assert.equal(vm.cards[0].source, 'From 3 recent feeds');
      assert.equal(vm.cards[1].text, 'Longest sleep stretch is around 6h 10m based on recent sleep logs.');
      assert.equal(vm.cards[2].text, 'Wake windows are around 2h based on recent sleep times.');
      assert.equal(vm.stats.feedsPerDay.label, 'Feeds / day');
      assert.equal(vm.stats.sleepPerDay.unit, 'h');
      assert.equal(vm.stats.diapersPerDay.label, 'Diapers / day');
    },
  );

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

  // W. Active-session model + timestamp-based timers (plan §1.3, §6, Phase 4) —
  // session math, selectors, store transitions, hydration, foreground reconcile.
  const scope = { familyId: 'fam-1', childId: 'baby-mia', userId: 'cg-mom' };

  await checkAsync('W1. elapsedMs uses now for a running session, endedAt for a completed one, and clamps a reversed range to 0', async () => {
    assert.equal(elapsedMs(iso(NOW), null, NOW + 42 * 60_000), 42 * 60_000); // running → now − start
    assert.equal(elapsedMs(iso(NOW), iso(NOW + 10 * 60_000), NOW + 99_000_000), 10 * 60_000); // completed → fixed span
    assert.equal(elapsedMs(iso(NOW), null, NOW - 60_000), 0); // backwards clock clamps to 0
    assert.equal(sessionElapsedMs(makeSleep('s', 'cs', 'active'), NOW + 60_000), 60_000);
    assert.equal(sessionElapsedMs(makeDiaper('d', 'cd'), NOW + 60_000), 0); // instant event → no duration
  });

  await checkAsync('W2. isReversedRange flags a backwards clock but not a normal running session', async () => {
    assert.equal(isReversedRange(iso(NOW), null, NOW + 60_000), false);
    assert.equal(isReversedRange(iso(NOW), null, NOW - 60_000), true);
    assert.equal(isReversedRange(iso(NOW), iso(NOW - 1), NOW), true);
  });

  await checkAsync('W3. breastSegmentTotals sums per side and counts the open segment up to now', async () => {
    const segments: BreastSideSegment[] = [
      { id: 'g1', side: 'left', startedAt: iso(NOW), endedAt: iso(NOW + 5 * 60_000) },
      { id: 'g2', side: 'right', startedAt: iso(NOW + 5 * 60_000), endedAt: iso(NOW + 8 * 60_000) },
      { id: 'g3', side: 'left', startedAt: iso(NOW + 8 * 60_000), endedAt: null }, // still running
    ];
    const totals = breastSegmentTotals(segments, NOW + 10 * 60_000); // 2 more min on the open left
    assert.equal(totals.totalLeftMs, (5 + 2) * 60_000); // 5m closed + 2m open
    assert.equal(totals.totalRightMs, 3 * 60_000);
  });

  await checkAsync('W4. duration formatters render stopwatch and compact text', async () => {
    assert.equal(formatClock(0), '0:00');
    assert.equal(formatClock(16 * 60_000 + 24_000), '16:24');
    assert.equal(formatClock(9 * 60_000 + 4_000), '9:04');
    assert.equal(formatClock(3_723_000), '01:02:03'); // 1h 2m 3s
    assert.equal(formatClock(42 * 60_000 + 18_000, { alwaysHours: true }), '00:42:18');
    assert.equal(formatCompactDuration(0), '0m');
    assert.equal(formatCompactDuration(9 * 60_000), '9m');
    assert.equal(formatCompactDuration(84 * 60_000), '1h 24m');
    assert.equal(formatCompactDuration(60 * 60_000), '1h');
  });

  await checkAsync('W5. selectors pick the active session of each kind; pump is scoped to the caregiver', async () => {
    const events = [
      makeSleep('s1', 'cs1', 'active'),
      makeSleep('s2', 'cs2', 'completed'),
      makeBreast('b1', 'cb1', 'active'),
      makePump('p1', 'cp1', 'cg-mom'),
      makePump('p2', 'cp2', 'cg-dad'),
    ];
    assert.equal(selectActiveSleep(events)?.id, 's1');
    assert.equal(selectActiveBreastFeed(events)?.id, 'b1');
    assert.equal(selectActivePump(events, 'cg-dad')?.id, 'p2'); // caregiver-scoped, not child-scoped
    assert.equal(selectActivePump(events, 'cg-nobody'), null);
  });

  await checkAsync('W6. hydrateLoggingState restores active timers from timestamps and survives a restart', async () => {
    const port = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(port, clock);
    await repo.createEvent(makeSleep('evt-s1', 'cid-s1', 'active'));
    await repo.createEvent(makeDiaper('evt-d1', 'cid-d1'));
    clock.advance(42 * 60_000); // 42 minutes pass with the session running

    const state = await hydrateLoggingState(repo, scope, clock);
    assert.equal(state.hydrated, true);
    assert.equal(state.error, null);
    assert.equal(state.activeSleep?.id, 'evt-s1');
    assert.equal(state.activeBreastFeed, null);
    assert.equal(state.activePump, null);
    assert.equal(state.todayEvents.length, 2); // active sleep + diaper both in today's window
    assert.ok(state.activeSleep);
    if (state.activeSleep) {
      // Duration is recomputed from the stored startedAt — no persisted counter.
      assert.equal(sessionElapsedMs(state.activeSleep, clock.now()), 42 * 60_000);
    }

    // Simulate a full app restart: a brand-new repository over the SAME persisted store.
    const restarted = await hydrateLoggingState(createLoggingRepository(port, clock), scope, clock);
    assert.equal(restarted.activeSleep?.id, 'evt-s1'); // session survived the restart
  });

  await checkAsync('W6b. v2 Tonight waits for hydration before showing a persisted running sleep', async () => {
    const pending = createInitialLoggingState();
    assert.equal(pending.hydrated, false);
    assert.equal(pending.activeSleep, null);

    const port = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(port, clock);
    await repo.createEvent(makeSleep('evt-handoff-sleep', 'cid-handoff-sleep', 'active'));
    clock.advance(25 * 60_000);

    const hydrated = await hydrateLoggingState(createLoggingRepository(port, clock), scope, clock);
    assert.equal(hydrated.hydrated, true);
    assert.equal(hydrated.activeSleep?.id, 'evt-handoff-sleep');
    assert.equal(
      buildV2TonightStatus({ todayEvents: hydrated.todayEvents, activeSleep: hydrated.activeSleep }, clock.now())
        .find((item) => item.key === 'sleep')?.label,
      'Sleeping',
    );
  });

  await checkAsync('W7. reconcileLoggingState drops a session finished elsewhere and flags a backwards clock', async () => {
    const port = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(port, clock);
    await repo.createEvent(makeSleep('evt-s1', 'cid-s1', 'active'));
    const hydrated = await hydrateLoggingState(repo, scope, clock);
    assert.equal(hydrated.activeSleep?.id, 'evt-s1');

    // The session is finished on another device.
    clock.advance(30 * 60_000);
    await repo.updateEvent({
      ...makeSleep('evt-s1', 'cid-s1', 'active'),
      status: 'completed',
      endedAt: iso(clock.now()),
    });
    const reconciled = await reconcileLoggingState(repo, scope, clock, hydrated);
    assert.equal(reconciled.activeSleep, null); // no longer active
    assert.ok(reconciled.todayEvents.some((e) => e.id === 'evt-s1')); // completed event stays in the timeline

    // A backwards clock (now before the active start) surfaces a recover/error state.
    const clock2 = createManualClock(NOW);
    const repo2 = createLoggingRepository(createInMemoryLoggingPersistence(), clock2);
    await repo2.createEvent(makeSleep('evt-s9', 'cid-s9', 'active')); // startedAt = NOW
    clock2.set(NOW - 60_000); // clock jumps backwards before the session start
    const anomalous = await hydrateLoggingState(repo2, scope, clock2);
    assert.equal(anomalous.activeSleep?.id, 'evt-s9'); // session still present (real, stored data)
    assert.equal(anomalous.error?.code, 'started_in_future'); // but flagged for a recover prompt
  });

  await checkAsync('W8. store transitions are pure (no input mutation) and the initial state is empty', async () => {
    const s0 = createInitialLoggingState();
    assert.equal(s0.hydrated, false);
    assert.deepEqual(s0.todayEvents, []);
    assert.equal(s0.activeSleep, null);

    const s1 = applyTodayEvents(s0, [makeDiaper('d', 'cd')]);
    assert.equal(s0.todayEvents.length, 0); // input unchanged
    assert.equal(s1.todayEvents.length, 1);
    assert.notEqual(s0, s1);

    const s2 = applyActiveSessions(
      s1,
      [makeSleep('s', 'cs', 'active'), makePump('p', 'cp', 'cg-mom')],
      'cg-mom',
    );
    assert.equal(s2.activeSleep?.id, 's');
    assert.equal(s2.activePump?.id, 'p');
    assert.equal(selectIsAnySessionActive(s2), true);
    assert.equal(selectIsAnySessionActive(s1), false);

    const s3 = withError(s2, loggingError('invalid_diaper_kind', 'x'));
    assert.equal(s3.error?.code, 'invalid_diaper_kind');
    assert.equal(s2.error, null); // input unchanged
    assert.equal(clearError(s3).error, null);
  });

  // X. Feed use-cases (plan Phase 3 Bottle + Phase 5 Breast, task 05). Run over a
  // fresh in-memory repo + a fake clock, with a fixed actor/scope.
  const actor: LoggingActor = { familyId: 'fam-1', childId: 'baby-mia', userId: 'cg-mom' };
  const feedScope = { familyId: 'fam-1', childId: 'baby-mia', userId: 'cg-mom' };
  const newFeedDeps = () => {
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(createInMemoryLoggingPersistence(), clock);
    return { repo, clock, deps: { repo, clock, actor } };
  };
  const activeBreast = async (repo: ReturnType<typeof createLoggingRepository>) =>
    selectActiveBreastFeed(await repo.getActiveSessions(feedScope));

  await checkAsync('X1. saveBottleFeed 120 + breast milk creates one completed bottle event', async () => {
    const { repo, deps } = newFeedDeps();
    const r = await saveBottleFeed(deps, { amountMl: 120, milkType: 'breast_milk' });
    assert.ok(r.ok);
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.equal(today.length, 1);
    const e = today[0];
    assert.ok(isBottleFeed(e) && e.details.amountMl === 120 && e.details.milkType === 'breast_milk');
    assert.equal(e.status, 'completed');
    assert.equal(e.startedAt, null); // bottle is an instant event, never a session
  });

  await checkAsync('X2. saveBottleFeed amount 0 is rejected and saves nothing', async () => {
    const { repo, deps } = newFeedDeps();
    const r = await saveBottleFeed(deps, { amountMl: 0, milkType: 'formula' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, 'invalid_bottle_amount');
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.equal(today.length, 0);
  });

  await checkAsync('X3. double saveBottleFeed with the same clientEventId creates one event', async () => {
    const { repo, deps } = newFeedDeps();
    const cid = 'cid-bottle-x3';
    await saveBottleFeed(deps, { amountMl: 90, milkType: 'formula', clientEventId: cid });
    await saveBottleFeed(deps, { amountMl: 90, milkType: 'formula', clientEventId: cid });
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.equal(today.length, 1);
  });

  await checkAsync('X4. startBreastFeed Left creates one open left segment on an active session', async () => {
    const { repo, deps } = newFeedDeps();
    const r = await startBreastFeed(deps, { side: 'left' });
    assert.ok(r.ok);
    const breast = await activeBreast(repo);
    assert.ok(breast && breast.status === 'active');
    assert.equal(breast.details.activeSide, 'left');
    assert.equal(breast.details.segments.length, 1);
    assert.equal(breast.details.segments[0].side, 'left');
    assert.equal(breast.details.segments[0].endedAt, null);
  });

  await checkAsync('X5. Start Left → +5m switch Right → +3m finish gives Left 5m / Right 3m', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startBreastFeed(deps, { side: 'left' })).ok);
    clock.advance(5 * 60_000);
    const open1 = await activeBreast(repo);
    assert.ok(open1);
    assert.ok((await switchBreastSide(deps, { event: open1, side: 'right' })).ok);
    clock.advance(3 * 60_000);
    const open2 = await activeBreast(repo);
    assert.ok(open2);
    const fin = await finishBreastFeed(deps, { event: open2 });
    assert.ok(fin.ok);
    if (fin.ok) {
      assert.equal(fin.event.status, 'completed');
      assert.equal(fin.event.details.activeSide, null);
      assert.notEqual(fin.event.endedAt, null);
      assert.equal(fin.event.details.totalLeftMs, 5 * 60_000);
      assert.equal(fin.event.details.totalRightMs, 3 * 60_000);
    }
    // No longer active; the completed feed is in today's timeline.
    assert.equal(await activeBreast(repo), null);
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.ok(today.some((e) => isBreastFeed(e) && e.status === 'completed'));
  });

  await checkAsync('X6. multiple side switches sum correctly (L 4m / R 2m)', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startBreastFeed(deps, { side: 'left' })).ok);
    clock.advance(2 * 60_000);
    assert.ok((await switchBreastSide(deps, { event: (await activeBreast(repo))!, side: 'right' })).ok);
    clock.advance(2 * 60_000);
    assert.ok((await switchBreastSide(deps, { event: (await activeBreast(repo))!, side: 'left' })).ok);
    clock.advance(2 * 60_000);
    const fin = await finishBreastFeed(deps, { event: (await activeBreast(repo))! });
    assert.ok(fin.ok);
    if (fin.ok) {
      assert.equal(fin.event.details.totalLeftMs, 4 * 60_000);
      assert.equal(fin.event.details.totalRightMs, 2 * 60_000);
    }
  });

  await checkAsync('X7. a second Start returns the existing session and never creates a duplicate', async () => {
    const { repo, deps } = newFeedDeps();
    assert.ok((await startBreastFeed(deps, { side: 'left' })).ok);
    const r2 = await startBreastFeed(deps, { side: 'right' });
    assert.ok(r2.ok && r2.resumed === true);
    if (r2.ok) assert.equal(r2.event.details.activeSide, 'left'); // the original, not a new right one
    const active = await repo.getActiveSessions(feedScope);
    assert.equal(active.filter(isBreastFeed).length, 1);
  });

  await checkAsync('X8. hydration restores the active breast side after a restart', async () => {
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(persistence, clock);
    assert.ok((await startBreastFeed({ repo, clock, actor }, { side: 'right' })).ok);
    clock.advance(4 * 60_000);
    // "Restart": a fresh repository over the same persisted snapshot.
    const repo2 = createLoggingRepository(persistence, clock);
    const state = await hydrateLoggingState(repo2, feedScope, clock);
    assert.ok(state.activeBreastFeed);
    assert.equal(state.activeBreastFeed?.details.activeSide, 'right');
  });

  await checkAsync('X9. switching to the already-active side is a no-op', async () => {
    const { repo, deps } = newFeedDeps();
    assert.ok((await startBreastFeed(deps, { side: 'left' })).ok);
    const r = await switchBreastSide(deps, { event: (await activeBreast(repo))!, side: 'left' });
    assert.ok(r.ok && r.noop === true);
    const breast = await activeBreast(repo);
    assert.equal(breast?.details.segments.length, 1); // not split into two
  });

  await checkAsync('X10. cancel discards the session — never active, never in the timeline', async () => {
    const { repo, deps } = newFeedDeps();
    assert.ok((await startBreastFeed(deps, { side: 'left' })).ok);
    await cancelBreastFeed(deps, { event: (await activeBreast(repo))! });
    assert.equal(await activeBreast(repo), null);
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.ok(!today.some((e) => isBreastFeed(e)));
  });

  // Y. Sleep use-cases (plan Phase 6, task 06). Same in-memory repo + fake clock +
  // actor/scope as the Feed checks above. A sleep is one active session per child,
  // with durations derived from timestamps — never a hardcoded finalize.
  const activeSleepOf = async (repo: ReturnType<typeof createLoggingRepository>) =>
    selectActiveSleep(await repo.getActiveSessions(feedScope));

  await checkAsync('Y1. startSleep creates one active sleep with startedAt set and no endedAt', async () => {
    const { repo, deps } = newFeedDeps();
    const r = await startSleep(deps, {});
    assert.ok(r.ok);
    const sleep = await activeSleepOf(repo);
    assert.ok(sleep && sleep.status === 'active');
    assert.notEqual(sleep.startedAt, null);
    assert.equal(sleep.endedAt, null);
  });

  await checkAsync('Y2. Start now → finish after 40m gives a completed 40-minute sleep in the timeline', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startSleep(deps, {})).ok);
    clock.advance(40 * 60_000);
    const open = await activeSleepOf(repo);
    assert.ok(open);
    const fin = await finishSleep(deps, { event: open });
    assert.ok(fin.ok);
    if (fin.ok) {
      assert.equal(fin.event.status, 'completed');
      assert.notEqual(fin.event.endedAt, null);
      assert.equal(sessionElapsedMs(fin.event, clock.now()), 40 * 60_000);
    }
    assert.equal(await activeSleepOf(repo), null);
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.ok(today.some((e) => isSleepEvent(e) && e.status === 'completed'));
  });

  await checkAsync('Y3. Started 5m earlier → finish after 20m totals 25 minutes', async () => {
    const { repo, clock, deps } = newFeedDeps();
    const startedAt = new Date(NOW - 5 * 60_000).toISOString();
    assert.ok((await startSleep(deps, { startedAt })).ok);
    clock.advance(20 * 60_000);
    const open = await activeSleepOf(repo);
    assert.ok(open);
    const fin = await finishSleep(deps, { event: open });
    assert.ok(fin.ok);
    if (fin.ok) assert.equal(sessionElapsedMs(fin.event, clock.now()), 25 * 60_000);
  });

  await checkAsync('Y4. a second startSleep returns the existing session and never creates a duplicate', async () => {
    const { repo, deps } = newFeedDeps();
    assert.ok((await startSleep(deps, {})).ok);
    const r2 = await startSleep(deps, {});
    assert.ok(r2.ok && r2.resumed === true);
    const active = await repo.getActiveSessions(feedScope);
    assert.equal(active.filter(isSleepEvent).length, 1);
  });

  await checkAsync('Y5. finishSleep with endedAt before startedAt is rejected and persists nothing', async () => {
    const { repo, deps } = newFeedDeps();
    assert.ok((await startSleep(deps, {})).ok); // startedAt = NOW
    const open = await activeSleepOf(repo);
    assert.ok(open);
    const r = await finishSleep(deps, { event: open, at: new Date(NOW - 60_000).toISOString() });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, 'invalid_session_range');
    const stillActive = await activeSleepOf(repo);
    assert.ok(stillActive && stillActive.status === 'active'); // unchanged
  });

  await checkAsync('Y6. cancelSleep discards the session — never active, never in the timeline', async () => {
    const { repo, deps } = newFeedDeps();
    assert.ok((await startSleep(deps, {})).ok);
    await cancelSleep(deps, { event: (await activeSleepOf(repo))! });
    assert.equal(await activeSleepOf(repo), null);
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.ok(!today.some((e) => isSleepEvent(e)));
  });

  await checkAsync('Y7. hydration restores the active sleep after a restart', async () => {
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(persistence, clock);
    assert.ok((await startSleep({ repo, clock, actor }, {})).ok);
    clock.advance(10 * 60_000);
    // "Restart": a fresh repository over the same persisted snapshot.
    const repo2 = createLoggingRepository(persistence, clock);
    const state = await hydrateLoggingState(repo2, feedScope, clock);
    assert.ok(state.activeSleep);
    assert.equal(state.activeSleep?.status, 'active');
  });

  await checkAsync('Y8. saveCompletedSleep logs a completed sleep without a timer; a future start is rejected', async () => {
    const { repo, clock, deps } = newFeedDeps();
    const r = await saveCompletedSleep(deps, {
      startedAt: new Date(NOW - 30 * 60_000).toISOString(),
      endedAt: new Date(NOW).toISOString(),
    });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.event.status, 'completed');
      assert.equal(sessionElapsedMs(r.event, clock.now()), 30 * 60_000);
    }
    assert.equal(await activeSleepOf(repo), null); // never an active session
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.ok(today.some((e) => isSleepEvent(e) && e.status === 'completed'));
    const bad = await saveCompletedSleep(deps, {
      startedAt: new Date(NOW + 60 * 60_000).toISOString(),
      endedAt: new Date(NOW + 90 * 60_000).toISOString(),
    });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.error.code, 'started_in_future');
  });

  // Z. Diaper use-case (plan Phase 2 / §11.1, task 07). The simplest flow: an
  // INSTANT log, never an active session — created `completed` with
  // `occurredAt = now` and no timer — that a single tap saves (two taps total:
  // Diaper → Wet). Same in-memory repo + fake clock + actor/scope as above.
  await checkAsync('Z1. saveDiaper("wet") creates one completed wet diaper with no timer, in the timeline', async () => {
    const { repo, deps } = newFeedDeps();
    const r = await saveDiaper(deps, { kind: 'wet' });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.event.type, 'diaper');
      assert.equal(r.event.status, 'completed');
      assert.equal(r.event.details.kind, 'wet');
      assert.notEqual(r.event.occurredAt, null);
      assert.equal(r.event.startedAt, null); // instant — no session
      assert.equal(r.event.endedAt, null);
    }
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.equal(today.filter(isDiaperEvent).length, 1);
  });

  await checkAsync('Z2. every kind — wet / dirty / both / dry — creates a diaper of that exact kind', async () => {
    for (const kind of ['wet', 'dirty', 'both', 'dry'] as const) {
      const { repo, deps } = newFeedDeps();
      const r = await saveDiaper(deps, { kind });
      assert.ok(r.ok, `kind ${kind} should save`);
      if (r.ok) assert.equal(r.event.details.kind, kind);
      const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
      assert.ok(today.some((e) => isDiaperEvent(e) && e.details.kind === kind));
    }
  });

  await checkAsync('Z3. an unknown diaper kind is rejected and persists nothing', async () => {
    const { repo, deps } = newFeedDeps();
    // The use-case input is typed; cast through to exercise the runtime validator.
    const r = await saveDiaper(deps, { kind: 'soaked' as unknown as DiaperEvent['details']['kind'] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, 'invalid_diaper_kind');
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.equal(today.filter(isDiaperEvent).length, 0);
  });

  await checkAsync('Z4. a double saveDiaper with the same clientEventId creates exactly one event', async () => {
    const { repo, deps } = newFeedDeps();
    const cid = 'diaper-dup-1';
    assert.ok((await saveDiaper(deps, { kind: 'dirty', clientEventId: cid })).ok);
    assert.ok((await saveDiaper(deps, { kind: 'dirty', clientEventId: cid })).ok);
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.equal(today.filter(isDiaperEvent).length, 1);
  });

  await checkAsync('Z5. a logged diaper is never an active session', async () => {
    const { repo, deps } = newFeedDeps();
    assert.ok((await saveDiaper(deps, { kind: 'both' })).ok);
    const active = await repo.getActiveSessions(feedScope);
    assert.equal(active.filter(isDiaperEvent).length, 0);
  });

  await checkAsync('Z6. a logged diaper survives a restart (offline-safe, plan Phase 2 acceptance)', async () => {
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(persistence, clock);
    assert.ok((await saveDiaper({ repo, clock, actor }, { kind: 'dry' })).ok);
    // "Restart": a fresh repository over the same persisted snapshot.
    const repo2 = createLoggingRepository(persistence, clock);
    const state = await hydrateLoggingState(repo2, feedScope, clock);
    const restored = state.todayEvents.filter(isDiaperEvent);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].details.kind, 'dry');
  });

  // AA. Pump use-cases (plan Phase 7 / §11.1, task 08). The most stateful flow:
  // a CAREGIVER-scoped session whose finished timer becomes a persisted volume
  // draft (an `active` event with `endedAt` set) that survives sheet close +
  // restart, then completes with an OPTIONAL per-side volume. Same in-memory repo
  // + fake clock + actor/scope as above.
  const activePumpOf = async (repo: ReturnType<typeof createLoggingRepository>) =>
    selectActivePump(await repo.getActiveSessions(feedScope), 'cg-mom');

  await checkAsync('AA1. startPump(both) creates one active pump scoped to the caregiver, with no endedAt', async () => {
    const { repo, deps } = newFeedDeps();
    const r = await startPump(deps, { side: 'both' });
    assert.ok(r.ok);
    const pump = await activePumpOf(repo);
    assert.ok(pump && isPumpEvent(pump) && pump.status === 'active');
    assert.equal(pump.subjectUserId, 'cg-mom'); // pump belongs to the caregiver (plan §4.4)
    assert.equal(pump.details.side, 'both');
    assert.equal(pump.endedAt, null); // running — not yet a draft
    assert.equal(pump.details.leftVolumeMl, null);
    assert.equal(pump.details.rightVolumeMl, null);
  });

  await checkAsync('AA2. a second startPump returns the existing session and never creates a duplicate', async () => {
    const { repo, deps } = newFeedDeps();
    assert.ok((await startPump(deps, { side: 'left' })).ok);
    const r2 = await startPump(deps, { side: 'right' });
    assert.ok(r2.ok && r2.resumed === true);
    if (r2.ok) assert.equal(r2.event.details.side, 'left'); // the original, not a new right one
    const active = await repo.getActiveSessions(feedScope);
    assert.equal(active.filter(isPumpEvent).length, 1);
  });

  await checkAsync('AA3. finishPump sets endedAt + a fixed duration but keeps the session active (a volume draft, not completed)', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startPump(deps, { side: 'both' })).ok);
    clock.advance(18 * 60_000);
    const open = await activePumpOf(repo);
    assert.ok(open);
    const fin = await finishPump(deps, { event: open });
    assert.ok(fin.ok);
    if (fin.ok) {
      assert.equal(fin.event.status, 'active'); // NOT completed yet (plan Phase 7.2)
      assert.notEqual(fin.event.endedAt, null);
      assert.equal(sessionElapsedMs(fin.event, clock.now()), 18 * 60_000); // fixed once finished
    }
    // The store turns the finished-but-active pump into a volume draft.
    const state = await hydrateLoggingState(repo, feedScope, clock);
    assert.ok(state.pumpVolumeDraft);
    assert.equal(state.pumpVolumeDraft?.side, 'both');
    assert.ok(state.activePump); // full event still held so the provider can complete it
  });

  await checkAsync('AA4. Both + savePump 50/60 ml completes the pump; the 110 ml total is derived in a selector', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startPump(deps, { side: 'both' })).ok);
    clock.advance(10 * 60_000);
    await finishPump(deps, { event: (await activePumpOf(repo))! });
    const draftEvent = (await activePumpOf(repo))!;
    const r = await savePump(deps, { event: draftEvent, leftVolumeMl: 50, rightVolumeMl: 60 });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.event.status, 'completed');
      assert.equal(r.event.details.leftVolumeMl, 50);
      assert.equal(r.event.details.rightVolumeMl, 60);
      assert.equal(pumpTotalVolumeMl(r.event.details), 110); // derived, not stored (plan §7.3)
    }
    assert.equal(await activePumpOf(repo), null); // no longer active or a draft
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.ok(today.some((e) => isPumpEvent(e) && e.status === 'completed'));
  });

  await checkAsync('AA5. Save without volume stores null volumes and a valid duration-only record', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startPump(deps, { side: 'left' })).ok);
    clock.advance(12 * 60_000);
    await finishPump(deps, { event: (await activePumpOf(repo))! });
    const draftEvent = (await activePumpOf(repo))!;
    const r = await savePump(deps, { event: draftEvent, leftVolumeMl: null, rightVolumeMl: null });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.event.status, 'completed');
      assert.equal(r.event.details.leftVolumeMl, null);
      assert.equal(r.event.details.rightVolumeMl, null);
      assert.equal(pumpTotalVolumeMl(r.event.details), 0);
      assert.equal(sessionElapsedMs(r.event, clock.now()), 12 * 60_000); // duration preserved
    }
  });

  await checkAsync('AA6. a single-side pump cannot record the other side’s volume (rejected, draft unchanged)', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startPump(deps, { side: 'left' })).ok);
    clock.advance(5 * 60_000);
    await finishPump(deps, { event: (await activePumpOf(repo))! });
    const draftEvent = (await activePumpOf(repo))!;
    const r = await savePump(deps, { event: draftEvent, leftVolumeMl: 40, rightVolumeMl: 50 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, 'invalid_pump_volumes');
    const stillDraft = await activePumpOf(repo);
    assert.ok(stillDraft && stillDraft.status === 'active'); // unchanged (still a draft)
  });

  await checkAsync('AA7. the finished volume draft survives a restart (hydration restores it from the persisted session)', async () => {
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(persistence, clock);
    assert.ok((await startPump({ repo, clock, actor }, { side: 'both' })).ok);
    clock.advance(18 * 60_000);
    await finishPump({ repo, clock, actor }, { event: (await activePumpOf(repo))! });
    // "Restart": a fresh repository over the same persisted snapshot.
    const repo2 = createLoggingRepository(persistence, clock);
    const state = await hydrateLoggingState(repo2, feedScope, clock);
    assert.ok(state.pumpVolumeDraft); // draft not lost on restart (plan Phase 7.2 acceptance)
    assert.equal(state.pumpVolumeDraft?.side, 'both');
    assert.equal(sessionElapsedMs(state.activePump!, clock.now()), 18 * 60_000);
  });

  await checkAsync('AA8. cancelPump discards the session — never active, never in the timeline', async () => {
    const { repo, deps } = newFeedDeps();
    assert.ok((await startPump(deps, { side: 'right' })).ok);
    await cancelPump(deps, { event: (await activePumpOf(repo))! });
    assert.equal(await activePumpOf(repo), null);
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.ok(!today.some((e) => isPumpEvent(e)));
  });

  await checkAsync('AA9. a pump does not block an active sleep — both sessions coexist (plan Phase 7 acceptance)', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startSleep(deps, {})).ok);
    assert.ok((await startPump(deps, { side: 'both' })).ok);
    const state = await hydrateLoggingState(repo, feedScope, clock);
    assert.ok(state.activeSleep);
    assert.ok(state.activePump);
  });

  /* ---------------------------------------------------------------- *
   * Task 09 — Today timeline integration: the pure §7.4 timeline
   * formatter + §7.1 quick-log subtitle selectors + the status strip.
   * Fixtures are built through the real use-cases, then read back.
   * ---------------------------------------------------------------- */

  await checkAsync('BB1. formatTimelineEvent renders instant events: bottle + diaper (plan §7.4)', async () => {
    const { repo, clock, deps } = newFeedDeps();
    await saveBottleFeed(deps, { amountMl: 120, milkType: 'breast_milk' });
    await saveDiaper(deps, { kind: 'wet' });
    const state = await hydrateLoggingState(repo, feedScope, clock);
    const bottle = state.todayEvents.find((e) => isBottleFeed(e))!;
    const diaper = state.todayEvents.find((e) => isDiaperEvent(e))!;
    const b = formatTimelineEvent(bottle, clock.now());
    assert.equal(b.title, 'Bottle');
    assert.equal(b.subtitle, '120 ml · breast milk');
    assert.equal(b.icon, 'feed');
    assert.ok(typeof b.tint === 'string' && b.tint.length > 0); // §7.4 tint present
    const d = formatTimelineEvent(diaper, clock.now());
    assert.equal(d.title, 'Diaper');
    assert.equal(d.subtitle, 'wet');
    assert.equal(d.icon, 'diaper');
  });

  await checkAsync('BB2. formatTimelineEvent: sleep reads "Sleeping" while active, "Nap" once completed', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startSleep(deps, {})).ok);
    clock.advance(42 * 60_000);
    const active = selectActiveSleep(await repo.getActiveSessions(feedScope))!;
    const a = formatTimelineEvent(active, clock.now());
    assert.equal(a.title, 'Sleeping');
    assert.equal(a.subtitle, '42m');
    assert.equal(a.icon, 'sleep');
    await finishSleep(deps, { event: active });
    const done = (await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' })).find((e) => isSleepEvent(e))!;
    const f = formatTimelineEvent(done, clock.now());
    assert.equal(f.title, 'Nap');
    assert.equal(f.subtitle, '42m'); // fixed at endedAt — no longer ticking
  });

  await checkAsync('BB3. formatTimelineEvent: breastfeed active vs completed per-side summary', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startBreastFeed(deps, { side: 'right' })).ok);
    clock.advance(12 * 60_000);
    const running = (await activeBreast(repo))!;
    const r = formatTimelineEvent(running, clock.now());
    assert.equal(r.title, 'Breastfeeding');
    assert.equal(r.subtitle, '12m · right');
    // A fresh session: left 5m, switch, right 3m, finish → "5m left · 3m right".
    const { repo: repo2, clock: clock2, deps: deps2 } = newFeedDeps();
    assert.ok((await startBreastFeed(deps2, { side: 'left' })).ok);
    clock2.advance(5 * 60_000);
    await switchBreastSide(deps2, { event: (await activeBreast(repo2))!, side: 'right' });
    clock2.advance(3 * 60_000);
    await finishBreastFeed(deps2, { event: (await activeBreast(repo2))! });
    const done = (await repo2.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' })).find((e) => isBreastFeed(e))!;
    const f = formatTimelineEvent(done, clock2.now());
    assert.equal(f.title, 'Breastfeed');
    assert.equal(f.subtitle, '5m left · 3m right');
  });

  await checkAsync('BB4. formatTimelineEvent: pump running → draft → completed (110 ml total)', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startPump(deps, { side: 'both' })).ok);
    clock.advance(18 * 60_000);
    const running = (await activePumpOf(repo))!;
    const r = formatTimelineEvent(running, clock.now());
    assert.equal(r.title, 'Pumping');
    assert.equal(r.subtitle, '18m · both');
    await finishPump(deps, { event: running });
    const draft = (await activePumpOf(repo))!;
    const d = formatTimelineEvent(draft, clock.now());
    assert.equal(d.title, 'Pump');
    assert.equal(d.subtitle, 'finished · add volume'); // survives close/restart as a draft
    await savePump(deps, { event: draft, leftVolumeMl: 50, rightVolumeMl: 60 });
    const done = (await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' })).find((e) => isPumpEvent(e))!;
    const f = formatTimelineEvent(done, clock.now());
    assert.equal(f.title, 'Pump · 110 ml');
    assert.equal(f.subtitle, 'L 50 ml · R 60 ml · 18m'); // derived total, never stored (§7.3)
  });

  await checkAsync('BB5. buildV2QuickLogSubtitles: active sessions lead in the present tense (plan §7.1)', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startSleep(deps, {})).ok);
    assert.ok((await startBreastFeed(deps, { side: 'right' })).ok);
    assert.ok((await startPump(deps, { side: 'both' })).ok);
    clock.advance(12 * 60_000);
    const state = await hydrateLoggingState(repo, feedScope, clock);
    const subs = buildV2QuickLogSubtitles(state, clock.now());
    assert.equal(subs.feed, 'Feeding · 12m · right');
    assert.equal(subs.sleep, 'Sleeping · 12m');
    assert.equal(subs.pump, 'Pumping · 12:00');
  });

  await checkAsync('BB6. buildV2QuickLogSubtitles: pump draft "Finished · add volume", then last-pump line', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startPump(deps, { side: 'left' })).ok);
    clock.advance(10 * 60_000);
    await finishPump(deps, { event: (await activePumpOf(repo))! });
    let state = await hydrateLoggingState(repo, feedScope, clock);
    assert.equal(buildV2QuickLogSubtitles(state, clock.now()).pump, 'Finished · add volume');
    await savePump(deps, { event: (await activePumpOf(repo))!, leftVolumeMl: 90, rightVolumeMl: null });
    clock.advance(5 * 60_000);
    state = await hydrateLoggingState(repo, feedScope, clock);
    assert.equal(buildV2QuickLogSubtitles(state, clock.now()).pump, 'Last · 90 ml');
  });

  await checkAsync('BB7. buildV2TonightStatus + idle/awake subtitles (plan §7.1)', async () => {
    const { repo, clock, deps } = newFeedDeps();
    // Empty store → calm prompts + truthful empty awake state.
    let state = await hydrateLoggingState(repo, feedScope, clock);
    let subs = buildV2QuickLogSubtitles(state, clock.now());
    assert.equal(subs.feed, 'Tap to log');
    assert.equal(subs.sleep, 'Awake · no sleep yet');
    assert.equal(subs.diaper, 'Tap to log');
    assert.equal(subs.pump, 'Log pump');
    let status = buildV2TonightStatus(state, clock.now());
    assert.deepEqual(status.map((s) => `${s.label}:${s.value}`), ['Last feed:None yet', 'Last diaper:None yet', 'Awake:now']);
    // Log a diaper, sleep 40m then wake → "Awake for 40m" + diaper "ago".
    await saveDiaper(deps, { kind: 'dirty' });
    assert.ok((await startSleep(deps, {})).ok);
    clock.advance(40 * 60_000);
    await finishSleep(deps, { event: selectActiveSleep(await repo.getActiveSessions(feedScope))! });
    clock.advance(10 * 60_000);
    state = await hydrateLoggingState(repo, feedScope, clock);
    subs = buildV2QuickLogSubtitles(state, clock.now());
    assert.equal(subs.sleep, 'Awake for 10m'); // 10m since the sleep ended (not since it started)
    assert.equal(subs.diaper, '50m ago · dirty');
    status = buildV2TonightStatus(state, clock.now());
    assert.equal(status.find((s) => s.key === 'sleep')!.label, 'Awake');
    assert.equal(status.find((s) => s.key === 'diaper')!.value, '50m ago');
  });

  /* ---------------------------------------------------------------- *
   * Task 10 — Undo: record a single live mutation + the calm "saved ·
   * Undo" toast, and apply the inverse on undo — soft-delete a created
   * event / restore a finished session (plan §8). The toast copy comes
   * from the saved event, so it matches the timeline.
   * ---------------------------------------------------------------- */

  await checkAsync('CC1. undo a created diaper soft-deletes it, enqueues sync, and drops it from the timeline', async () => {
    const port = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(port, clock);
    const deps = { repo, clock, actor };
    const r = await saveDiaper(deps, { kind: 'wet' });
    assert.ok(r.ok);
    if (!r.ok) return;
    const m = buildUndoableMutation({ kind: 'create', eventId: r.event.id, previousSnapshot: null, clock });
    assert.ok((await undoLoggingMutation(deps, m)).ok);
    const snap = await port.load();
    assert.equal(snap.events.find((e) => e.id === r.event.id)!.status, 'deleted');
    assert.ok(snap.syncQueue.includes(r.event.id)); // undo enters the sync queue (plan §8)
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.ok(!today.some((e) => e.id === r.event.id));
  });

  await checkAsync('CC2. undo a created bottle removes it from the timeline', async () => {
    const { repo, clock, deps } = newFeedDeps();
    const r = await saveBottleFeed(deps, { amountMl: 120, milkType: 'formula' });
    assert.ok(r.ok);
    if (!r.ok) return;
    const m = buildUndoableMutation({ kind: 'create', eventId: r.event.id, previousSnapshot: null, clock });
    assert.ok((await undoLoggingMutation(deps, m)).ok);
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.equal(today.length, 0);
  });

  await checkAsync('CC3. undo finishing a sleep restores the active session (status active, no endedAt)', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startSleep(deps, {})).ok);
    clock.advance(40 * 60_000);
    const before = selectActiveSleep(await repo.getActiveSessions(feedScope))!;
    assert.ok((await finishSleep(deps, { event: before })).ok);
    assert.equal(selectActiveSleep(await repo.getActiveSessions(feedScope)), null); // now completed
    const m = buildUndoableMutation({ kind: 'finish', eventId: before.id, previousSnapshot: before, clock });
    assert.ok((await undoLoggingMutation(deps, m)).ok);
    const restored = selectActiveSleep(await repo.getActiveSessions(feedScope));
    assert.ok(restored && restored.status === 'active' && restored.endedAt === null);
  });

  await checkAsync('CC4. undo saving a pump restores the volume draft (active pump with endedAt)', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startPump(deps, { side: 'both' })).ok);
    clock.advance(18 * 60_000);
    await finishPump(deps, { event: (await activePumpOf(repo))! });
    const draft = (await activePumpOf(repo))!;
    assert.ok((await savePump(deps, { event: draft, leftVolumeMl: 50, rightVolumeMl: 60 })).ok);
    assert.equal(await activePumpOf(repo), null); // completed — no longer active or a draft
    const m = buildUndoableMutation({ kind: 'finish', eventId: draft.id, previousSnapshot: draft, clock });
    assert.ok((await undoLoggingMutation(deps, m)).ok);
    const restored = await activePumpOf(repo);
    assert.ok(restored && restored.status === 'active' && restored.endedAt !== null); // the draft is back
  });

  await checkAsync('CC5. undo-finish is refused when a new active session of the same kind appeared (plan §8)', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startSleep(deps, {})).ok);
    clock.advance(30 * 60_000);
    const before = selectActiveSleep(await repo.getActiveSessions(feedScope))!;
    assert.ok((await finishSleep(deps, { event: before })).ok);
    assert.ok((await startSleep(deps, {})).ok); // a fresh sleep starts before undo
    const m = buildUndoableMutation({ kind: 'finish', eventId: before.id, previousSnapshot: before, clock });
    const u = await undoLoggingMutation(deps, m);
    assert.equal(u.ok, false);
    if (!u.ok) assert.equal(u.error.code, 'undo_conflict');
  });

  await checkAsync('CC6. formatLoggingToast reads the saved event: diaper / bottle / sleep / pump', async () => {
    const { repo, clock, deps } = newFeedDeps();
    await saveDiaper(deps, { kind: 'wet' });
    await saveBottleFeed(deps, { amountMl: 120, milkType: 'breast_milk' });
    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.equal(formatLoggingToast(today.find(isDiaperEvent)!, clock.now()), 'Diaper logged · wet');
    assert.equal(formatLoggingToast(today.find(isBottleFeed)!, clock.now()), 'Feed logged · 120 ml');
    // Sleep (40m) + pump (both, 110 ml) on a fresh store.
    const { repo: r2, clock: c2, deps: d2 } = newFeedDeps();
    assert.ok((await startSleep(d2, {})).ok);
    c2.advance(40 * 60_000);
    const fin = await finishSleep(d2, { event: selectActiveSleep(await r2.getActiveSessions(feedScope))! });
    assert.ok(fin.ok);
    if (fin.ok) assert.equal(formatLoggingToast(fin.event, c2.now()), 'Nap logged · 40m');
    assert.ok((await startPump(d2, { side: 'both' })).ok);
    c2.advance(5 * 60_000);
    await finishPump(d2, { event: (await activePumpOf(r2))! });
    const sv = await savePump(d2, { event: (await activePumpOf(r2))!, leftVolumeMl: 50, rightVolumeMl: 60 });
    assert.ok(sv.ok);
    if (sv.ok) assert.equal(formatLoggingToast(sv.event, c2.now()), 'Pump logged · 110 ml');
  });

  await checkAsync('CC7. buildUndoableMutation mints a fresh id + future expiry; a create carries no snapshot', async () => {
    const clock = createManualClock(NOW);
    const a = buildUndoableMutation({ kind: 'create', eventId: 'e1', previousSnapshot: null, clock });
    assert.equal(a.kind, 'create');
    assert.equal(a.eventId, 'e1');
    assert.equal(a.previousSnapshot, null);
    assert.ok(typeof a.mutationId === 'string' && a.mutationId.length > 0);
    assert.ok(Date.parse(a.expiresAt) > clock.now()); // expires in the future
    const b = buildUndoableMutation({ kind: 'create', eventId: 'e1', previousSnapshot: null, clock });
    assert.notEqual(a.mutationId, b.mutationId); // a new action replaces the previous undo context
  });

  /* ---------------------------------------------------------------- *
   * Task 11 — active-session recovery after app restart (plan §6
   * AppState, Phase 4/6.5/7.2 acceptance, §11.2 integration). Each check
   * drives a real use-case, simulates a force-close by building a FRESH
   * repository over the SAME persisted snapshot, hydrates, and asserts the
   * recovered state. There is no persisted counter — every duration is
   * recomputed from the stored `startedAt`/`endedAt` against the clock.
   * ---------------------------------------------------------------- */

  await checkAsync('DD1. finish a session → app restart → the completed event remains in the timeline (plan §11.2)', async () => {
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(persistence, clock);
    assert.ok((await startSleep({ repo, clock, actor }, {})).ok);
    clock.advance(40 * 60_000);
    const running = selectActiveSleep(await repo.getActiveSessions(feedScope))!;
    assert.ok((await finishSleep({ repo, clock, actor }, { event: running })).ok);

    // Force-close + relaunch: a brand-new repository over the same persisted snapshot.
    const state = await hydrateLoggingState(createLoggingRepository(persistence, clock), feedScope, clock);
    assert.equal(state.activeSleep, null); // no longer an active session
    const sleep = state.todayEvents.find(isSleepEvent);
    assert.ok(sleep && sleep.status === 'completed'); // the completed event survived the restart
    const view = formatTimelineEvent(sleep!, clock.now());
    assert.equal(view.title, 'Nap');
    assert.equal(view.subtitle, '40m'); // final duration is fixed (from endedAt), not recomputed to "now"
  });

  await checkAsync('DD2. a running breast + pump session reopens with the correct elapsed time after a restart (plan Phase 4)', async () => {
    // Breastfeeding: start Left, 9 minutes pass, then force-close.
    const breastStore = createInMemoryLoggingPersistence();
    const breastClock = createManualClock(NOW);
    const breastRepo = createLoggingRepository(breastStore, breastClock);
    assert.ok((await startBreastFeed({ repo: breastRepo, clock: breastClock, actor }, { side: 'left' })).ok);
    breastClock.advance(9 * 60_000);
    const breastState = await hydrateLoggingState(
      createLoggingRepository(breastStore, breastClock),
      feedScope,
      breastClock,
    );
    assert.ok(breastState.activeBreastFeed);
    assert.equal(breastState.activeBreastFeed?.details.activeSide, 'left'); // active side restored
    const totals = breastSegmentTotals(breastState.activeBreastFeed!.details.segments, breastClock.now());
    assert.equal(totals.totalLeftMs, 9 * 60_000); // recomputed from the open segment — no stored counter

    // Pump: start Both, 18 minutes pass (still running, NOT finished), then force-close.
    const pumpStore = createInMemoryLoggingPersistence();
    const pumpClock = createManualClock(NOW);
    const pumpRepo = createLoggingRepository(pumpStore, pumpClock);
    assert.ok((await startPump({ repo: pumpRepo, clock: pumpClock, actor }, { side: 'both' })).ok);
    pumpClock.advance(18 * 60_000);
    const pumpState = await hydrateLoggingState(createLoggingRepository(pumpStore, pumpClock), feedScope, pumpClock);
    assert.ok(pumpState.activePump && pumpState.activePump.endedAt === null); // still running, not a draft
    assert.equal(pumpState.pumpVolumeDraft, null);
    assert.equal(sessionElapsedMs(pumpState.activePump!, pumpClock.now()), 18 * 60_000);
  });

  await checkAsync('DD3. the recovered sleep reads consistently across card + status + timeline (single source of truth, plan Phase 6.5)', async () => {
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    assert.ok((await startSleep({ repo: createLoggingRepository(persistence, clock), clock, actor }, {})).ok);
    clock.advance(42 * 60_000);
    const state = await hydrateLoggingState(createLoggingRepository(persistence, clock), feedScope, clock);
    assert.ok(state.activeSleep);

    // All three surfaces derive from the SAME restored activeSleep / sessionElapsedMs.
    const subtitles = buildV2QuickLogSubtitles(
      {
        todayEvents: state.todayEvents,
        activeBreastFeed: state.activeBreastFeed,
        activeSleep: state.activeSleep,
        activePump: state.activePump,
        pumpVolumeDraft: state.pumpVolumeDraft,
      },
      clock.now(),
    );
    const status = buildV2TonightStatus({ todayEvents: state.todayEvents, activeSleep: state.activeSleep }, clock.now());
    const timeline = formatTimelineEvent(state.activeSleep!, clock.now());

    assert.equal(subtitles.sleep, 'Sleeping · 42m'); // Quick Log card
    const sleepStatus = status.find((i) => i.key === 'sleep');
    assert.equal(sleepStatus?.label, 'Sleeping');
    assert.equal(sleepStatus?.value, '42m'); // status strip
    assert.equal(timeline.title, 'Sleeping');
    assert.equal(timeline.subtitle, '42m'); // timeline — the same 42m on every surface
  });

  await checkAsync('DD4. a backwards device clock surfaces the recover state for breast + pump, never a negative duration (plan §6)', async () => {
    // Breastfeeding started "now", then the device clock jumps backwards.
    const breastStore = createInMemoryLoggingPersistence();
    const breastClock = createManualClock(NOW);
    assert.ok(
      (await startBreastFeed({ repo: createLoggingRepository(breastStore, breastClock), clock: breastClock, actor }, { side: 'right' })).ok,
    );
    breastClock.set(NOW - 60_000); // clock moves to before the session start
    const breastState = await hydrateLoggingState(createLoggingRepository(breastStore, breastClock), feedScope, breastClock);
    assert.ok(breastState.activeBreastFeed); // the real session is kept (stored data)
    assert.equal(breastState.error?.code, 'started_in_future'); // but flagged for a recover prompt
    assert.equal(sessionElapsedMs(breastState.activeBreastFeed!, breastClock.now()), 0); // clamped, never negative

    // The same recover state applies to a pump session.
    const pumpStore = createInMemoryLoggingPersistence();
    const pumpClock = createManualClock(NOW);
    assert.ok((await startPump({ repo: createLoggingRepository(pumpStore, pumpClock), clock: pumpClock, actor }, { side: 'left' })).ok);
    pumpClock.set(NOW - 60_000);
    const pumpState = await hydrateLoggingState(createLoggingRepository(pumpStore, pumpClock), feedScope, pumpClock);
    assert.ok(pumpState.activePump);
    assert.equal(pumpState.error?.code, 'started_in_future');
    assert.equal(sessionElapsedMs(pumpState.activePump!, pumpClock.now()), 0);
  });

  await checkAsync('DD5. foreground reconcile recomputes a running timer from timestamps after time in the background (plan §6, §11.2)', async () => {
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(persistence, clock);
    assert.ok((await startSleep({ repo, clock, actor }, {})).ok);
    const hydrated = await hydrateLoggingState(repo, feedScope, clock);
    assert.equal(sessionElapsedMs(hydrated.activeSleep!, clock.now()), 0);
    const eventsBefore = hydrated.todayEvents.length;

    // 25 minutes pass with the app backgrounded, then it returns to the foreground.
    clock.advance(25 * 60_000);
    const reconciled = await reconcileLoggingState(repo, feedScope, clock, hydrated);
    assert.ok(reconciled.activeSleep);
    assert.equal(sessionElapsedMs(reconciled.activeSleep!, clock.now()), 25 * 60_000); // recomputed, not a stored counter
    assert.equal(reconciled.todayEvents.length, eventsBefore); // reconcile re-reads, it does not create a new event
    assert.equal(reconciled.error, null);
  });

  await checkAsync('DD6. the pump volume draft reopens on its volume step after a restart (plan Phase 7.2)', async () => {
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(persistence, clock);
    assert.ok((await startPump({ repo, clock, actor }, { side: 'both' })).ok);
    clock.advance(20 * 60_000);
    const running = selectActivePump(await repo.getActiveSessions(feedScope), 'cg-mom')!;
    assert.ok((await finishPump({ repo, clock, actor }, { event: running })).ok);

    // Force-close while on the volume step, then relaunch.
    const state = await hydrateLoggingState(createLoggingRepository(persistence, clock), feedScope, clock);
    assert.ok(state.pumpVolumeDraft); // the draft is recovered, not lost (plan Phase 7.2 acceptance)
    assert.equal(state.pumpVolumeDraft?.side, 'both');
    assert.ok(state.activePump && state.activePump.endedAt !== null); // finished → UI opens the volume body, not the timer
    const subtitles = buildV2QuickLogSubtitles(
      {
        todayEvents: state.todayEvents,
        activeBreastFeed: state.activeBreastFeed,
        activeSleep: state.activeSleep,
        activePump: state.activePump,
        pumpVolumeDraft: state.pumpVolumeDraft,
      },
      clock.now(),
    );
    assert.equal(subtitles.pump, 'Finished · add volume'); // the card reopens on the volume step
  });

  // EE. Validation & edge-case handling (plan §1.1 validators, §6 time validations,
  // task 12). Drives each flow's FAILURE path through a real repository to prove it
  // is reachable end-to-end and surfaces a recover/error state WITHOUT persisting a
  // bad record — complementing the validator unit checks (U4–U9) and the per-flow
  // happy paths (X/Y/Z/AA). A backwards device clock is the canonical §6 anomaly:
  // the finish/switch is refused and the session is left untouched.
  await checkAsync('EE1. finishBreastFeed with a backwards device clock is refused; the session stays active (plan §6)', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startBreastFeed(deps, { side: 'left' })).ok);
    const open = await activeBreast(repo);
    assert.ok(open);
    clock.set(NOW - 60_000); // the device clock jumps to before the session started
    const r = await finishBreastFeed(deps, { event: open });
    assert.equal(r.ok, false);
    // The open segment would close before it began → the segment-chain guard catches
    // the reversed range first (the range guard is the second line of defence).
    if (!r.ok) assert.equal(r.error.code, 'invalid_breast_segments');
    const still = await activeBreast(repo);
    assert.ok(still);
    assert.equal(still.status, 'active'); // nothing was completed
    assert.equal(still.details.activeSide, 'left'); // unchanged
    assert.equal(still.details.segments.length, 1);
    assert.equal(still.details.segments[0].endedAt, null); // still open
  });

  await checkAsync('EE2. finishPump with a backwards device clock is refused; the pump stays running, no volume draft (plan §6)', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startPump(deps, { side: 'both' })).ok);
    const open = await activePumpOf(repo);
    assert.ok(open);
    clock.set(NOW - 60_000);
    const r = await finishPump(deps, { event: open });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, 'started_in_future');
    const still = await activePumpOf(repo);
    assert.ok(still);
    assert.equal(still.endedAt, null); // never finished → still the running timer, not a draft
  });

  await checkAsync('EE3. finishSleep with a backwards device clock is refused; the sleep stays active (plan §6, complements Y5)', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startSleep(deps, {})).ok);
    const open = await activeSleepOf(repo);
    assert.ok(open);
    clock.set(NOW - 60_000);
    const r = await finishSleep(deps, { event: open });
    assert.equal(r.ok, false);
    // Y5 covers the manual "endedAt before startedAt" case; this is the device-clock-
    // moved-backwards case, which the future-start guard catches first.
    if (!r.ok) assert.equal(r.error.code, 'started_in_future');
    const still = await activeSleepOf(repo);
    assert.ok(still);
    assert.equal(still.status, 'active');
    assert.equal(still.endedAt, null);
  });

  await checkAsync('EE4. switchBreastSide to a time before the open segment began is refused; segments unchanged (plan §5.2/§6)', async () => {
    const { repo, deps } = newFeedDeps();
    assert.ok((await startBreastFeed(deps, { side: 'left' })).ok);
    const open = await activeBreast(repo);
    assert.ok(open);
    const r = await switchBreastSide(deps, {
      event: open,
      side: 'right',
      at: new Date(NOW - 60_000).toISOString(),
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, 'invalid_breast_segments');
    const still = await activeBreast(repo);
    assert.ok(still);
    assert.equal(still.details.activeSide, 'left'); // no side switch persisted
    assert.equal(still.details.segments.length, 1); // no second segment appended
    assert.equal(still.details.segments[0].endedAt, null); // first segment still open
  });

  await checkAsync('EE5. saveCompletedSleep rejects endedAt before startedAt and is idempotent by clientEventId (plan §6/§9)', async () => {
    // Ordering: a range that ends before it starts is rejected and persists nothing.
    const a = newFeedDeps();
    const bad = await saveCompletedSleep(a.deps, {
      startedAt: new Date(NOW - 30 * 60_000).toISOString(),
      endedAt: new Date(NOW - 60 * 60_000).toISOString(),
    });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.error.code, 'invalid_session_range');
    const todayA = await a.repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.equal(todayA.filter(isSleepEvent).length, 0);

    // Idempotency: a retried save with the same clientEventId lands a single event.
    const b = newFeedDeps();
    const input = {
      startedAt: new Date(NOW - 60 * 60_000).toISOString(),
      endedAt: new Date(NOW - 30 * 60_000).toISOString(),
      clientEventId: 'cid-completed-sleep',
    };
    assert.ok((await saveCompletedSleep(b.deps, input)).ok);
    assert.ok((await saveCompletedSleep(b.deps, input)).ok); // retried (double-tap)
    const todayB = await b.repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.equal(todayB.filter(isSleepEvent).length, 1);
  });

  await checkAsync('EE6. validator sanity caps are reachable through the use-cases (bottle/pump) and persist nothing (plan §1.1)', async () => {
    // Bottle: an over-cap amount and a non-finite amount both reject and save nothing.
    const bottle = newFeedDeps();
    const overBottle = await saveBottleFeed(bottle.deps, { amountMl: BOTTLE_MAX_ML + 1, milkType: 'formula' });
    assert.equal(overBottle.ok, false);
    if (!overBottle.ok) assert.equal(overBottle.error.code, 'invalid_bottle_amount');
    assert.equal(
      (await saveBottleFeed(bottle.deps, { amountMl: Number.POSITIVE_INFINITY, milkType: 'formula' })).ok,
      false,
    );
    const todayBottle = await bottle.repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    assert.equal(todayBottle.filter(isBottleFeed).length, 0);

    // Pump: an over-cap or negative side volume rejects and leaves the draft intact.
    const pump = newFeedDeps();
    assert.ok((await startPump(pump.deps, { side: 'both' })).ok);
    pump.clock.advance(10 * 60_000);
    const finished = await activePumpOf(pump.repo);
    assert.ok(finished);
    assert.ok((await finishPump(pump.deps, { event: finished })).ok);
    const draft = await activePumpOf(pump.repo);
    assert.ok(draft);
    assert.equal(
      (await savePump(pump.deps, { event: draft, leftVolumeMl: PUMP_MAX_ML + 1, rightVolumeMl: 60 })).ok,
      false,
    );
    assert.equal(
      (await savePump(pump.deps, { event: draft, leftVolumeMl: -10, rightVolumeMl: 60 })).ok,
      false,
    );
    const stillDraft = await activePumpOf(pump.repo);
    assert.ok(stillDraft);
    assert.equal(stillDraft.status, 'active'); // not completed
    assert.notEqual(stillDraft.endedAt, null); // still a finished-awaiting-volume draft
  });

  await checkAsync('EE7. a use-case failure surfaces as a store recover state, and a later success clears it (the provider flow, plan §6)', async () => {
    const { repo, clock, deps } = newFeedDeps();
    assert.ok((await startSleep(deps, {})).ok);
    let state = await hydrateLoggingState(repo, feedScope, clock);
    const open = state.activeSleep;
    assert.ok(open);
    assert.equal(state.error, null);

    // Device clock jumps backwards → finishing is refused and (exactly as the
    // provider does) the failure is dropped into the store as a recover state.
    clock.set(NOW - 60_000);
    const bad = await finishSleep(deps, { event: open });
    assert.equal(bad.ok, false);
    if (!bad.ok) state = withError(state, bad.error);
    assert.equal(state.error?.code, 'started_in_future');

    // The clock recovers; finishing now succeeds and a reconcile clears the recover
    // state, leaving the completed sleep in the timeline.
    clock.set(NOW + 40 * 60_000);
    assert.ok((await finishSleep(deps, { event: open })).ok);
    state = await reconcileLoggingState(repo, feedScope, clock, state);
    assert.equal(state.error, null);
    assert.equal(state.activeSleep, null);
    assert.ok(state.todayEvents.some((e) => isSleepEvent(e) && e.status === 'completed'));
  });

  /* ---------------------------------------------------------------- *
   * FF. End-to-end user journeys (plan §11.3 E2E scenarios) expressed
   * as use-case SEQUENCES, plus the explicit §11.2 "repo create → store
   * update → timeline render" pipeline. Where the prior sections test one
   * use-case (X/Y/Z/AA) or one acceptance fact (DD/EE), these string a
   * whole flow together — start → close/reopen (a real hydrate) → continue
   * → finish — and then assert the RENDERED surfaces (timeline row, quick-
   * log subtitle, status strip, toast) the user actually sees, proving the
   * use-case → repo → store-hydrate → selector pipeline connects per flow.
   * "Close/reopen" is a fresh repository over the SAME persisted snapshot,
   * the faithful force-close simulation (the repo is stateless over the
   * port, so reusing `deps` after the hydrate acts on the same data).
   * ---------------------------------------------------------------- */

  await checkAsync('FF1. §11.2 pipeline: repository create → store hydrate → timeline render', async () => {
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(persistence, clock);
    // create (use-case → repo)
    assert.ok((await saveBottleFeed({ repo, clock, actor }, { amountMl: 90, milkType: 'formula' })).ok);
    // store update (hydrate reads the repo into LoggingState)
    const state = await hydrateLoggingState(createLoggingRepository(persistence, clock), feedScope, clock);
    assert.equal(state.todayEvents.length, 1);
    const e = state.todayEvents[0];
    assert.ok(isBottleFeed(e) && e.details.amountMl === 90);
    // timeline render (the §7.4 formatter over the stored event)
    const view = formatTimelineEvent(e, clock.now());
    assert.equal(view.title, 'Bottle');
    assert.equal(view.subtitle, '90 ml · formula');
    assert.equal(view.icon, 'feed');
  });

  await checkAsync('FF1b. History timeline reads refreshed v2 state immediately after a create', async () => {
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(persistence, clock);
    let state = await hydrateLoggingState(repo, feedScope, clock);

    const saved = await saveDiaper({ repo, clock, actor }, { kind: 'wet' });
    assert.ok(saved.ok);
    if (!saved.ok) return;

    state = await reconcileLoggingState(repo, feedScope, clock, state);
    const rows = buildV2HistoryTimeline(state.todayEvents, seedCaregivers, clock.now());

    assert.equal(rows[0]?.id, saved.event.id);
    assert.equal(rows[0]?.label, 'Diaper · wet');
    assert.equal(rows[0]?.caregiverName, 'Mom');
  });

  await checkAsync('FF2. §11.3 #1: Wet diaper in two taps → it shows on the card + timeline → Undo reverts both', async () => {
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(persistence, clock);
    const deps = { repo, clock, actor };
    // "Diaper → Wet" is a single use-case call (two taps, one event).
    const r = await saveDiaper(deps, { kind: 'wet' });
    assert.ok(r.ok);
    if (!r.ok) return;
    let state = await hydrateLoggingState(createLoggingRepository(persistence, clock), feedScope, clock);
    assert.equal(state.todayEvents.filter(isDiaperEvent).length, 1); // exactly one event
    assert.equal(formatTimelineEvent(state.todayEvents[0], clock.now()).subtitle, 'wet');
    clock.advance(2 * 60_000);
    const before = buildV2QuickLogSubtitles(
      {
        todayEvents: state.todayEvents,
        activeBreastFeed: state.activeBreastFeed,
        activeSleep: state.activeSleep,
        activePump: state.activePump,
        pumpVolumeDraft: state.pumpVolumeDraft,
      },
      clock.now(),
    );
    assert.equal(before.diaper, '2m ago · wet'); // the card reflects the save

    // Undo the create → soft-delete; the card + timeline revert to empty.
    const m = buildUndoableMutation({ kind: 'create', eventId: r.event.id, previousSnapshot: null, clock });
    assert.ok((await undoLoggingMutation(deps, m)).ok);
    state = await hydrateLoggingState(createLoggingRepository(persistence, clock), feedScope, clock);
    assert.ok(!state.todayEvents.some((e) => e.id === r.event.id)); // gone from the timeline
    const after = buildV2QuickLogSubtitles(
      {
        todayEvents: state.todayEvents,
        activeBreastFeed: state.activeBreastFeed,
        activeSleep: state.activeSleep,
        activePump: state.activePump,
        pumpVolumeDraft: state.pumpVolumeDraft,
      },
      clock.now(),
    );
    assert.equal(after.diaper, 'Tap to log'); // the card reverts
  });

  await checkAsync('FF3. §11.3 #2: Bottle 90 ml (presets/steppers, no keyboard) → timeline + card + toast', async () => {
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(persistence, clock);
    // 90 ml comes from a preset/stepper — at the use-case layer it is just amountMl, no keyboard input.
    const r = await saveBottleFeed({ repo, clock, actor }, { amountMl: 90, milkType: 'breast_milk' });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(formatLoggingToast(r.event, clock.now()), 'Feed logged · 90 ml'); // Undo toast
    clock.advance(3 * 60_000);
    const state = await hydrateLoggingState(createLoggingRepository(persistence, clock), feedScope, clock);
    const view = formatTimelineEvent(state.todayEvents[0], clock.now());
    assert.equal(view.title, 'Bottle');
    assert.equal(view.subtitle, '90 ml · breast milk');
    const subtitles = buildV2QuickLogSubtitles(
      {
        todayEvents: state.todayEvents,
        activeBreastFeed: state.activeBreastFeed,
        activeSleep: state.activeSleep,
        activePump: state.activePump,
        pumpVolumeDraft: state.pumpVolumeDraft,
      },
      clock.now(),
    );
    assert.equal(subtitles.feed, '3m ago · 90 ml'); // the Feed card shows the last bottle + recency
  });

  await checkAsync('FF4. §11.3 #3: Breast Left → close sheet → reopen → switch Right → finish (timeline 5m left · 3m right)', async () => {
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(persistence, clock);
    const deps = { repo, clock, actor };
    assert.ok((await startBreastFeed(deps, { side: 'left' })).ok);
    clock.advance(5 * 60_000);

    // Close the sheet + reopen (force-close): hydrate a fresh repo over the same snapshot.
    const reopened = await hydrateLoggingState(createLoggingRepository(persistence, clock), feedScope, clock);
    assert.ok(reopened.activeBreastFeed);
    assert.equal(reopened.activeBreastFeed?.details.activeSide, 'left'); // active side restored
    assert.equal(
      breastSegmentTotals(reopened.activeBreastFeed!.details.segments, clock.now()).totalLeftMs,
      5 * 60_000,
    ); // 5m on Left recomputed from the open segment

    // Switch to Right on the RESTORED session, accrue 3m, then finish.
    assert.ok((await switchBreastSide(deps, { event: reopened.activeBreastFeed!, side: 'right' })).ok);
    clock.advance(3 * 60_000);
    const fin = await finishBreastFeed(deps, { event: (await activeBreast(repo))! });
    assert.ok(fin.ok);
    if (fin.ok) {
      assert.equal(fin.event.details.totalLeftMs, 5 * 60_000);
      assert.equal(fin.event.details.totalRightMs, 3 * 60_000); // both durations kept across the reopen
    }
    // After another restart it is a completed feed in the timeline, no active session.
    const after = await hydrateLoggingState(createLoggingRepository(persistence, clock), feedScope, clock);
    assert.equal(after.activeBreastFeed, null);
    const completed = after.todayEvents.find((e) => isBreastFeed(e) && e.status === 'completed');
    assert.ok(completed);
    const view = formatTimelineEvent(completed!, clock.now());
    assert.equal(view.title, 'Breastfeed');
    assert.equal(view.subtitle, '5m left · 3m right');
  });

  await checkAsync('FF5. §11.3 #4: Sleep start (Hero) → close app → reopen → finish (Quick Log) — one session, awake after', async () => {
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(persistence, clock);
    const deps = { repo, clock, actor };
    // Hero "Start sleep".
    assert.ok((await startSleep(deps, {})).ok);
    clock.advance(10 * 60_000);

    // Close the app + reopen: the same active sleep is restored (single source of truth).
    const reopened = await hydrateLoggingState(createLoggingRepository(persistence, clock), feedScope, clock);
    assert.ok(reopened.activeSleep);
    assert.equal(sessionElapsedMs(reopened.activeSleep!, clock.now()), 10 * 60_000);

    // Finish from the Quick Log card — acts on the SAME restored session.
    clock.advance(40 * 60_000); // total 50m
    assert.ok((await finishSleep(deps, { event: reopened.activeSleep! })).ok);

    const after = await hydrateLoggingState(createLoggingRepository(persistence, clock), feedScope, clock);
    assert.equal(after.activeSleep, null); // back to awake on every surface
    const sleep = after.todayEvents.find(isSleepEvent);
    assert.ok(sleep && sleep.status === 'completed');
    assert.equal(formatTimelineEvent(sleep!, clock.now()).subtitle, '50m'); // fixed final duration

    clock.advance(2 * 60_000);
    const subtitles = buildV2QuickLogSubtitles(
      {
        todayEvents: after.todayEvents,
        activeBreastFeed: after.activeBreastFeed,
        activeSleep: after.activeSleep,
        activePump: after.activePump,
        pumpVolumeDraft: after.pumpVolumeDraft,
      },
      clock.now(),
    );
    assert.equal(subtitles.sleep, 'Awake for 2m'); // Quick Log card flips to awake
    const status = buildV2TonightStatus({ todayEvents: after.todayEvents, activeSleep: after.activeSleep }, clock.now());
    assert.equal(status.find((i) => i.key === 'sleep')?.label, 'Awake'); // status strip flips too
  });

  await checkAsync('FF6. §11.3 #5: Pump Both → finish → close sheet → restore draft → save 110 ml', async () => {
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(persistence, clock);
    const deps = { repo, clock, actor };
    assert.ok((await startPump(deps, { side: 'both' })).ok);
    clock.advance(18 * 60_000);
    assert.ok((await finishPump(deps, { event: (await activePumpOf(repo))! })).ok);

    // Close the sheet + reopen: the volume draft is recovered, the card opens on the volume step.
    const reopened = await hydrateLoggingState(createLoggingRepository(persistence, clock), feedScope, clock);
    assert.ok(reopened.pumpVolumeDraft && reopened.pumpVolumeDraft.side === 'both');
    assert.ok(reopened.activePump && reopened.activePump.endedAt !== null);
    const draftCard = buildV2QuickLogSubtitles(
      {
        todayEvents: reopened.todayEvents,
        activeBreastFeed: reopened.activeBreastFeed,
        activeSleep: reopened.activeSleep,
        activePump: reopened.activePump,
        pumpVolumeDraft: reopened.pumpVolumeDraft,
      },
      clock.now(),
    );
    assert.equal(draftCard.pump, 'Finished · add volume');

    // Save 110 ml (50 + 60) on the restored draft → completed.
    const sv = await savePump(deps, { event: reopened.activePump!, leftVolumeMl: 50, rightVolumeMl: 60 });
    assert.ok(sv.ok);
    if (sv.ok) assert.equal(formatLoggingToast(sv.event, clock.now()), 'Pump logged · 110 ml');

    const after = await hydrateLoggingState(createLoggingRepository(persistence, clock), feedScope, clock);
    assert.equal(after.activePump, null);
    assert.equal(after.pumpVolumeDraft, null);
    const pump = after.todayEvents.find(isPumpEvent);
    assert.ok(pump && pump.status === 'completed');
    const view = formatTimelineEvent(pump!, clock.now());
    assert.equal(view.title, 'Pump · 110 ml');
    assert.equal(view.subtitle, 'L 50 ml · R 60 ml · 18m'); // Both sums left + right in the timeline
    clock.advance(5 * 60_000);
    const subtitles = buildV2QuickLogSubtitles(
      {
        todayEvents: after.todayEvents,
        activeBreastFeed: after.activeBreastFeed,
        activeSleep: after.activeSleep,
        activePump: after.activePump,
        pumpVolumeDraft: after.pumpVolumeDraft,
      },
      clock.now(),
    );
    assert.equal(subtitles.pump, 'Last · 110 ml'); // last pump on the card
  });

  await checkAsync('FF7. §11.3 #6/#7 (local portion): instant log survives restart offline + one active sleep per child', async () => {
    // #6 — Offline: the repository is local-first (no server is wired), so a save is
    // `syncStatus: 'local'` and survives a restart with no network. The remaining half
    // — "turn the network on → synced" — needs the server sync worker that is plan
    // Phase 9 (only `enqueueSync` on Undo exists today), so it is intentionally NOT yet
    // implemented; this asserts the offline-survives-restart guarantee we DO have.
    const persistence = createInMemoryLoggingPersistence();
    const clock = createManualClock(NOW);
    const repo = createLoggingRepository(persistence, clock);
    const deps = { repo, clock, actor };
    const r = await saveDiaper(deps, { kind: 'dirty' });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.event.syncStatus, 'local'); // saved offline, no server round-trip
    const restarted = await hydrateLoggingState(createLoggingRepository(persistence, clock), feedScope, clock);
    assert.ok(restarted.todayEvents.some((e) => e.id === r.event.id)); // still there after restart

    // #7 — Two "devices"/caregivers cannot create two active sleeps for one child: this
    // single-active-session invariant is the data guarantee the cross-device conflict UX
    // ("Sleep was already started by Dad") rests on. The server-side reconciliation + the
    // conflict UI itself are plan Phase 9; here we prove the local guard a second Start
    // reopens the existing session rather than creating a duplicate.
    const persistence2 = createInMemoryLoggingPersistence();
    const clock2 = createManualClock(NOW);
    const repo2 = createLoggingRepository(persistence2, clock2);
    const deps2 = { repo: repo2, clock: clock2, actor };
    assert.ok((await startSleep(deps2, {})).ok);
    assert.ok((await startSleep(deps2, {})).ok); // a "second device" Start
    const activeSleeps = (await repo2.getActiveSessions(feedScope)).filter(isSleepEvent);
    assert.equal(activeSleeps.length, 1); // exactly one active sleep per child — never two
  });

  // SS. Secure session storage (auth Phase 1) — exercise the REAL chunked-storage
  // logic that persists the Supabase auth session, against an in-memory backend.
  // The adapter module (secureSessionStore.ts) imports react-native / expo-secure-
  // store and can't load here, so the pure core was split into chunkedSessionStorage.ts;
  // this covers chunk split, reassembly, the manifest, fault tolerance, leftover-
  // chunk cleanup on shrink, and full removal on sign-out.
  const createMemorySecureBackend = (): { store: Map<string, string>; backend: ChunkBackend } => {
    const store = new Map<string, string>();
    return {
      store,
      backend: {
        // A real keystore returns null for an absent key; a stored value (even '')
        // comes back verbatim — Map.get's undefined ?? null models exactly that.
        getItemAsync: async (key) => store.get(key) ?? null,
        setItemAsync: async (key, value) => {
          store.set(key, value);
        },
        deleteItemAsync: async (key) => {
          store.delete(key);
        },
      },
    };
  };
  const SECURE_SESSION_KEY = 'sb-lullaby-auth-token';

  await checkAsync('SS1. a small value round-trips as one chunk + a "1" manifest; an absent key is null', async () => {
    const { store, backend } = createMemorySecureBackend();
    const storage = createChunkedStorage(backend);
    assert.equal(await storage.getItem(SECURE_SESSION_KEY), null); // nothing stored yet
    await storage.setItem(SECURE_SESSION_KEY, 'session-token');
    assert.equal(await storage.getItem(SECURE_SESSION_KEY), 'session-token');
    assert.equal(store.get(SECURE_SESSION_KEY), '1'); // base key holds the chunk count
    assert.equal(store.get(`${SECURE_SESSION_KEY}.chunk.0`), 'session-token');
  });

  await checkAsync('SS2. a value larger than CHUNK_SIZE splits into chunks and reassembles exactly', async () => {
    const { store, backend } = createMemorySecureBackend();
    const storage = createChunkedStorage(backend);
    const big = 'A'.repeat(CHUNK_SIZE * 2 + 123); // spans 3 chunks
    await storage.setItem(SECURE_SESSION_KEY, big);
    assert.equal(store.get(SECURE_SESSION_KEY), '3'); // manifest reflects 3 chunks
    assert.equal(store.get(`${SECURE_SESSION_KEY}.chunk.2`)?.length, 123); // last chunk is the remainder
    assert.equal(store.get(`${SECURE_SESSION_KEY}.chunk.3`), undefined); // no extra chunk
    assert.equal(await storage.getItem(SECURE_SESSION_KEY), big); // round-trips character-for-character
  });

  await checkAsync('SS3. splitIntoChunks handles empty, exact-boundary, and over-boundary lengths', async () => {
    assert.deepEqual(splitIntoChunks(''), ['']); // empty → one (empty) chunk
    assert.equal(splitIntoChunks('z'.repeat(CHUNK_SIZE)).length, 1); // exactly one chunk
    const two = splitIntoChunks('z'.repeat(CHUNK_SIZE + 1));
    assert.equal(two.length, 2);
    assert.equal(two[0].length, CHUNK_SIZE);
    assert.equal(two[1].length, 1);
  });

  await checkAsync('SS4. a missing interior chunk fails safe to null (never a half-decoded session)', async () => {
    const { store, backend } = createMemorySecureBackend();
    const storage = createChunkedStorage(backend);
    await storage.setItem(SECURE_SESSION_KEY, 'B'.repeat(CHUNK_SIZE * 2 + 5)); // 3 chunks
    store.delete(`${SECURE_SESSION_KEY}.chunk.1`); // simulate a torn/partial write
    assert.equal(await storage.getItem(SECURE_SESSION_KEY), null);
  });

  await checkAsync('SS5. a corrupt or empty manifest reads as null', async () => {
    const { store, backend } = createMemorySecureBackend();
    const storage = createChunkedStorage(backend);
    store.set(SECURE_SESSION_KEY, 'not-a-number');
    assert.equal(await storage.getItem(SECURE_SESSION_KEY), null);
    store.set(SECURE_SESSION_KEY, '0'); // a count < 1 is not a real session
    assert.equal(await storage.getItem(SECURE_SESSION_KEY), null);
    store.set(SECURE_SESSION_KEY, ''); // empty manifest
    assert.equal(await storage.getItem(SECURE_SESSION_KEY), null);
  });

  await checkAsync('SS6. overwriting with a smaller value drops the leftover chunks (no stale bleed)', async () => {
    const { store, backend } = createMemorySecureBackend();
    const storage = createChunkedStorage(backend);
    await storage.setItem(SECURE_SESSION_KEY, 'C'.repeat(CHUNK_SIZE * 3)); // 3 chunks
    await storage.setItem(SECURE_SESSION_KEY, 'small'); // now 1 chunk
    assert.equal(store.get(SECURE_SESSION_KEY), '1');
    assert.equal(store.get(`${SECURE_SESSION_KEY}.chunk.1`), undefined); // stale chunks removed
    assert.equal(store.get(`${SECURE_SESSION_KEY}.chunk.2`), undefined);
    assert.equal(await storage.getItem(SECURE_SESSION_KEY), 'small');
  });

  await checkAsync('SS7. removeItem clears the manifest and every chunk (sign-out leaves nothing)', async () => {
    const { store, backend } = createMemorySecureBackend();
    const storage = createChunkedStorage(backend);
    await storage.setItem(SECURE_SESSION_KEY, 'D'.repeat(CHUNK_SIZE + 10)); // 2 chunks
    await storage.removeItem(SECURE_SESSION_KEY);
    assert.equal(store.size, 0); // base key + both chunks gone
    assert.equal(await storage.getItem(SECURE_SESSION_KEY), null);
    await storage.removeItem(SECURE_SESSION_KEY); // idempotent — no throw on an empty store
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
