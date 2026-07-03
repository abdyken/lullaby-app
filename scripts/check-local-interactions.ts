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
import { readdirSync, readFileSync } from 'node:fs';

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
// Account deletion — the local-data RESET contract (mirror of guestData). Unlike
// every other auth transition, a verified account deletion CLEARS local-first
// data so a later sign-in with the same identity starts genuinely fresh.
import {
  ACCOUNT_LOCAL_DATA_KEYS,
  ACCOUNT_LOCAL_DATA_PREFIXES,
  ACCOUNT_RESET_PRESERVED_KEYS,
  selectAccountDeletionKeys,
} from '../src/data/accountReset';
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
import { AUTH_CALLBACK_PATH, parseAuthCallbackUrl, parseAuthRedirect } from '../src/lib/authRedirect';
// Account-entry visibility (this task) — the pure "no Supabase session → which
// surface?" decision behind the AuthProvider bootstrap.
import { resolveNoSessionStatus } from '../src/state/authStatusResolver';
// Pure-JS SHA-256 behind the WebCrypto polyfill (PKCE S256 code challenge).
import { sha256Bytes } from '../src/lib/sha256';
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
  isNoteEvent,
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
  NoteEvent,
  PumpEvent,
  SleepEvent,
} from '../src/features/logging/domain/types';
// Canonical logging repository/service layer — interface, in-memory persistence,
// the impl, the legacy mapper, and the compatibility feature-flag shim.
import {
  createInMemoryLoggingPersistence,
  parseLoggingSnapshot,
  serializeLoggingSnapshot,
} from '../src/features/logging/data/loggingPersistence';
import { createLoggingRepository } from '../src/features/logging/data/LoggingRepositoryImpl';
import {
  mergeCanonicalEvents,
  migrateLegacyEventsToLoggingSnapshot,
  selectCanonicalEventsInRange,
} from '../src/features/logging/data/normalizedEvents';
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
import { loadLegacyInsightsHistory } from '../src/features/insights/loadLegacyInsightsHistory';
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
  saveNote,
  savePump,
  getInsightsSevenDayHistory,
  startBreastFeed,
  startPump,
  startSleep,
  switchBreastSide,
  undoLoggingMutation,
  type LoggingActor,
} from '../src/features/logging/application';
// Caregiver invite beta share copy (this task) — the pure message builder behind
// InviteCaregiverSheet's Share action. The .tsx imports react-native and can't
// load here, so the string logic lives in a dependency-free leaf and is covered
// directly, alongside source-level checks on the role-selector markup.
import {
  buildInviteShareMessage,
  resolveAppInstallUrl,
} from '../src/components/auth/inviteShareMessage';
// Settings links (privacy / terms / support) — the pure env-or-placeholder
// resolvers behind the Settings screen's link rows. Dependency-free leaf,
// covered directly in §SL.
import {
  buildSupportMailtoUrl,
  DEFAULT_PRIVACY_POLICY_URL,
  DEFAULT_SUPPORT_EMAIL,
  DEFAULT_TERMS_URL,
  resolvePrivacyPolicyUrl,
  resolveSupportEmail,
  resolveTermsUrl,
} from '../src/lib/appLinks';
// Pro foundation (Phase 1) — pure config + gate leaves. proConfig reads only
// process.env (and re-exports the preview flag); proGates is a dependency-free
// predicate leaf. Both are safe to load here and are covered directly in §W.
import {
  getProMode,
  getRevenueCatApiKey,
  getRevenueCatEntitlementId,
  getRevenueCatOfferingId,
  hasRevenueCatConfig,
  isProEnabled,
  resolveDevProEntitlement,
} from '../src/lib/proConfig';
import {
  canAddExtraCaregivers,
  canExportWeeklyRecap,
  canSharePediatricianSummary,
  canUseLlmNightRead,
  canViewFullHistory,
} from '../src/lib/proGates';
// Pro Phase 3 — the PURE weekly-export text builder (imports only a type, so it is
// Node-safe). The Share wrapper (shareWeeklyExport) imports react-native and is
// source-scanned only, never imported here.
import { buildWeeklyExportText } from '../src/features/insights/buildWeeklyExportText';
import type { InsightsViewModel } from '../src/features/insights/types';
// Reassure v2 — the pure triage router / red-flag guardrail / night-window
// recap leaves. All are react-native-free by design (source-scanned in §X).
import { clinicalContentVisible } from '../src/features/reassure/domain/contentGate';
import { REDFLAGS, matchesRedFlag } from '../src/features/reassure/domain/redflags';
import { normalizeAsk, route } from '../src/features/reassure/domain/router';
import { classifyScope } from '../src/features/reassure/domain/scope';
// Pediatrician triage-call contact — pure, RN-free helpers (device I/O + hook
// live in application/, which import react-native and can't load here).
import {
  PEDIATRICIAN_PHONE_KEY,
  hasDialablePhone,
  normalizePediatricianPhone,
  parsePediatricianPhone,
  telUrlFor,
} from '../src/features/reassure/domain/pediatricianContact';
import {
  DAY_CONTEXT_START_HOUR,
  NIGHT_RECAP_END_HOUR,
  NIGHT_RECAP_START_HOUR,
  currentContextWindowFor,
  nightWindowFor,
} from '../src/features/reassure/domain/nightWindow';
// AI night-read consent — pure, RN-free helpers (device I/O + hook live in
// application/, which import react-native and can't load here).
import {
  AI_NIGHT_READ_CONSENT_KEY,
  consentAllowsAiNightRead,
  parseAiConsent,
} from '../src/features/reassure/domain/aiConsent';
import {
  SPITUP_NOTE_LABEL,
  buildReassureRecap,
  recapHeading,
  recapReadText,
  recapWindowLabel,
} from '../src/features/reassure/domain/recap';
import { isSpeechAvailable } from '../src/features/reassure/application/speech';
import {
  classifyVoiceRecognitionError,
  nextLowVolumeSampleCount,
  shouldShowLowVolumeHint,
} from '../src/features/reassure/application/useVoiceInput';
import {
  REASSURE_VOICE_CONTEXTUAL_STRINGS,
  normalizeVoiceTranscript,
  resolveVoiceTranscript,
  selectVoiceTranscriptCandidate,
} from '../src/features/reassure/domain/voiceTranscript';
import { EXAMPLE_CHIPS, GUIDES, KB, REASSURE_CONTENT, TOPIC_ORDER } from '../src/features/reassure/content/kb';

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

// AC. parseAuthCallbackUrl — the canonical, NON-throwing classifier the OAuth
// callback handler runs on. Unlike parseAuthRedirect (null for "not an auth
// link"), this returns an explicit 4-case union so an empty / intermediate
// callback is DATA ('empty'), never an exception or a "Missing code" failure.
// These pin the exact behavior the false-error bug needed: ?code= is success,
// #access_token= is handled, a bare callback is 'empty' (wait), ?error= is fatal.
check('AC1. a ?code= callback classifies as "code" with the code (PKCE success path)', () => {
  const r = parseAuthCallbackUrl('lullaby://auth-callback?code=abc123');
  assert.equal(r.type, 'code');
  assert.equal(r.type === 'code' && r.code, 'abc123');
});

check('AC2. a #access_token= callback classifies as "tokens" (implicit compatibility)', () => {
  const r = parseAuthCallbackUrl('lullaby://auth-callback#access_token=AAA&refresh_token=BBB');
  assert.equal(r.type, 'tokens');
  assert.equal(r.type === 'tokens' && r.accessToken, 'AAA');
  assert.equal(r.type === 'tokens' && r.refreshToken, 'BBB');
});

check('AC3. a ?error= callback classifies as "oauth_error" (the only fatal case)', () => {
  const r = parseAuthCallbackUrl(
    'lullaby://auth-callback?error=access_denied&error_code=otp_expired&error_description=denied',
  );
  assert.equal(r.type, 'oauth_error');
  assert.equal(r.type === 'oauth_error' && r.error, 'otp_expired');
  assert.equal(r.type === 'oauth_error' && r.description, 'denied');
});

check('AC4. a bare / credential-less callback is "empty" — NOT fatal, NOT a code', () => {
  // The crux of the false "Missing code in callback" bug: a stale/duplicate bare
  // callback must be a calm wait state, never an error.
  assert.equal(parseAuthCallbackUrl('lullaby://auth-callback').type, 'empty');
  assert.equal(parseAuthCallbackUrl('lullaby://auth-callback?foo=bar').type, 'empty');
  assert.equal(parseAuthCallbackUrl('exp://10.0.0.2:8081/--/auth-callback').type, 'empty');
});

check('AC5. null / undefined / empty input is a calm "empty" (total, never throws)', () => {
  assert.equal(parseAuthCallbackUrl(null).type, 'empty');
  assert.equal(parseAuthCallbackUrl(undefined).type, 'empty');
  assert.equal(parseAuthCallbackUrl('').type, 'empty');
});

check('AC6. classification is deterministic — the SAME url parses identically twice (idempotent)', () => {
  const url = 'lullaby://auth-callback?code=dup-code-xyz';
  assert.deepEqual(parseAuthCallbackUrl(url), parseAuthCallbackUrl(url));
});

check('AC7. precedence: a real error wins over a code, and a code wins over tokens', () => {
  // A callback carrying both an error and a code is still fatal (the error wins).
  const errAndCode = parseAuthCallbackUrl('lullaby://auth-callback?error=server_error&code=abc');
  assert.equal(errAndCode.type, 'oauth_error');
  // PKCE is the configured primary, so a code wins over stray fragment tokens.
  const codeAndTokens = parseAuthCallbackUrl(
    'lullaby://auth-callback?code=abc#access_token=AAA&refresh_token=BBB',
  );
  assert.equal(codeAndTokens.type, 'code');
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
  // Isolate the signOut callback body (declaration → the deleteAccount doc
  // comment that immediately follows it). deleteAccount sits between signOut and
  // clearError and DOES legitimately wipe local data on a verified delete — its
  // doc comment even names the wipe helper — so the boundary must stop at that
  // comment, otherwise the guard would read the delete path as a sign-out wipe.
  const start = AUTH_PROVIDER_SRC.indexOf('const signOut = useCallback');
  const end = AUTH_PROVIDER_SRC.indexOf('// Delete account —', start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'could not locate the signOut callback');
  const signOutBody = AUTH_PROVIDER_SRC.slice(start, end);
  assert.ok(signOutBody.includes('supabase.auth.signOut()'), 'signOut must clear the Supabase session');
  for (const forbidden of [
    'clearLocalEventStorage',
    'clearLocalAppDataAfterAccountDeletion', // the delete-account wipe must never run on a plain sign-out
    'removeItem',
    'multiRemove',
    'AsyncStorage',
  ]) {
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
const HANDOFF_CARD_SRC = readFileSync(
  new URL('../src/components/HandoffCard.tsx', import.meta.url),
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
  assert.ok(
    ACCOUNT_ENTRY_SRC.includes('Accounts are not set up in this build yet'),
    'unconfigured account entry must plainly say accounts are unavailable in this build',
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

check('AE8. public account entry copy is truthful for local-only Shape A', () => {
  for (const honest of ['Saved on this device', 'Optional account', 'Privacy-first']) {
    assert.ok(ACCOUNT_ENTRY_SRC.includes(honest), `account entry has honest chip: ${honest}`);
  }
  for (const [name, src] of [
    ['AccountEntryScreen', ACCOUNT_ENTRY_SRC],
    ['AccountSheet', ACCOUNT_SHEET_SRC],
    ['AuthScreen', readFileSync(new URL('../src/components/auth/AuthScreen.tsx', import.meta.url), 'utf8')],
    ['InviteCaregiverSheet', readFileSync(new URL('../src/components/auth/InviteCaregiverSheet.tsx', import.meta.url), 'utf8')],
    ['Settings', readFileSync(new URL('../src/app/settings.tsx', import.meta.url), 'utf8')],
  ] as const) {
    for (const stale of [
      '<ValueChip label="Backup" />',
      '<ValueChip label="Sync" />',
      '<ValueChip label="Caregiver sharing" />',
      'back up your baby',
      'pick up on another device',
      'Back up and sync your logs',
      'Account backup and sync turn on',
      'Your night log is shared with your caregivers on this baby',
      'so you both keep the same night log',
    ]) {
      assert.ok(!src.includes(stale), `${name} must not advertise unavailable account/sync/sharing copy`);
    }
  }
});

check('AE9. Tonight handoff copy is local-only and caregiver invites are inactive for Shape A', () => {
  assert.ok(
    HANDOFF_CARD_SRC.includes('Tonight’s log is saved on this device.'),
    'HandoffCard must say the log is saved on this device',
  );
  assert.ok(HANDOFF_CARD_SRC.includes('Updated just now.'), 'HandoffCard must use local update copy');
  for (const stale of [
    'Syncing…',
    'Synced just now',
    'shared with your caregivers',
    'stay in sync',
    'Both caregivers are ready',
  ]) {
    assert.ok(!HANDOFF_CARD_SRC.includes(stale), `HandoffCard must not render stale copy: ${stale}`);
  }

  const settingsSrc = readFileSync(new URL('../src/app/settings.tsx', import.meta.url), 'utf8');
  for (const [name, src] of [
    ['AccountSheet', ACCOUNT_SHEET_SRC],
    ['Settings', settingsSrc],
  ] as const) {
    assert.ok(src.includes('Caregiver invites'), `${name} keeps a future-facing invite row`);
    assert.ok(src.includes('Coming later. This build keeps logs on this device.'), `${name} says invite is later`);
    assert.ok(!src.includes('<InviteCaregiverSheet'), `${name} must not mount the active invite sheet`);
    assert.ok(!src.includes('setInviteOpen'), `${name} must not open the active invite flow`);
  }
});

// OC. OAuth / auth deep-link callback route. Supabase redirects Google sign-in
// (and email links) back to lullaby://auth-callback; without a matching route
// Expo Router showed "Unmatched Route". The fix is a real screen at
// src/app/{AUTH_CALLBACK_PATH}.tsx that completes the session exchange via the
// shared helpers. The route is an RN screen the pure runner can't import, so its
// wiring + data-safety are covered by source scans (GP/AE-style).
let AUTH_CALLBACK_SRC = '';
try {
  AUTH_CALLBACK_SRC = readFileSync(
    new URL(`../src/app/${AUTH_CALLBACK_PATH}.tsx`, import.meta.url),
    'utf8',
  );
} catch {
  AUTH_CALLBACK_SRC = '';
}
const SUPABASE_SRC = readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8');
const AUTH_LINKING_SRC = readFileSync(new URL('../src/lib/authLinking.ts', import.meta.url), 'utf8');
const AUTH_GATE_SRC = readFileSync(new URL('../src/components/auth/AuthGate.tsx', import.meta.url), 'utf8');
const AUTH_LOGGER_SRC = readFileSync(new URL('../src/lib/authLogger.ts', import.meta.url), 'utf8');

check('OC1. an Expo Router screen exists at the auth-callback path (no more Unmatched Route)', () => {
  // The file name maps lullaby://auth-callback → app/auth-callback.tsx, so the
  // redirect resolves to a real route instead of the built-in Unmatched Route.
  assert.equal(AUTH_CALLBACK_PATH, 'auth-callback');
  assert.ok(AUTH_CALLBACK_SRC.length > 0, `src/app/${AUTH_CALLBACK_PATH}.tsx must exist`);
  assert.ok(/export default/.test(AUTH_CALLBACK_SRC), 'the route must default-export a screen component');
});

check('OC2. the callback route completes the Supabase exchange via the shared helpers', () => {
  assert.ok(AUTH_CALLBACK_SRC.includes('parseAuthCallbackUrl'), 'route classifies the incoming deep link');
  assert.ok(AUTH_CALLBACK_SRC.includes('exchangeAuthCallback'), 'route runs the shared, idempotent exchange');
  assert.ok(
    AUTH_CALLBACK_SRC.includes('Finishing sign-in'),
    'route shows a calm "Finishing sign-in…" state while processing',
  );
  assert.ok(/router\.replace\(/.test(AUTH_CALLBACK_SRC), 'route navigates into the app on completion');
});

check('OC3. a Google-style callback URL carries credentials the route can exchange', () => {
  // PKCE: code in the query.
  const byCode = parseAuthRedirect(`lullaby://${AUTH_CALLBACK_PATH}?code=abc123`);
  assert.ok(byCode != null && byCode.code === 'abc123');
  // Implicit: tokens in the fragment (the parser reads both query + fragment).
  const byToken = parseAuthRedirect(
    `lullaby://${AUTH_CALLBACK_PATH}#access_token=AAA&refresh_token=BBB`,
  );
  assert.ok(byToken != null && byToken.accessToken === 'AAA' && byToken.refreshToken === 'BBB');
  // A bare callback with no credentials is not an auth redirect → route waits/errors.
  assert.equal(parseAuthRedirect(`lullaby://${AUTH_CALLBACK_PATH}`), null);
});

check('OC4. the callback route never erases local baby/log data', () => {
  for (const forbidden of [
    'AsyncStorage',
    'multiRemove',
    'clearLocalEventStorage',
    '.clear(',
    'LOCAL_BABY_STORAGE_KEY',
    'LOCAL_EVENTS_STORAGE_KEY',
    'LOGGING_STORAGE_KEY',
  ]) {
    assert.ok(!AUTH_CALLBACK_SRC.includes(forbidden), `auth-callback must not reference ${forbidden}`);
  }
});

check('OC5. the Supabase client uses the PKCE flow (?code= redirect survives Android deep links)', () => {
  // Implicit flow returns tokens in the URL fragment, which Android strips from a
  // custom-scheme deep link → callback arrives credential-less → endless loading.
  assert.ok(/flowType:\s*'pkce'/.test(SUPABASE_SRC), "supabase client must set auth.flowType: 'pkce'");
  // The exchange path the PKCE code needs must still be present in the helpers.
  assert.ok(
    AUTH_LINKING_SRC.includes('exchangeCodeForSession'),
    'completeAuthRedirect must exchange a PKCE code for a session',
  );
});

check('OC6. the callback route cannot hang forever (hard timeout → recoverable error)', () => {
  assert.ok(/CALLBACK_TIMEOUT_MS/.test(AUTH_CALLBACK_SRC), 'route must define a callback timeout');
  assert.ok(/setTimeout\(/.test(AUTH_CALLBACK_SRC), 'route must arm the timeout');
  assert.ok(/clearTimeout\(/.test(AUTH_CALLBACK_SRC), 'route must clear the timeout on unmount');
  // A timeout/failed exchange must land on the calm error surface, not the spinner.
  assert.ok(AUTH_CALLBACK_SRC.includes("setPhase('error')"), 'route must reach a recoverable error state');
  // The error surface must offer a recoverable retry AND a no-account escape hatch
  // (both route back to the account-entry surface — never a dead end).
  assert.ok(/Try again/.test(AUTH_CALLBACK_SRC), 'the error surface must offer a retry');
  assert.ok(
    /Continue without an account/.test(AUTH_CALLBACK_SRC),
    'the error surface must keep a local-first escape hatch',
  );
});

check('OC7. the OAuth round-trip times out its non-interactive steps (no stuck spinner)', () => {
  // The init (authorize URL) + exchange steps are raced against a timeout; the
  // interactive browser wait is intentionally NOT timed out.
  assert.ok(/OAUTH_STEP_TIMEOUT_MS/.test(AUTH_LINKING_SRC), 'startGoogleOAuth must define a step timeout');
  assert.ok(
    (AUTH_LINKING_SRC.match(/Promise\.race\(/g) ?? []).length >= 2,
    'both the init and exchange steps must be raced against the timeout',
  );
  assert.ok(
    /oauth_init_timeout/.test(AUTH_LINKING_SRC) && /oauth_exchange_timeout/.test(AUTH_LINKING_SRC),
    'a timed-out init/exchange must resolve to a calm error outcome',
  );
});

check('OC8. an error redirect is handled (calm error), never an infinite wait', () => {
  // Supabase can bounce back with ?error=…; the classifier flags it 'oauth_error'
  // and the route short-circuits to a recoverable error rather than spinning.
  const errored = parseAuthCallbackUrl(
    `lullaby://${AUTH_CALLBACK_PATH}?error=access_denied&error_description=denied`,
  );
  assert.equal(errored.type, 'oauth_error');
  assert.ok(
    AUTH_CALLBACK_SRC.includes("cb.type === 'oauth_error'"),
    'the route must short-circuit an oauth_error callback to the calm error state',
  );
});

check('OC9. AuthProvider does not also exchange the deep link (single exchanger — no PKCE race)', () => {
  // The /auth-callback route is the SOLE owner of the session exchange. A second
  // exchanger here would consume the single-use PKCE code first and make the route
  // fail — the "Could not finish signing in" race. Guard so it can't creep back.
  // Scan for the CALL forms (name + `(`) so an accurate prose mention in a doc
  // comment (e.g. describing what startGoogleOAuth does internally) is not flagged.
  assert.ok(
    !/subscribeToAuthRedirects\s*\(/.test(AUTH_PROVIDER_SRC),
    'AuthProvider must not re-subscribe to auth redirects (route is the single handler)',
  );
  assert.ok(
    !/completeAuthRedirect\s*\(/.test(AUTH_PROVIDER_SRC),
    'AuthProvider must not run a second code exchange',
  );
});

check('OC10. an EMPTY / credential-less callback is non-fatal — it waits, never "Missing code"', () => {
  assert.ok(AUTH_CALLBACK_SRC.includes('devReason'), 'route must track a dev-only failure reason');
  assert.ok(/__DEV__/.test(AUTH_CALLBACK_SRC), 'the reason must be gated to __DEV__ (calm copy in production)');
  // The regression: the old code called finish(false, 'Missing code in callback')
  // the instant a bare/stale callback arrived, flashing the fatal error during a
  // SUCCESSFUL sign-in. That fatal string — and any fail()/finish() on the empty
  // branch — must be gone.
  assert.ok(
    !AUTH_CALLBACK_SRC.includes('Missing code in callback'),
    'a credential-less callback must NOT be treated as a fatal "Missing code" error',
  );
  // The 'empty' branch must exist and must NOT fail — it returns to keep waiting.
  assert.ok(AUTH_CALLBACK_SRC.includes("cb.type === 'empty'"), 'route must branch on an empty callback');
  const emptyIdx = AUTH_CALLBACK_SRC.indexOf("cb.type === 'empty'");
  const emptyBranch = AUTH_CALLBACK_SRC.slice(emptyIdx, emptyIdx + 320);
  assert.ok(
    !/\bfail\(/.test(emptyBranch),
    'the empty-callback branch must not call fail() — a later session must still win',
  );
});

check('OC11. Google sign-in clears its loading state on failure (no stuck spinner)', () => {
  const start = AUTH_PROVIDER_SRC.indexOf('const signInWithGoogle = useCallback');
  const end = AUTH_PROVIDER_SRC.indexOf('const resetPassword = useCallback', start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'could not locate the signInWithGoogle callback');
  const body = AUTH_PROVIDER_SRC.slice(start, end);
  assert.ok(/finally\s*{[\s\S]*setBusy\(false\)/.test(body), 'signInWithGoogle must clear busy in finally');
});

check('OC12. an authenticated user with no baby routes DIRECTLY to baby setup — the onboarding intro never replays after sign-in', () => {
  const start = AUTH_GATE_SRC.indexOf("case 'needs-setup':");
  const end = AUTH_GATE_SRC.indexOf("case 'ready':", start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'AuthGate must handle needs-setup before ready');
  const seg = AUTH_GATE_SRC.slice(start, end);
  assert.ok(seg.includes('BabySetupScreen'), 'needs-setup must render the baby setup form');
  // Product-correct invariant (this was the "returns to onboarding" bug): a signed-in
  // user must NEVER be routed back into the onboarding intro — not even under the dev
  // force flag. The intro is a pre-account surface only (see OC14 / FO2).
  assert.ok(!seg.includes('OnboardingGate'), 'needs-setup must NOT wrap the onboarding intro (no OnboardingGate)');
  assert.ok(
    !seg.includes('forceOnboarding'),
    'needs-setup must not consult the force flag (authenticated states never replay onboarding)',
  );
});

check('OC13. an authenticated user with a baby goes straight to the app — the onboarding intro never replays after sign-in', () => {
  const start = AUTH_GATE_SRC.indexOf("case 'ready':");
  const end = AUTH_GATE_SRC.indexOf("case 'loading':", start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'AuthGate must handle ready before loading');
  const seg = AUTH_GATE_SRC.slice(start, end);
  assert.ok(seg.includes('{children}'), 'ready must render the app');
  // ready always renders the main app — never the onboarding intro, under any flag.
  assert.ok(!seg.includes('OnboardingGate'), 'ready must NOT wrap the onboarding intro (no OnboardingGate)');
  assert.ok(
    !seg.includes('forceOnboarding'),
    'ready must not consult the force flag (authenticated states never replay onboarding)',
  );
});

// AC. Analytics ↔ AuthProvider require cycle broken (this task). `analytics.ts` is
// a pure leaf service; the identity-binding hook now lives in `useAnalytics.ts`
// (the single seam that imports both). analytics.ts / AuthProvider import
// react-native and can't load in this pure runner, so the cycle + privacy contract
// are covered by source scans (GP/OC-style).
const ANALYTICS_SRC = readFileSync(new URL('../src/lib/analytics.ts', import.meta.url), 'utf8');
const USE_ANALYTICS_SRC = readFileSync(new URL('../src/lib/useAnalytics.ts', import.meta.url), 'utf8');

check('AN1. analytics.ts is a leaf — it does not import AuthProvider (the cycle edge is gone)', () => {
  assert.ok(
    !/from\s*['"]@\/state\/AuthProvider['"]/.test(ANALYTICS_SRC),
    'src/lib/analytics.ts must NOT import from @/state/AuthProvider',
  );
  assert.ok(!/\buseAuth\s*\(/.test(ANALYTICS_SRC), 'analytics.ts must not call useAuth');
  // The React hook moved to the seam, so no hook export remains in the leaf.
  assert.ok(
    !/export function useAnalytics/.test(ANALYTICS_SRC),
    'useAnalytics must live in useAnalytics.ts, not in the analytics leaf',
  );
});

check('AN2. AuthProvider/analytics no longer form the known cycle (only the allowed leaf→consumer edge remains)', () => {
  // The allowed direction still holds: AuthProvider imports trackEvent from the leaf.
  assert.ok(
    /import\s*\{[^}]*\btrackEvent\b[^}]*\}\s*from\s*['"]@\/lib\/analytics['"]/.test(AUTH_PROVIDER_SRC),
    'AuthProvider should import trackEvent from the analytics leaf',
  );
  // The reverse edge (leaf → AuthProvider) must be absent, so the pair can't cycle.
  const leafImportsAuth = /from\s*['"]@\/state\/AuthProvider['"]/.test(ANALYTICS_SRC);
  const authImportsLeaf = /from\s*['"]@\/lib\/analytics['"]/.test(AUTH_PROVIDER_SRC);
  assert.ok(
    !(leafImportsAuth && authImportsLeaf),
    'analytics.ts ↔ AuthProvider.tsx must not import each other (require cycle)',
  );
});

check('AN3. useAnalytics is the seam — it depends on BOTH the leaf and AuthProvider', () => {
  assert.ok(/from\s*['"]@\/lib\/analytics['"]/.test(USE_ANALYTICS_SRC), 'useAnalytics.ts imports the analytics leaf');
  assert.ok(/from\s*['"]@\/state\/AuthProvider['"]/.test(USE_ANALYTICS_SRC), 'useAnalytics.ts imports AuthProvider');
  assert.ok(/export function useAnalytics/.test(USE_ANALYTICS_SRC), 'useAnalytics.ts exports the hook');
  assert.ok(/\btrackEvent\b/.test(USE_ANALYTICS_SRC), 'the seam forwards to the leaf trackEvent');
});

check('AN4. analytics stays privacy-safe: fire-and-forget insert, never a client SELECT from analytics_events', () => {
  assert.ok(ANALYTICS_SRC.includes("analytics_events"), 'analytics must still target the analytics_events table');
  assert.ok(!/\.select\s*\(/.test(ANALYTICS_SRC), 'analytics must never .select() (no client read-back from analytics_events)');
  assert.ok(/void\s+supabase/.test(ANALYTICS_SRC), 'the insert must stay fire-and-forget (void, not awaited)');
});

// FO. EXPO_PUBLIC_FORCE_ONBOARDING is a dev/QA override for the PRE-ACCOUNT intro
// ONLY. The pure force resolver is covered by G4-G6; these guard that the flag can
// replay onboarding solely in the no-session flows (via OnboardingGate) and can
// NEVER wrap an authenticated state — so a Google sign-in can't loop back into the
// intro (the real-device "returns to onboarding again" bug) — plus the
// non-destructive contract (AuthGate clears/removes nothing, never signs out) and
// the data-safety of OnboardingScreen while a session exists.
check('FO1. FORCE_ONBOARDING=true forces onboarding regardless of completion; off/unset preserves the prior decision (pure)', () => {
  // true → always 'needed', even when onboarding was already completed.
  assert.equal(resolveOnboardingGateState(true, { rawFlag: 'true', isDev: true }), 'needed');
  // false → completion decides, unchanged (complete stays complete; incomplete stays needed).
  assert.equal(resolveOnboardingGateState(true, { rawFlag: 'false', isDev: true }), 'complete');
  assert.equal(resolveOnboardingGateState(false, { rawFlag: 'false', isDev: true }), 'needed');
  // production never force-onboards, even with the flag literally set to 'true'.
  assert.equal(isForceOnboardingEnabled({ rawFlag: 'true', isDev: false }), false);
});

check('FO2. the force flag NEVER wraps an authenticated state in OnboardingGate (the intro is pre-account only)', () => {
  // The onboarding intro (which honors the force flag via resolveOnboardingGateState)
  // is reachable ONLY from the no-session gates (signed-out / local-only, see OC14).
  // Every authenticated state — authenticating, postAuthSync, needs-setup, ready —
  // must stay OUT of OnboardingGate, so a signed-in user can never replay the intro.
  const needsSetup = AUTH_GATE_SRC.slice(
    AUTH_GATE_SRC.indexOf("case 'needs-setup':"),
    AUTH_GATE_SRC.indexOf("case 'ready':"),
  );
  const ready = AUTH_GATE_SRC.slice(
    AUTH_GATE_SRC.indexOf("case 'ready':"),
    AUTH_GATE_SRC.indexOf("case 'loading':"),
  );
  assert.ok(!needsSetup.includes('OnboardingGate'), 'needs-setup must not wrap the onboarding intro');
  assert.ok(!ready.includes('OnboardingGate'), 'ready must not wrap the onboarding intro');
  // Stronger: OnboardingGate may appear ONLY in the no-session cases. The whole
  // authenticated region (needs-setup onward: authenticating, postAuthSync, loading
  // included) must be free of it, so no future edit can re-introduce the replay loop.
  const firstNoSession = AUTH_GATE_SRC.indexOf("case 'local-only':");
  const authenticatedRegionStart = AUTH_GATE_SRC.indexOf("case 'needs-setup':");
  assert.ok(
    firstNoSession !== -1 && authenticatedRegionStart > firstNoSession,
    'the no-session cases must precede the authenticated cases',
  );
  const authenticatedRegion = AUTH_GATE_SRC.slice(authenticatedRegionStart);
  assert.ok(
    !authenticatedRegion.includes('OnboardingGate'),
    'no authenticated case (needs-setup/ready/authenticating/postAuthSync/loading) may reference OnboardingGate',
  );
});

check('FO3. the force override is non-destructive — AuthGate never clears data, removes keys, or signs out', () => {
  for (const forbidden of [
    'AsyncStorage',
    'multiRemove',
    'removeItem',
    '.clear(',
    'signOut',
    'clearLocalEventStorage',
    'LOCAL_BABY_STORAGE_KEY',
    'LOCAL_EVENTS_STORAGE_KEY',
    'LOGGING_STORAGE_KEY',
  ]) {
    assert.ok(
      !AUTH_GATE_SRC.includes(forbidden),
      `AuthGate must not reference ${forbidden} (the QA override must not delete data or sign out)`,
    );
  }
});

const ONBOARDING_SCREEN_SRC = readFileSync(
  new URL('../src/components/onboarding/OnboardingScreen.tsx', import.meta.url),
  'utf8',
);

check('FO4. OnboardingScreen never mints a local baby while authenticated, and warns if it mounts with a session', () => {
  // The creating step must not overwrite the account identity / clear local events
  // when a Supabase session exists — createLocalBaby is gated behind `if (!session)`.
  const createIdx = ONBOARDING_SCREEN_SRC.indexOf('createLocalBaby(pendingInputRef.current)');
  assert.ok(createIdx !== -1, 'OnboardingScreen must still create the local baby in the no-session flow');
  const guardIdx = ONBOARDING_SCREEN_SRC.lastIndexOf('if (!session)', createIdx);
  assert.ok(
    guardIdx !== -1 && guardIdx < createIdx,
    'createLocalBaby must sit inside the `if (!session)` guard (no account overwrite while authenticated)',
  );
  // Defensive tripwire: a dev-only warning fires if OnboardingScreen ever mounts
  // while a session exists (it must only ever mount in a pre-account, no-session flow).
  assert.ok(
    /authWarn\(/.test(ONBOARDING_SCREEN_SRC),
    'OnboardingScreen must authWarn when it mounts with an active session',
  );
});

check('OC14. no-session states still run onboarding first (intro→account entry; local-first preserved)', () => {
  const so = AUTH_GATE_SRC.slice(
    AUTH_GATE_SRC.indexOf("case 'signed-out':"),
    AUTH_GATE_SRC.indexOf("case 'needs-setup':"),
  );
  assert.ok(
    so.includes('OnboardingGate') && so.includes('AccountEntryScreen'),
    'signed-out must show onboarding then the account-entry surface',
  );
  const lo = AUTH_GATE_SRC.slice(
    AUTH_GATE_SRC.indexOf("case 'local-only':"),
    AUTH_GATE_SRC.indexOf("case 'signed-out':"),
  );
  assert.ok(lo.includes('OnboardingGate'), 'local-only must run onboarding (creates the local baby) before the app');
});

check('OC15. the callback waits for the session (onAuthStateChange + poll) before declaring failure', () => {
  // The fix for the false "Could not finish signing in" after a successful auth:
  // detect success by the SESSION appearing (from this route or startGoogleOAuth),
  // not by a single exchange call's result.
  assert.ok(
    AUTH_CALLBACK_SRC.includes('onAuthStateChange'),
    'route must watch for a session landing from any exchanger',
  );
  assert.ok(/for \(let i = 0;/.test(AUTH_CALLBACK_SRC), 'route must poll for the session within the grace window');
  assert.ok(AUTH_CALLBACK_SRC.includes('unsubscribe'), 'route must clean up the auth subscription on unmount');
});

check('OC18. the PKCE code is exchanged exactly once — a duplicate callback is idempotent', () => {
  // Both the in-browser startGoogleOAuth path AND the /auth-callback route can fire
  // for ONE Android sign-in. They must share a single, keyed, in-flight-deduped
  // exchanger so the single-use code is never double-spent into a false error.
  assert.ok(
    AUTH_LINKING_SRC.includes('exchangeAuthCallback'),
    'authLinking must expose the shared exchanger',
  );
  assert.ok(
    /inFlightExchanges\s*=\s*new Map/.test(AUTH_LINKING_SRC),
    'exchanges must be deduped by an in-flight map keyed on the single-use credential',
  );
  assert.ok(
    AUTH_CALLBACK_SRC.includes('exchangeAuthCallback'),
    'the callback route must exchange through the shared deduped helper',
  );
  assert.ok(
    AUTH_LINKING_SRC.includes('exchangeAuthCallback(client, cb)'),
    'startGoogleOAuth must exchange through the same shared deduped helper',
  );
});

check('OC19. a resolved session clears any transient auth error (no stale error behind the app)', () => {
  // evaluate() runs on every auth change; when a session is present it must wipe a
  // leftover errorMessage so a retried/failed earlier attempt cannot linger after
  // sign-in actually lands.
  const start = AUTH_PROVIDER_SRC.indexOf('const evaluate = useCallback');
  const end = AUTH_PROVIDER_SRC.indexOf('const hydrateLocalIdentity', start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'could not locate the evaluate callback');
  const body = AUTH_PROVIDER_SRC.slice(start, end);
  // The clear must sit AFTER the no-session early return, i.e. only on the
  // session-present path (clearing on sign-OUT would erase a real sign-in error).
  const guardIdx = body.indexOf("setStatus('signed-out')");
  const clearIdx = body.indexOf('setErrorMessage(null)');
  assert.ok(clearIdx !== -1, 'evaluate must clear errorMessage on a resolved session');
  assert.ok(clearIdx > guardIdx, 'the error clear must be on the session-present path, not sign-out');
});

check('OC20. a cancelled/dismissed Google sign-in is a calm no-op (no error, no data loss)', () => {
  // startGoogleOAuth returns 'canceled' for any non-success browser result …
  assert.ok(
    /result\.type !== 'success'\) return \{ status: 'canceled' \}/.test(AUTH_LINKING_SRC),
    'a dismissed browser must resolve to a calm canceled outcome',
  );
  // … and signInWithGoogle only surfaces an error for the 'error' outcome — never
  // for 'canceled' — so backing out returns to the auth choice with no scary note.
  const start = AUTH_PROVIDER_SRC.indexOf('const signInWithGoogle = useCallback');
  const end = AUTH_PROVIDER_SRC.indexOf('const resetPassword = useCallback', start);
  const body = AUTH_PROVIDER_SRC.slice(start, end);
  assert.ok(
    body.includes("outcome.status === 'error'"),
    'signInWithGoogle must only show an error for the error outcome (canceled stays silent)',
  );
  // There must be NO canceled-outcome conditional at all — a dismissed browser
  // simply falls through (no error set, no routing), so local data is untouched.
  assert.ok(
    !/outcome\.status === 'canceled'/.test(body),
    'a canceled outcome must have no error branch (it is a silent fall-through)',
  );
});

check('OC21. a blank baby name is saved as a calm default — never the demo "Mia"', () => {
  // Requirement: signing in / onboarding without typing a name must NOT persist a
  // placeholder or the seed demo baby. createLocalBaby maps blank → 'Your baby'.
  const blank = createLocalBaby({}, NOW);
  assert.equal(blank.baby.name, 'Your baby');
  assert.notEqual(blank.baby.name, 'Mia');
  const blankName = createLocalBaby({ babyName: '   ' }, NOW);
  assert.equal(blankName.baby.name, 'Your baby', 'a whitespace-only name still falls back to the default');
  // A real typed name is preserved verbatim (the placeholder logic never overrides it).
  assert.equal(createLocalBaby({ babyName: 'Noah' }, NOW).baby.name, 'Noah');
});

// LG. Auth logging policy. Expected auth-callback states (empty/duplicate
// callback, waiting for the redirect/session, route replaced) are NORMAL, not
// problems — they must NEVER reach React Native's LogBox (which only surfaces
// console.warn / console.error), or a scary warning drawer pops during a healthy
// sign-in. The authLogger leaf encodes the severity policy; these guard it and
// the call sites so a future edit can't reintroduce a warn for a normal state.
// (authLogger references the `__DEV__` global at module load, so it can't be
// imported under tsx/node — the policy is covered by source scans, GP-style.)
function sliceFn(src: string, name: string, nextName: string): string {
  const start = src.indexOf(`export function ${name}`);
  const end = src.indexOf(`export function ${nextName}`, start);
  assert.ok(start !== -1, `authLogger must export ${name}`);
  return src.slice(start, end === -1 ? undefined : end);
}

check('LG1. normal auth diagnostics are silent by default + LogBox-safe (debug/log, opt-in)', () => {
  // Gated behind an explicit dev-only opt-in, so default dev runs print nothing.
  assert.ok(
    /AUTH_DEBUG_ENABLED\s*=\s*__DEV__\s*&&\s*process\.env\.EXPO_PUBLIC_AUTH_DEBUG === '1'/.test(
      AUTH_LOGGER_SRC,
    ),
    'normal diagnostics must gate on __DEV__ && EXPO_PUBLIC_AUTH_DEBUG === "1"',
  );
  // authDebug / authInfo must use console.debug / console.log — sinks LogBox does
  // NOT intercept — and must early-return when the opt-in is off.
  const debugBody = sliceFn(AUTH_LOGGER_SRC, 'authDebug', 'authInfo');
  assert.ok(debugBody.includes('if (!AUTH_DEBUG_ENABLED) return;'), 'authDebug must be silent by default');
  assert.ok(debugBody.includes('console.debug'), 'authDebug must use console.debug (LogBox-safe)');
  assert.ok(!/console\.(warn|error)/.test(debugBody), 'authDebug must NOT use console.warn/console.error');
  const infoBody = sliceFn(AUTH_LOGGER_SRC, 'authInfo', 'authWarn');
  assert.ok(infoBody.includes('if (!AUTH_DEBUG_ENABLED) return;'), 'authInfo must be silent by default');
  assert.ok(infoBody.includes('console.log'), 'authInfo must use console.log (LogBox-safe)');
  assert.ok(!/console\.(warn|error)/.test(infoBody), 'authInfo must NOT use console.warn/console.error');
});

check('LG2. authWarn is dev-only console.warn; authError always uses console.error', () => {
  const warnBody = sliceFn(AUTH_LOGGER_SRC, 'authWarn', 'authError');
  assert.ok(warnBody.includes('if (!__DEV__) return;'), 'authWarn must be dev-only (never warns in production)');
  assert.ok(warnBody.includes('console.warn'), 'authWarn must use console.warn');
  assert.ok(!warnBody.includes('console.error'), 'authWarn must not escalate to console.error');
  const errorBody = AUTH_LOGGER_SRC.slice(AUTH_LOGGER_SRC.indexOf('export function authError'));
  assert.ok(errorBody.includes('console.error'), 'authError must use console.error');
  assert.ok(!/if \(!__DEV__\) return;/.test(errorBody), 'authError must log in production too (no __DEV__ gate)');
});

check('LG3. the callback route never uses a direct console.* — normal states → authDebug, failures → authError', () => {
  for (const sink of ['console.warn', 'console.error', 'console.log', 'console.debug']) {
    assert.ok(!AUTH_CALLBACK_SRC.includes(sink), `auth-callback must route logs through authLogger, not ${sink}`);
  }
  assert.ok(AUTH_CALLBACK_SRC.includes('authDebug('), 'normal states must use authDebug');
  assert.ok(AUTH_CALLBACK_SRC.includes('authError('), 'terminal failures must use authError');
});

check('LG4. the EMPTY / duplicate callback path logs via authDebug — never a warn/error (no LogBox drawer)', () => {
  // The exact regression: the empty/waiting state used to console.warn → LogBox.
  const emptyIdx = AUTH_CALLBACK_SRC.indexOf("cb.type === 'empty'");
  assert.ok(emptyIdx !== -1, 'route must branch on an empty callback');
  // Bound the slice to the branch's own `return;` so it can't read the next branch.
  const emptyBranch = AUTH_CALLBACK_SRC.slice(emptyIdx, AUTH_CALLBACK_SRC.indexOf('return;', emptyIdx));
  assert.ok(emptyBranch.includes('authDebug('), 'the empty-callback branch must log via authDebug');
  assert.ok(
    !/authWarn\(|authError\(|console\./.test(emptyBranch),
    'the empty-callback branch must not warn/error — it is a normal waiting state',
  );
  // The "received type=…" breadcrumb is also a normal state → authDebug, not warn.
  assert.ok(
    /authDebug\(`auth-callback: received type=/.test(AUTH_CALLBACK_SRC),
    'the received-type breadcrumb must be an authDebug, not a warn',
  );
});

check('LG5. a real OAuth error still routes through the error path (authError + friendly UI)', () => {
  // oauth_error → fail(); fail() must log via authError (a real, surfaced failure)
  // AND flip to the recoverable error UI — diagnostics quieting must not weaken it.
  assert.ok(AUTH_CALLBACK_SRC.includes("cb.type === 'oauth_error'"), 'route must detect a provider error');
  const failIdx = AUTH_CALLBACK_SRC.indexOf('const fail =');
  const failBody = AUTH_CALLBACK_SRC.slice(failIdx, AUTH_CALLBACK_SRC.indexOf('};', failIdx));
  assert.ok(failBody.includes('authError('), 'fail() must log a real failure via authError');
  assert.ok(failBody.includes("setPhase('error')"), 'fail() must still show the recoverable error UI');
});

check('LG6. authLinking + AuthProvider route auth logs through the logger (no direct auth console.warn)', () => {
  for (const sink of ['console.warn', 'console.error', 'console.log', 'console.debug']) {
    assert.ok(!AUTH_LINKING_SRC.includes(sink), `authLinking must route logs through authLogger, not ${sink}`);
  }
  assert.ok(AUTH_LINKING_SRC.includes('authWarn('), 'authLinking must warn via authWarn (dev-only, recoverable)');
  // AuthProvider's only auth log (the Google error outcome) must be authWarn, not console.warn.
  assert.ok(!/console\.warn/.test(AUTH_PROVIDER_SRC), 'AuthProvider must not console.warn (use authWarn)');
  const gStart = AUTH_PROVIDER_SRC.indexOf('const signInWithGoogle = useCallback');
  const gEnd = AUTH_PROVIDER_SRC.indexOf('const resetPassword = useCallback', gStart);
  assert.ok(AUTH_PROVIDER_SRC.slice(gStart, gEnd).includes('authWarn('), 'signInWithGoogle must warn via authWarn');
});

check('LG7. no auth log interpolates a URL / code / token (secrets never reach a log sink)', () => {
  // Guard the privacy rule: a logger call must not splice in the raw deep-link URL
  // or any credential. authLogger also ships sanitizeAuthUrl for when a URL must
  // be logged (strips the query + fragment where ?code= / #access_token= live).
  const authSources = `${AUTH_CALLBACK_SRC}\n${AUTH_LINKING_SRC}`;
  const leak =
    /auth(Debug|Info|Warn|Error)\([^)]*\$\{\s*(url|incoming|accessToken|refreshToken|cb\.code|result\.url|redirect\.code)/;
  assert.ok(!leak.test(authSources), 'an auth log must not interpolate a URL / code / token');
  assert.ok(AUTH_LOGGER_SRC.includes('export function sanitizeAuthUrl'), 'authLogger must offer a URL sanitizer');
  assert.ok(/[?#]/.test(AUTH_LOGGER_SRC) && /sanitizeAuthUrl/.test(AUTH_LOGGER_SRC), 'sanitizer must strip query/fragment');
});

check('OC16. a WebCrypto polyfill backs PKCE so GoTrue uses sha256, not plain (no warning)', () => {
  const polyfill = readFileSync(new URL('../src/lib/cryptoPolyfill.ts', import.meta.url), 'utf8');
  // The client must load the polyfill before createClient wires up PKCE auth.
  assert.ok(SUPABASE_SRC.includes('./cryptoPolyfill'), 'supabase.ts must import the crypto polyfill');
  assert.ok(/import '\.\/cryptoPolyfill'/.test(SUPABASE_SRC), 'the polyfill must be a side-effect import');
  // The polyfill must provide BOTH pieces GoTrue PKCE needs.
  assert.ok(/subtle/.test(polyfill) && /digest/.test(polyfill), 'polyfill must provide crypto.subtle.digest');
  assert.ok(polyfill.includes('getRandomValues'), 'polyfill must provide crypto.getRandomValues for the verifier');
  assert.ok(polyfill.includes('SHA256') || polyfill.includes('SHA-256'), 'digest must be SHA-256');
  // PURE-JS only: a native module (expo-crypto / react-native-get-random-values)
  // would crash an already-built dev client ("Cannot find native module …").
  assert.ok(!/from ['"]expo-crypto['"]/.test(polyfill), 'polyfill must not import a native crypto module');
  assert.ok(
    !/from ['"]react-native-get-random-values['"]/.test(polyfill),
    'polyfill must stay pure-JS (no native RNG module)',
  );
});

check('OC17. the pure-JS SHA-256 matches the NIST test vectors (correct PKCE S256 challenge)', () => {
  const enc = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));
  const hex = (bytes: Uint8Array) =>
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  assert.equal(hex(sha256Bytes(enc(''))), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(hex(sha256Bytes(enc('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(
    hex(sha256Bytes(enc('The quick brown fox jumps over the lazy dog'))),
    'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
  );
  // A multi-block message (> 64 bytes) exercises the padding path used by long verifiers.
  assert.equal(
    hex(sha256Bytes(enc('a'.repeat(100)))),
    '2816597888e4a0d3a36b82b83316ab32680eb8f00f8cd3b904d681246d285a0e',
  );
});

// V. Canonical logging repository + mapper + compatibility flag shim. These are
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

  const makeActiveSleepAt = (id: string, cid: string, startedAt: number): SleepEvent => ({
    ...careBase({
      id,
      clientEventId: cid,
      type: 'sleep',
      status: 'active',
      occurredAt: iso(startedAt),
      startedAt: iso(startedAt),
      endedAt: null,
      createdAt: iso(startedAt),
      updatedAt: iso(startedAt),
    }),
    type: 'sleep',
    childId: 'baby-mia',
    status: 'active',
    details: { sleepType: 'night' },
  });

  const makeNoteAt = (
    id: string,
    cid: string,
    at: number,
    details: NoteEvent['details'] = { noteType: 'general' },
  ): NoteEvent => ({
    ...careBase({
      id,
      clientEventId: cid,
      type: 'note',
      status: 'completed',
      occurredAt: iso(at),
      startedAt: null,
      endedAt: null,
      createdAt: iso(at),
      updatedAt: iso(at),
    }),
    type: 'note',
    childId: 'baby-mia',
    status: 'completed',
    details,
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

  await checkAsync(
    'IG3. loadLegacyInsightsHistory maps production legacy events so Insights populate (4+ data days)',
    async () => {
      const now = localTime(0, 12);
      const legacyEvent = (
        over: Partial<LogEvent> & Pick<LogEvent, 'id' | 'type' | 'startAt'>,
      ): LogEvent => ({
        babyId: 'baby-mia',
        caregiverId: 'cg-mom',
        endAt: null,
        meta: {},
        createdAt: over.startAt,
        ...over,
      });
      const legacy: LogEvent[] = [
        // 3 feeds today → a feed rhythm is derivable
        legacyEvent({ id: 'lg-f1', type: 'feed', startAt: iso(localTime(0, 6)), meta: { side: 'L' } }),
        legacyEvent({ id: 'lg-f2', type: 'feed', startAt: iso(localTime(0, 9)), meta: { side: 'R' } }),
        legacyEvent({ id: 'lg-f3', type: 'feed', startAt: iso(localTime(0, 12)), meta: { side: 'L' } }),
        // completed sleeps on two earlier days → sleep minutes + distinct data days
        legacyEvent({ id: 'lg-s1', type: 'sleep', startAt: iso(localTime(1, 22)), endAt: iso(localTime(1, 23, 30)) }),
        legacyEvent({ id: 'lg-s2', type: 'sleep', startAt: iso(localTime(2, 1)), endAt: iso(localTime(2, 3)) }),
        // a diaper on a 4th distinct day
        legacyEvent({ id: 'lg-d1', type: 'diaper', startAt: iso(localTime(3, 9)), meta: { kind: 'both' } }),
        // a note maps through the canonical layer and never breaks the view model
        legacyEvent({ id: 'lg-n1', type: 'note', startAt: iso(localTime(0, 7)), meta: { label: 'Fussy' } }),
      ];

      const careEvents = loadLegacyInsightsHistory(legacy);
      assert.equal(careEvents.length, 7);
      assert.ok(careEvents.some((event) => isNoteEvent(event)), 'legacy notes map into canonical note events');

      const vm = buildInsightsViewModel({ events: careEvents, now });
      assert.ok(vm.dataDays >= 4); // feeds(day0), sleeps(day1,2), diaper(day3) = 4 distinct days
      assert.equal(vm.hasEnoughData, true);
      assert.ok(vm.weeklySleep.some((day) => day.minutes > 0)); // sleeps mapped through
      assert.equal(vm.cards[0].id, 'feed-rhythm');
      assert.ok(vm.cards[0].text.includes('rhythm')); // real rhythm card from 3 feeds
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

  await checkAsync('V6. legacyEventToCareEvent maps breast/bottle/sleep/diaper/pump/note', async () => {
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
    assert.ok(note && isNoteEvent(note));
    if (note && isNoteEvent(note)) {
      assert.equal(note.details.noteType, 'general');
      assert.equal(note.details.label, 'Fussy');
    }

    const spitUp = legacyEventToCareEvent({ ...legacySleep, id: 'l-spit', type: 'note', meta: { label: SPITUP_NOTE_LABEL } });
    assert.ok(spitUp && isNoteEvent(spitUp) && spitUp.details.noteType === 'spit_up');

    assert.equal(mapLegacyEvents([legacyBreast, legacySleep, { ...legacySleep, id: 'l-note', type: 'note', meta: {} }]).length, 3);
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

    const note = makeNoteAt('c-note', 'c-note', NOW, {
      noteType: 'spit_up',
      label: 'Spit-up',
      note: 'small amount',
    });
    const noteBack = careEventToLegacyEvent(note);
    assert.equal(noteBack.type, 'note');
    assert.equal(noteBack.meta.label, 'Spit-up');
    assert.equal(noteBack.meta.note, 'small amount');
  });

  await checkAsync('V8. logging snapshot serialize → parse round-trips events + queue; bad input degrades safely', async () => {
    const snapshot = {
      events: [makeDiaper('evt-d1', 'cid-d1'), makeNoteAt('evt-n1', 'cid-n1', NOW, { noteType: 'general' })],
      syncQueue: ['evt-d1', 'evt-n1'],
    };
    const restored = parseLoggingSnapshot(serializeLoggingSnapshot(snapshot));
    assert.ok(restored && restored.events.length === 2);
    assert.ok(restored?.events.some((event) => isNoteEvent(event)), 'stored note survives parse');
    assert.deepEqual(restored?.syncQueue, ['evt-d1', 'evt-n1']);
    assert.equal(parseLoggingSnapshot(null), null);
    assert.equal(parseLoggingSnapshot('not json {'), null);
    // a malformed row is dropped rather than failing the whole load
    const partial = parseLoggingSnapshot(JSON.stringify({ events: [{ id: 'x' }], syncQueue: [] }));
    assert.ok(partial && partial.events.length === 0);
  });

  await checkAsync('V9. loggingV2 compatibility flag is always on and no longer reads Expo env', async () => {
    resetLoggingFlags();
    assert.equal(typeof isLoggingV2Enabled(), 'boolean');
    setLoggingV2Enabled(true);
    assert.equal(isLoggingV2Enabled(), true);
    assert.equal(resolveLoggingFlags().loggingV2, true);
    setLoggingV2Enabled(false);
    assert.equal(isLoggingV2Enabled(), true);
    assert.equal(resolveLoggingFlags().loggingV2, true);
    const featureFlagsSrc = readFileSync(
      new URL('../src/features/logging/config/featureFlags.ts', import.meta.url),
      'utf8',
    );
    assert.ok(
      !featureFlagsSrc.includes('EXPO_PUBLIC_LOGGING_V2'),
      'featureFlags must not read the old Expo env toggle',
    );
    resetLoggingFlags();
  });

  await checkAsync('V10. saveNote writes a canonical note event and keeps active-session recovery empty', async () => {
    const clock = createManualClock(NOW);
    const port = createInMemoryLoggingPersistence();
    const repo = createLoggingRepository(port, clock);
    const actor: LoggingActor = { familyId: 'fam-1', childId: 'baby-mia', userId: 'cg-mom' };
    const result = await saveNote(
      { repo, clock, actor },
      {
        clientEventId: 'note-cid-1',
        noteType: 'spit_up',
        label: ' Spit-up ',
        note: ' small amount ',
      },
    );

    assert.ok(result.ok && isNoteEvent(result.event));
    if (result.ok && isNoteEvent(result.event)) {
      assert.equal(result.event.details.noteType, 'spit_up');
      assert.equal(result.event.details.label, 'Spit-up');
      assert.equal(result.event.details.note, 'small amount');
    }

    const today = await repo.getTodayEvents({ familyId: 'fam-1', childId: 'baby-mia' });
    const active = await repo.getActiveSessions({ familyId: 'fam-1', childId: 'baby-mia', userId: 'cg-mom' });
    const historyRows = buildV2HistoryTimeline(today, seedCaregivers, NOW);

    assert.equal(today.length, 1);
    assert.ok(isNoteEvent(today[0]));
    assert.equal(active.length, 0);
    assert.equal(historyRows[0].label, 'Spit-up');
  });

  await checkAsync('V11. canonical merge and legacy snapshot migration are idempotent with v2 winning', async () => {
    const legacy: LogEvent = {
      id: 'legacy-note',
      babyId: 'baby-mia',
      caregiverId: 'cg-mom',
      type: 'note',
      startAt: iso(NOW),
      endAt: null,
      meta: { label: 'Fussy' },
      createdAt: iso(NOW),
    };
    const canonical = makeNoteAt('canonical-note', 'legacy-note', NOW, {
      noteType: 'spit_up',
      label: 'Spit-up',
    });
    const compatibility = mapLegacyEvents([legacy]);

    const merged = mergeCanonicalEvents([canonical], compatibility);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, 'canonical-note');
    assert.ok(isNoteEvent(merged[0]) && merged[0].details.noteType === 'spit_up');

    const migratedOnce = migrateLegacyEventsToLoggingSnapshot(
      { events: [canonical], syncQueue: ['canonical-note', 'canonical-note'] },
      [legacy],
    );
    const migratedTwice = migrateLegacyEventsToLoggingSnapshot(migratedOnce, [legacy]);
    assert.equal(migratedOnce.events.length, 1);
    assert.deepEqual(migratedOnce.syncQueue, ['canonical-note']);
    assert.deepEqual(migratedTwice, migratedOnce);
  });

  await checkAsync('V12. canonical range selection includes overlapping sleeps and instant notes', async () => {
    const fromMs = NOW + 60 * 60_000;
    const toMs = NOW + 3 * 60 * 60_000;
    const overlappingSleep = makeCompletedSleepAt(
      'range-sleep',
      'range-sleep-cid',
      NOW + 30 * 60_000,
      NOW + 90 * 60_000,
    );
    const note = makeNoteAt('range-note', 'range-note-cid', NOW + 2 * 60 * 60_000, {
      noteType: 'general',
      label: 'Fussy',
    });
    const futureFeed = makeBottleAt('range-future-feed', 'range-future-feed-cid', NOW + 4 * 60 * 60_000);

    const selected = selectCanonicalEventsInRange([overlappingSleep, note, futureFeed], { fromMs, toMs });
    assert.deepEqual(selected.map((event) => event.id), ['range-note', 'range-sleep']);
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

// V. Caregiver invite — role-selector stability + beta-tester share copy (this
// task). The role chips must always render all three roles (Mom/Dad/Other) and
// never conditionally drop the selected one; the share text must point beta
// testers at an install link (or a link-less fallback) and never leak a secret.
const INVITE_SHEET_SRC = readFileSync(
  new URL('../src/components/auth/InviteCaregiverSheet.tsx', import.meta.url),
  'utf8',
);
const INVITE_MSG_SRC = readFileSync(
  new URL('../src/components/auth/inviteShareMessage.ts', import.meta.url),
  'utf8',
);
const INVITE_CODE = 'ABCD-EFGH';
const BETA_INSTALL_URL = 'https://example.test/install/lullaby';

check('V1. the role chips render Mom, Dad and Other as stable options', () => {
  for (const label of ['Mom', 'Dad', 'Other']) {
    assert.ok(INVITE_SHEET_SRC.includes(`label: '${label}'`), `role option ${label} present`);
  }
  // All three come from a single .map over ROLES — every option is always rendered.
  assert.match(INVITE_SHEET_SRC, /ROLES\.map\(/);
});

check('V2. the selected role is styled, never conditionally removed or hidden', () => {
  // Selection only drives styling (active ? … : …); it must not gate rendering
  // of an option, and no label/chip is ever fully transparent.
  assert.ok(!/active\s*&&\s*</.test(INVITE_SHEET_SRC), 'no `active && <…>` conditional render of an option');
  assert.ok(!/opacity:\s*0(?![.\d])/.test(INVITE_SHEET_SRC), 'no opacity:0 on any role label/chip');
  // The painted surface sits on an inner View (Android repaint gotcha) with a
  // constant 2px border in both states, so selecting never jumps the layout.
  assert.match(INVITE_SHEET_SRC, /borderWidth:\s*2/);
});

check('V3. share copy WITH an install link lists install → join → enter-code steps', () => {
  const msg = buildInviteShareMessage({ code: INVITE_CODE, installUrl: BETA_INSTALL_URL });
  assert.ok(msg.includes('Install the Lullaby beta'), 'beta install line present');
  assert.ok(msg.includes(BETA_INSTALL_URL), 'the configured install link is included');
  assert.ok(msg.includes('Join with a code'), 'join-with-a-code instruction present');
  assert.ok(msg.includes(INVITE_CODE), 'the invite code is included');
  assert.ok(msg.includes('This invite expires in 7 days.'), 'expiry reminder present');
});

check('V4. share copy WITHOUT an install link uses the "link I sent you" fallback', () => {
  const msg = buildInviteShareMessage({ code: INVITE_CODE, installUrl: null });
  assert.ok(msg.includes('Install the Lullaby beta from the link I sent you'), 'fallback install line');
  assert.ok(msg.includes('Join with a code'), 'join-with-a-code instruction present');
  assert.ok(msg.includes(INVITE_CODE), 'the invite code is included');
  assert.ok(msg.includes('This invite expires in 7 days.'), 'expiry reminder present');
  assert.ok(!/https?:\/\//.test(msg), 'no URL is fabricated when none is configured');
});

check('V5. resolveAppInstallUrl treats unset/blank as no link, trims a real one', () => {
  assert.equal(resolveAppInstallUrl(undefined), null);
  assert.equal(resolveAppInstallUrl(''), null);
  assert.equal(resolveAppInstallUrl('   '), null);
  assert.equal(resolveAppInstallUrl('  https://example.test/x  '), 'https://example.test/x');
});

check('V6. no hardcoded App Store / Google Play URL is introduced', () => {
  for (const src of [INVITE_SHEET_SRC, INVITE_MSG_SRC]) {
    for (const banned of ['apps.apple.com', 'itunes.apple.com', 'play.google.com', 'testflight.apple.com']) {
      assert.ok(!src.includes(banned), `must not hardcode ${banned}`);
    }
  }
});

check('V7. no RevenueCat / paywall / subscription code is introduced in the invite flow', () => {
  for (const src of [INVITE_SHEET_SRC, INVITE_MSG_SRC]) {
    for (const banned of [/RevenueCat/i, /\bPurchases\b/, /paywall/i, /subscription/i]) {
      assert.ok(!banned.test(src), `must not reference ${banned}`);
    }
  }
});

check('V8. the invite share text never leaks a Supabase URL or anon key', () => {
  const msg = buildInviteShareMessage({ code: INVITE_CODE, installUrl: BETA_INSTALL_URL });
  assert.ok(!/supabase/i.test(msg), 'no supabase reference in share text');
  assert.ok(!/eyJ[A-Za-z0-9]/.test(msg), 'no JWT-looking anon key in share text');
});

// DV. Local Android dev workflow. `npm run dev` (scripts/dev-client.mjs) must
// survive port 8081 being held by an unrelated process (e.g. a browser) by falling
// back to the next free port instead of hard-failing, and must never kill arbitrary
// processes. The .mjs launcher runs adb/expo on import, so it can't be imported
// here — these are source scans, GP-style.
const DEV_CLIENT_SRC = readFileSync(new URL('../scripts/dev-client.mjs', import.meta.url), 'utf8');
const PACKAGE_JSON = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { scripts?: Record<string, string> };

check('DV1. the npm run android + npm run dev entry points still exist and point at the scripts', () => {
  assert.equal(
    PACKAGE_JSON.scripts?.android,
    'node scripts/android-dev.mjs',
    'npm run android must run android-dev.mjs',
  );
  assert.equal(
    PACKAGE_JSON.scripts?.dev,
    'node scripts/dev-client.mjs',
    'npm run dev must run dev-client.mjs',
  );
  assert.equal(
    PACKAGE_JSON.scripts?.['dev:clear'],
    'node scripts/dev-client.mjs --clear',
    'npm run dev:clear must use the interactive dev-client wrapper with cache clearing',
  );
});

check('DV2. npm run dev falls back to another port when 8081 is busy — it never hard-fails on a non-Metro process', () => {
  // Automatic fallback = a port resolver + an upward scan + the calm message.
  assert.ok(DEV_CLIENT_SRC.includes('resolvePort'), 'dev-client must resolve a usable port');
  assert.ok(
    DEV_CLIENT_SRC.includes('busy with non-Metro process, using'),
    'dev-client must print the non-Metro fallback message',
  );
  assert.ok(/preferred \+ 1/.test(DEV_CLIENT_SRC), 'dev-client must scan upward for the next free port');
  // The old hard-exit when a non-Metro process held the port must be gone.
  assert.ok(
    !DEV_CLIENT_SRC.includes('does not look like Metro'),
    'dev-client must NOT hard-fail when the port is held by a non-Metro process',
  );
});

check('DV3. the dev launcher never force-kills arbitrary processes (SIGTERM only, no kill -9 / pkill / Firefox targeting)', () => {
  assert.ok(!/kill\s+-9/.test(DEV_CLIENT_SRC), 'must not use kill -9');
  assert.ok(!DEV_CLIENT_SRC.includes('SIGKILL'), 'must not SIGKILL');
  assert.ok(!/\bpkill\b/.test(DEV_CLIENT_SRC), 'must not pkill');
  assert.ok(!/firefox/i.test(DEV_CLIENT_SRC), 'must not reference or target Firefox (or any named unrelated app)');
  // Any process it stops is its OWN stale Metro on the preferred port, via SIGTERM.
  assert.ok(DEV_CLIENT_SRC.includes("'SIGTERM'"), 'the stale-Metro reclaim must use SIGTERM');
  assert.ok(
    DEV_CLIENT_SRC.includes('Stopping stale Metro'),
    'a process is only ever stopped when it is the script’s own stale Metro',
  );
});

check('DV4. the dev launcher gives Expo a real TTY so terminal hotkeys work', () => {
  assert.ok(
    DEV_CLIENT_SRC.includes("stdio: 'inherit'"),
    'Expo must inherit stdin/stdout/stderr for Terminal UI hotkeys',
  );
  assert.ok(
    !DEV_CLIENT_SRC.includes("stdio: ['inherit', 'pipe', 'pipe']"),
    'Expo stdout/stderr must not be piped because that disables the interactive Terminal UI',
  );
  assert.ok(
    !DEV_CLIENT_SRC.includes("child.stdout.on('data'"),
    'dev-client must not depend on piped Expo stdout for readiness',
  );
  assert.ok(
    DEV_CLIENT_SRC.includes('/_expo/open?platform=android&runtime=custom'),
    'auto-open readiness should use Expo open endpoint polling instead of stdout piping',
  );
});

// W. Pro foundation (Phase 1) — proConfig (mode flags + dev override), proGates
// (pure feature predicates), and the ProProvider skeleton. These checks lock the
// invariants the plan (docs/pro-implementation-plan.md §§3,5,7,11,12) depends on:
// real Pro (PRO_ENABLED) supersedes the fake-door preview; the four gates are
// pure and never gate the FIRST caregiver invite or core logging; and no
// RevenueCat SDK / paywall / purchase / external-payment code has landed yet.

// Temporarily set env flags, run fn, then restore exactly (delete if originally
// unset). proConfig reads process.env live, so this exercises the real parsing.
function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) original[key] = process.env[key];
  try {
    for (const [key, val] of Object.entries(overrides)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
    fn();
  } finally {
    for (const [key, val] of Object.entries(original)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  }
}

const PRO_CONFIG_SRC = readFileSync(new URL('../src/lib/proConfig.ts', import.meta.url), 'utf8');
const PRO_GATES_SRC = readFileSync(new URL('../src/lib/proGates.ts', import.meta.url), 'utf8');
const PRO_PROVIDER_SRC = readFileSync(new URL('../src/state/ProProvider.tsx', import.meta.url), 'utf8');
const UPGRADE_CARD_SRC = readFileSync(new URL('../src/components/UpgradeCard.tsx', import.meta.url), 'utf8');
const PRO_PREVIEW_CARD_SRC = readFileSync(
  new URL('../src/features/insights/components/ProPreviewCard.tsx', import.meta.url),
  'utf8',
);
// ACCOUNT_SHEET_SRC is already read for the auth-surface checks above; reuse it.
const INSIGHTS_SCREEN_SRC = readFileSync(
  new URL('../src/features/insights/InsightsScreen.tsx', import.meta.url),
  'utf8',
);
const TABS_LAYOUT_SRC = readFileSync(new URL('../src/app/(tabs)/_layout.tsx', import.meta.url), 'utf8');
const PKG_JSON_SRC = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const AUTH_TRANSITION_SRC = readFileSync(
  new URL('../src/components/auth/AuthTransition.tsx', import.meta.url),
  'utf8',
);
const RESOLVE_REPOSITORY_SRC = readFileSync(
  new URL('../src/sync/resolveRepository.ts', import.meta.url),
  'utf8',
);
const STARTUP_DIAGNOSTICS_SRC = readFileSync(
  new URL('../src/lib/startupDiagnostics.ts', import.meta.url),
  'utf8',
);
const LOGGING_PROVIDER_SRC = readFileSync(
  new URL('../src/features/logging/state/LoggingProvider.tsx', import.meta.url),
  'utf8',
);
const SCREEN_SRC = readFileSync(new URL('../src/components/Screen.tsx', import.meta.url), 'utf8');
const LULLABY_TAB_BAR_SRC = readFileSync(
  new URL('../src/components/LullabyTabBar.tsx', import.meta.url),
  'utf8',
);
const REASSURE_SCREEN_SRC = readFileSync(
  new URL('../src/app/(tabs)/reassure.tsx', import.meta.url),
  'utf8',
);
const VOICE_ORB_SRC = readFileSync(
  new URL('../src/features/reassure/components/VoiceOrb.tsx', import.meta.url),
  'utf8',
);
const ASK_CARD_SRC = readFileSync(
  new URL('../src/features/reassure/components/AskCard.tsx', import.meta.url),
  'utf8',
);
const USE_VOICE_INPUT_SRC = readFileSync(
  new URL('../src/features/reassure/application/useVoiceInput.ts', import.meta.url),
  'utf8',
);
const SPEECH_SRC = readFileSync(
  new URL('../src/features/reassure/application/speech.ts', import.meta.url),
  'utf8',
);
const TOPIC_ACCORDION_SRC = readFileSync(
  new URL('../src/features/reassure/components/TopicAccordion.tsx', import.meta.url),
  'utf8',
);

// Core-logging leaves that must stay free of any Pro dependency.
const CORE_LOGGING_SRCS: Array<[string, string]> = [
  ['data/localInteractions.ts', readFileSync(new URL('../src/data/localInteractions.ts', import.meta.url), 'utf8')],
  ['data/currentState.ts', readFileSync(new URL('../src/data/currentState.ts', import.meta.url), 'utf8')],
  [
    'features/logging/state/loggingStore.ts',
    readFileSync(new URL('../src/features/logging/state/loggingStore.ts', import.meta.url), 'utf8'),
  ],
  [
    'features/logging/state/loggingSelectors.ts',
    readFileSync(new URL('../src/features/logging/state/loggingSelectors.ts', import.meta.url), 'utf8'),
  ],
  [
    'features/logging/state/LoggingProvider.tsx',
    LOGGING_PROVIDER_SRC,
  ],
  [
    'features/logging/domain/rules.ts',
    readFileSync(new URL('../src/features/logging/domain/rules.ts', import.meta.url), 'utf8'),
  ],
];

const PAYWALL_SHEET_SRC = readFileSync(new URL('../src/components/pro/PaywallSheet.tsx', import.meta.url), 'utf8');
const PRO_PAYWALL_HOST_SRC = readFileSync(new URL('../src/components/pro/ProPaywallHost.tsx', import.meta.url), 'utf8');
const BUILD_EXPORT_SRC = readFileSync(
  new URL('../src/features/insights/buildWeeklyExportText.ts', import.meta.url),
  'utf8',
);
const SHARE_EXPORT_SRC = readFileSync(
  new URL('../src/features/insights/shareWeeklyExport.ts', import.meta.url),
  'utf8',
);
const REVENUECAT_SRC = readFileSync(new URL('../src/lib/revenueCat.ts', import.meta.url), 'utf8');

// The user-facing Pro surfaces — where an accidental payment link would surface.
const PRO_SURFACE_SRCS: Array<[string, string]> = [
  ['proConfig.ts', PRO_CONFIG_SRC],
  ['proGates.ts', PRO_GATES_SRC],
  ['ProProvider.tsx', PRO_PROVIDER_SRC],
  ['UpgradeCard.tsx', UPGRADE_CARD_SRC],
  ['ProPreviewCard.tsx', PRO_PREVIEW_CARD_SRC],
  ['AccountSheet.tsx', ACCOUNT_SHEET_SRC],
  ['InsightsScreen.tsx', INSIGHTS_SCREEN_SRC],
  ['PaywallSheet.tsx', PAYWALL_SHEET_SRC],
  ['ProPaywallHost.tsx', PRO_PAYWALL_HOST_SRC],
  ['buildWeeklyExportText.ts', BUILD_EXPORT_SRC],
  ['shareWeeklyExport.ts', SHARE_EXPORT_SRC],
  ['revenueCat.ts', REVENUECAT_SRC],
];

// Every .ts/.tsx under src/ — for the repo-wide "no RevenueCat SDK yet" sweep.
function collectSourceFiles(dirUrl: URL, prefix: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const entry of readdirSync(dirUrl, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(new URL(`${entry.name}/`, dirUrl), rel));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push([rel, readFileSync(new URL(entry.name, dirUrl), 'utf8')]);
    }
  }
  return out;
}
const ALL_SRC_FILES = collectSourceFiles(new URL('../src/', import.meta.url), 'src');

// Import paths that mark a dependency on the Pro foundation / purchases. Core
// logging and the first-invite flow must never contain any of these.
const BANNED_PRO_IMPORTS = [
  '@/lib/proGates',
  '@/lib/proConfig',
  '@/state/ProProvider',
  '@/lib/revenueCat',
  'react-native-purchases',
];

check('ST1. the app-shell startup gate owns v2 hydration before the tab navigator mounts', () => {
  const gateFn = TABS_LAYOUT_SRC.indexOf('function AppShellStartupGate');
  const gateUse = TABS_LAYOUT_SRC.indexOf('<AppShellStartupGate>');
  const tabs = TABS_LAYOUT_SRC.indexOf('<Tabs');
  assert.ok(gateFn !== -1, 'Tabs layout must define the app-shell startup gate');
  assert.ok(gateUse !== -1 && tabs !== -1 && gateUse < tabs, 'the startup gate must wrap Tabs');
  const gateBody = TABS_LAYOUT_SRC.slice(gateFn, TABS_LAYOUT_SRC.indexOf('export default function TabsLayout'));
  assert.ok(gateBody.includes('useLogging()'), 'the gate must read logging hydration from useLogging');
  assert.ok(gateBody.includes('useLocalEvents()'), 'the gate must read event hydration from useLocalEvents');
  assert.ok(gateBody.includes('eventsHydrated'), 'the gate must wait for event hydration');
  assert.ok(gateBody.includes('return <AuthTransition />'), 'the gate owns the full-screen loading screen');
});

check('ST2. Home no longer renders a nested AuthLoading inside the tab shell', () => {
  assert.ok(!TONIGHT_SRC.includes('import { AuthLoading }'), 'Tonight must not import AuthLoading');
  assert.ok(
    !/waitingForV2Hydration\s*\?\s*<AuthLoading/.test(TONIGHT_SRC),
    'Tonight must not swap its Screen body to AuthLoading while tabs are mounted',
  );
});

check('ST3. startup loading copy is stable across auth loading states', () => {
  assert.ok(
    AUTH_TRANSITION_SRC.includes("AUTH_TRANSITION_MESSAGE = 'Preparing Lullaby...'"),
    'AuthTransition must define the single default startup copy',
  );
  assert.ok(
    !AUTH_GATE_SRC.includes('Preparing your account'),
    'AuthGate must not override startup copy for postAuthSync/loading and cause text bouncing',
  );
});

check('ST4. repository startup reuses known auth + baby ids instead of re-fetching them', () => {
  assert.ok(RESOLVE_REPOSITORY_SRC.includes('type RepositoryBootstrap'), 'resolveRepository accepts bootstrap ids');
  assert.ok(RESOLVE_REPOSITORY_SRC.includes('input.userId === undefined'), 'userId input controls session re-read');
  assert.ok(RESOLVE_REPOSITORY_SRC.includes('input.babyId === undefined'), 'babyId input controls linked-baby re-read');
  assert.ok(
    LOCAL_EVENT_PROVIDER_SRC.includes('resolveRepository({') &&
      LOCAL_EVENT_PROVIDER_SRC.includes('userId: authUserId') &&
      LOCAL_EVENT_PROVIDER_SRC.includes('babyId: authBabyId'),
    'LocalEventProvider must pass the already-known auth/baby ids into resolveRepository',
  );
});

check('ST5. startup diagnostics are dev-only and routed through one helper', () => {
  assert.ok(STARTUP_DIAGNOSTICS_SRC.includes('if (!__DEV__) return'), 'startup logs must be dev-only');
  assert.ok(AUTH_PROVIDER_SRC.includes('logStartupStep'), 'AuthProvider should emit startup milestones');
  assert.ok(TABS_LAYOUT_SRC.includes('logStartupStep'), 'Tabs layout should log app-shell readiness');
  assert.ok(
    LOCAL_EVENT_PROVIDER_SRC.includes('logStartupStep') && CORE_LOGGING_SRCS.some(([name, src]) =>
      name === 'features/logging/state/LoggingProvider.tsx' && src.includes('logStartupStep'),
    ),
    'event and logging providers should log their hydrate milestones',
  );
});

check('ST6. auth status transitions are reasoned and duplicate same-user sessions do not reprovision', () => {
  assert.ok(AUTH_PROVIDER_SRC.includes('setAuthStatus'), 'AuthProvider should centralize auth status transitions');
  assert.ok(AUTH_PROVIDER_SRC.includes('reason: \'initial\''), 'initial auth status log should include a reason');
  assert.ok(AUTH_PROVIDER_SRC.includes('provisioningRef'), 'AuthProvider should guard in-flight provisioning');
  assert.ok(AUTH_PROVIDER_SRC.includes('provisionedUserIdRef'), 'AuthProvider should remember provisioned users');
  assert.ok(
    AUTH_PROVIDER_SRC.includes('statusRef.current === next'),
    'duplicate status transitions should be suppressed',
  );
  assert.ok(
    AUTH_PROVIDER_SRC.includes('provisionedUserIdRef.current === userId'),
    'same-user session emissions after provisioning should be ignored',
  );
});

check('ST7. logging v2 waits for event hydration and merges the restored event source', () => {
  assert.ok(
    LOGGING_PROVIDER_SRC.includes('eventsHydrated') &&
      LOGGING_PROVIDER_SRC.includes('!scope || !eventsHydrated') &&
      !LOGGING_PROVIDER_SRC.includes('!enabled || !scope || !eventsHydrated'),
    'LoggingProvider hydrate should wait until LocalEventProvider has restored events',
  );
  assert.ok(
    LOGGING_PROVIDER_SRC.includes('mapLegacyEvents(restoredEvents)'),
    'LoggingProvider should map restored legacy/Supabase events into CareEvent shape',
  );
  assert.ok(
    LOGGING_PROVIDER_SRC.includes('mergeExternalLoggingEvents'),
    'LoggingProvider should merge restored events into v2 selectors',
  );
});

check('ST8. LayoutAnimation is not enabled through the Android New Architecture no-op path', () => {
  assert.ok(
    TOPIC_ACCORDION_SRC.includes('nativeFabricUIManager'),
    'TopicAccordion should detect Fabric before enabling legacy LayoutAnimation',
  );
  assert.ok(
    TOPIC_ACCORDION_SRC.includes("Platform.OS === 'android' && !isFabric"),
    'TopicAccordion should skip setLayoutAnimationEnabledExperimental under Fabric',
  );
});

check('W1. proConfig reads EXPO_PUBLIC_PRO_ENABLED and treats "true"/"1" as enabled', () => {
  assert.ok(PRO_CONFIG_SRC.includes('EXPO_PUBLIC_PRO_ENABLED'), 'proConfig references the master flag');
  withEnv({ EXPO_PUBLIC_PRO_ENABLED: 'true' }, () => assert.equal(isProEnabled(), true));
  withEnv({ EXPO_PUBLIC_PRO_ENABLED: '1' }, () => assert.equal(isProEnabled(), true));
  withEnv({ EXPO_PUBLIC_PRO_ENABLED: 'false' }, () => assert.equal(isProEnabled(), false));
  withEnv({ EXPO_PUBLIC_PRO_ENABLED: undefined }, () => assert.equal(isProEnabled(), false));
});

check('W2. getProMode: PRO_ENABLED beats PRO_PREVIEW; preview when only preview; off when neither', () => {
  withEnv({ EXPO_PUBLIC_PRO_ENABLED: 'true', EXPO_PUBLIC_PRO_PREVIEW_ENABLED: 'true' }, () =>
    assert.equal(getProMode(), 'enabled'),
  ); // precedence: real Pro supersedes the fake-door
  withEnv({ EXPO_PUBLIC_PRO_ENABLED: '1', EXPO_PUBLIC_PRO_PREVIEW_ENABLED: '0' }, () =>
    assert.equal(getProMode(), 'enabled'),
  );
  withEnv({ EXPO_PUBLIC_PRO_ENABLED: 'false', EXPO_PUBLIC_PRO_PREVIEW_ENABLED: 'true' }, () =>
    assert.equal(getProMode(), 'preview'),
  );
  withEnv({ EXPO_PUBLIC_PRO_ENABLED: undefined, EXPO_PUBLIC_PRO_PREVIEW_ENABLED: undefined }, () =>
    assert.equal(getProMode(), 'off'),
  );
});

check('W3. proGates export the four gates; depth/export gate on isPro, extra caregivers stay open', () => {
  assert.equal(canViewFullHistory(true), true);
  assert.equal(canViewFullHistory(false), false);
  assert.equal(canExportWeeklyRecap(true), true);
  assert.equal(canExportWeeklyRecap(false), false);
  assert.equal(canSharePediatricianSummary(true), true);
  assert.equal(canSharePediatricianSummary(false), false);
  // Future gate — open for now regardless of isPro, and NEVER the first invite.
  assert.equal(canAddExtraCaregivers(false), true);
  assert.equal(canAddExtraCaregivers(true), true);
  assert.ok(/first caregiver invite/i.test(PRO_GATES_SRC), 'proGates documents the free first invite');
});

check('W4. resolveDevProEntitlement grants Pro only in a dev build with the override set', () => {
  withEnv({ EXPO_PUBLIC_PRO_DEV_ENTITLEMENT: 'true' }, () => {
    assert.equal(resolveDevProEntitlement(true), true); // dev + flag
    assert.equal(resolveDevProEntitlement(false), false); // production → never
  });
  withEnv({ EXPO_PUBLIC_PRO_DEV_ENTITLEMENT: '0' }, () => assert.equal(resolveDevProEntitlement(true), false));
  withEnv({ EXPO_PUBLIC_PRO_DEV_ENTITLEMENT: undefined }, () => assert.equal(resolveDevProEntitlement(true), false));
});

check('W5. core logging files never import Pro config/gates/provider', () => {
  for (const [name, src] of CORE_LOGGING_SRCS) {
    for (const path of BANNED_PRO_IMPORTS) {
      assert.ok(!src.includes(path), `${name} must not import ${path}`);
    }
    assert.ok(!/\busePro\s*\(/.test(src), `${name} must not call usePro()`);
  }
});

check('W6. the first caregiver invite flow never imports Pro config/gates/provider', () => {
  const inviteSrcs: Array<[string, string]> = [
    ['InviteCaregiverSheet.tsx', INVITE_SHEET_SRC],
    ['inviteShareMessage.ts', INVITE_MSG_SRC],
  ];
  for (const [name, src] of inviteSrcs) {
    for (const path of BANNED_PRO_IMPORTS) {
      assert.ok(!src.includes(path), `${name} must not import ${path}`);
    }
    assert.ok(!src.includes('canAddExtraCaregivers'), `${name} must not reference the extra-caregiver gate`);
    assert.ok(!/\busePro\s*\(/.test(src), `${name} must not call usePro()`);
  }
});

check('W7. fake-door preview survives: preview mode resolves and the interest analytics still fire', () => {
  withEnv({ EXPO_PUBLIC_PRO_ENABLED: 'false', EXPO_PUBLIC_PRO_PREVIEW_ENABLED: 'true' }, () =>
    assert.equal(getProMode(), 'preview'),
  );
  // The call sites render the Pro card whenever Pro is on (preview OR enabled);
  // in preview mode the card behaves as the fake-door — the interest events and
  // the calm "coming soon" copy are still present. Real Pro is off here.
  assert.ok(INSIGHTS_SCREEN_SRC.includes("getProMode() !== 'off'"), 'Insights shows the Pro card whenever Pro is on');
  assert.ok(ACCOUNT_SHEET_SRC.includes("getProMode() !== 'off'"), 'AccountSheet shows the Pro card whenever Pro is on');
  assert.ok(UPGRADE_CARD_SRC.includes("track('upgrade_card_tapped'"), 'UpgradeCard fires upgrade_card_tapped');
  assert.ok(/coming soon/i.test(UPGRADE_CARD_SRC), 'UpgradeCard keeps its coming-soon copy');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes("track('upgrade_card_tapped'"), 'ProPreviewCard fires upgrade_card_tapped');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes("track('export_tapped'"), 'ProPreviewCard fires export_tapped');
});

check('W7b. Pro public copy stays future-facing for Apple review', () => {
  for (const [name, src] of [
    ['UpgradeCard.tsx', UPGRADE_CARD_SRC],
    ['ProPreviewCard.tsx', PRO_PREVIEW_CARD_SRC],
    ['PaywallSheet.tsx', PAYWALL_SHEET_SRC],
  ] as const) {
    assert.ok(
      src.includes('Fuller history') || src.includes('gentle weekly recaps') || src.includes('Export-ready summaries'),
      `${name} keeps softened future-facing Pro copy`,
    );
    for (const stale of ['doctor-ready', 'more caregivers', 'share with your pediatrician']) {
      assert.ok(!src.includes(stale), `${name} must not include stale Pro claim: ${stale}`);
    }
  }
});

check('W7c. Pro cards show a calm active state to subscribers (no upsell nudge)', () => {
  // An already-entitled parent must never be nudged to buy what they already
  // have. Both AccountSheet and Insights entry cards branch on the live isPro
  // entitlement and render a calm active state instead of the upsell CTA.
  assert.ok(UPGRADE_CARD_SRC.includes('isPro'), 'UpgradeCard reads the live Pro entitlement');
  assert.ok(/is active/i.test(UPGRADE_CARD_SRC), 'UpgradeCard shows an active status to subscribers');
  assert.ok(/unlocked/i.test(UPGRADE_CARD_SRC), 'UpgradeCard tells subscribers their features are unlocked');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes('isPro ? null'), 'ProPreviewCard hides the upsell CTA for subscribers');
  assert.ok(/unlocked/i.test(PRO_PREVIEW_CARD_SRC), 'ProPreviewCard shows an active state to subscribers');
});

check('W8. analytics stays privacy-safe: still no client SELECT, fake-door events kept', () => {
  assert.ok(ANALYTICS_SRC.includes('analytics_events'), 'analytics still targets analytics_events');
  assert.ok(!/\.select\s*\(/.test(ANALYTICS_SRC), 'analytics must never .select() from analytics_events');
  assert.ok(ANALYTICS_SRC.includes("'upgrade_card_tapped'"), 'upgrade_card_tapped stays in the event union');
  assert.ok(ANALYTICS_SRC.includes("'export_tapped'"), 'export_tapped stays in the event union');
});

check('W9. RevenueCat SDK is installed but its import is isolated to the Pro service', () => {
  // react-native-purchases is now a real dependency; the UI SDK is NOT installed
  // (we render our own PaywallSheet).
  assert.ok(PKG_JSON_SRC.includes('"react-native-purchases":'), 'react-native-purchases is a dependency');
  assert.ok(!PKG_JSON_SRC.includes('react-native-purchases-ui'), 'react-native-purchases-ui must NOT be installed');
  // Only src/lib/revenueCat.ts may import the SDK; every other src file must route
  // through that service so the native dependency stays in one place.
  const SDK_ALLOWED = new Set(['src/lib/revenueCat.ts']);
  for (const [rel, src] of ALL_SRC_FILES) {
    if (SDK_ALLOWED.has(rel)) continue;
    assert.ok(
      !/from ['"]react-native-purchases['"]/.test(src),
      `${rel} must not import react-native-purchases (only src/lib/revenueCat.ts may)`,
    );
  }
});

check('W10. Pro surfaces carry no external payment link / Stripe / web-checkout reference', () => {
  const bannedPaymentTokens = [
    /stripe/i,
    /paypal/i,
    /braintree/i,
    /lemonsqueez/i,
    /paddle\.com/i,
    /checkout\./i,
    /apps\.apple\.com/i,
    /play\.google\.com/i,
  ];
  for (const [name, src] of PRO_SURFACE_SRCS) {
    for (const banned of bannedPaymentTokens) {
      assert.ok(!banned.test(src), `${name} must not reference ${banned}`);
    }
  }
});

check('W11. ProProvider drives RevenueCat via the service (not the SDK) and writes no Supabase', () => {
  assert.ok(!/from ['"]react-native-purchases['"]/.test(PRO_PROVIDER_SRC), 'ProProvider must not import the RC SDK directly');
  assert.ok(!/\bPurchases\.\w+\(/.test(PRO_PROVIDER_SRC), 'ProProvider must not call the RC SDK directly');
  assert.ok(PRO_PROVIDER_SRC.includes('@/lib/revenueCat'), 'ProProvider drives purchases through the service');
  assert.ok(PRO_PROVIDER_SRC.includes('@/state/AuthProvider'), 'ProProvider reads the signed-in identity via useAuth');
  assert.ok(!PRO_PROVIDER_SRC.includes('@/lib/supabase'), 'ProProvider must not read/write Supabase this phase');
  assert.ok(PRO_PROVIDER_SRC.includes('resolveDevProEntitlement'), 'the dev override still unlocks isPro for testing');
});

check('W12. ProProvider is mounted under AuthGate in the tab shell', () => {
  assert.ok(TABS_LAYOUT_SRC.includes('<ProProvider>'), 'ProProvider is mounted');
  const gateIdx = TABS_LAYOUT_SRC.indexOf('<AuthGate>');
  const proIdx = TABS_LAYOUT_SRC.indexOf('<ProProvider>');
  const localIdx = TABS_LAYOUT_SRC.indexOf('<LocalEventProvider>');
  assert.ok(gateIdx >= 0 && proIdx > gateIdx, 'ProProvider sits under AuthGate');
  assert.ok(localIdx > proIdx, 'ProProvider wraps the event/logging providers');
});

// X. Pro Phase 2 — paywall UI skeleton + real Pro entry points. Verifies the
// paywall carries the required calm/safety copy and NO prices/payment links/SDK;
// that UpgradeCard/ProPreviewCard open the paywall in "enabled" mode while keeping
// the fake-door in "preview"; that the host is wired; and that the two new
// analytics events landed without any purchase/restore events (still Phase 3+).

check('X1. PaywallSheet carries the required title, restore control, and non-medical safety copy', () => {
  assert.ok(PAYWALL_SHEET_SRC.includes('Lullaby Pro'), 'PaywallSheet shows the Lullaby Pro title');
  assert.ok(PAYWALL_SHEET_SRC.includes('Restore purchase'), 'PaywallSheet includes a Restore purchase control');
  assert.ok(PAYWALL_SHEET_SRC.includes('Not medical advice'), 'PaywallSheet includes the non-medical safety line');
  assert.ok(/App Store \/ Play Store/.test(PAYWALL_SHEET_SRC), 'PaywallSheet says billing is store-managed');
  assert.ok(
    /not configured in this build yet/i.test(PAYWALL_SHEET_SRC),
    'PaywallSheet shows the calm unavailable state',
  );
});

check('X2. PaywallSheet hardcodes no prices and no fake packages', () => {
  assert.ok(!PAYWALL_SHEET_SRC.includes('$'), 'no "$" price glyph in the paywall');
  assert.ok(!/\bUSD\b/.test(PAYWALL_SHEET_SRC), 'no USD currency code');
  assert.ok(!/monthly price|yearly price/i.test(PAYWALL_SHEET_SRC), 'no monthly/yearly price label');
  for (const price of ['6.99', '44.99']) {
    assert.ok(!PAYWALL_SHEET_SRC.includes(price), `no hardcoded ${price} price`);
  }
});

check('X3. PaywallSheet has no external payment link and does not import the subscription SDK', () => {
  assert.ok(!/https?:\/\//.test(PAYWALL_SHEET_SRC), 'no external URL in the paywall');
  // It may use the Pro service (@/lib/revenueCat) but must not import the SDK itself.
  assert.ok(!/from ['"]react-native-purchases['"]/.test(PAYWALL_SHEET_SRC), 'no direct RevenueCat SDK import');
  assert.ok(!/\bPurchases\./.test(PAYWALL_SHEET_SRC), 'no direct Purchases SDK call');
  for (const token of [/stripe/i, /paypal/i, /checkout\./i, /web checkout/i]) {
    assert.ok(!token.test(PAYWALL_SHEET_SRC), `no ${token} reference`);
  }
});

check('X3b. PaywallSheet shows Terms + Privacy links wired through appLinks (no hardcoded URL)', () => {
  // App Store / Play review requires reachable Terms + Privacy from the purchase
  // surface. The links must be present, must resolve through the env-configurable
  // appLinks helpers (EXPO_PUBLIC_TERMS_URL / EXPO_PUBLIC_PRIVACY_POLICY_URL), and
  // must NOT hardcode a URL (the no-URL ban in X3 stays the proof of that).
  assert.ok(PAYWALL_SHEET_SRC.includes('Terms of Use'), 'PaywallSheet shows a Terms of Use link');
  assert.ok(PAYWALL_SHEET_SRC.includes('Privacy Policy'), 'PaywallSheet shows a Privacy Policy link');
  assert.ok(PAYWALL_SHEET_SRC.includes('resolveTermsUrl'), 'Terms link resolves through appLinks (env-configurable)');
  assert.ok(
    PAYWALL_SHEET_SRC.includes('resolvePrivacyPolicyUrl'),
    'Privacy link resolves through appLinks (env-configurable)',
  );
  // Exactly one openURL site, mirroring the settings.tsx crash-safe pattern.
  assert.equal(
    PAYWALL_SHEET_SRC.split('Linking.openURL').length - 1,
    1,
    'PaywallSheet opens links through a single guarded Linking.openURL site',
  );
});

check('X4. ProPaywallHost drives PaywallSheet from usePro and is mounted under ProProvider', () => {
  assert.ok(PRO_PAYWALL_HOST_SRC.includes('usePro'), 'host reads Pro state via usePro');
  assert.ok(PRO_PAYWALL_HOST_SRC.includes('isPaywallOpen'), 'host renders on isPaywallOpen');
  assert.ok(PRO_PAYWALL_HOST_SRC.includes('closePaywall'), 'host closes via closePaywall');
  assert.ok(PRO_PAYWALL_HOST_SRC.includes('PaywallSheet'), 'host renders PaywallSheet');
  assert.ok(TABS_LAYOUT_SRC.includes('<ProPaywallHost'), 'ProPaywallHost is mounted');
  const proIdx = TABS_LAYOUT_SRC.indexOf('<ProProvider>');
  const hostIdx = TABS_LAYOUT_SRC.indexOf('<ProPaywallHost');
  assert.ok(proIdx >= 0 && hostIdx > proIdx, 'ProPaywallHost sits under ProProvider');
});

check('X5. UpgradeCard opens the paywall in enabled mode and keeps the fake-door in preview', () => {
  assert.ok(UPGRADE_CARD_SRC.includes('getProMode('), 'UpgradeCard branches on getProMode');
  assert.ok(UPGRADE_CARD_SRC.includes("=== 'enabled'"), 'UpgradeCard has an enabled branch');
  assert.ok(UPGRADE_CARD_SRC.includes('openPaywall('), 'UpgradeCard opens the paywall via usePro');
  assert.ok(UPGRADE_CARD_SRC.includes("track('paywall_opened'"), 'UpgradeCard fires paywall_opened in enabled mode');
  assert.ok(UPGRADE_CARD_SRC.includes("track('upgrade_card_tapped'"), 'UpgradeCard keeps the fake-door event');
});

check('X6. ProPreviewCard opens the paywall in enabled mode and keeps the fake-door in preview', () => {
  assert.ok(PRO_PREVIEW_CARD_SRC.includes('getProMode('), 'ProPreviewCard branches on getProMode');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes("=== 'enabled'"), 'ProPreviewCard has an enabled branch');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes('openPaywall('), 'ProPreviewCard opens the paywall via usePro');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes("track('paywall_opened'"), 'See-included fires paywall_opened');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes("track('pro_gate_seen'"), 'Export CTA fires pro_gate_seen');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes("track('upgrade_card_tapped'"), 'keeps the fake-door upgrade event');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes("track('export_tapped'"), 'keeps the fake-door export event');
});

check('X7. analytics union carries the paywall entry events (paywall_opened + pro_gate_seen)', () => {
  assert.ok(ANALYTICS_SRC.includes("'paywall_opened'"), 'paywall_opened in the union');
  assert.ok(ANALYTICS_SRC.includes("'pro_gate_seen'"), 'pro_gate_seen in the union');
});

check('X8. parent call sites render the Pro card in preview + enabled, hide it when off', () => {
  assert.ok(INSIGHTS_SCREEN_SRC.includes("getProMode() !== 'off'"), 'Insights renders the card unless Pro is off');
  assert.ok(ACCOUNT_SHEET_SRC.includes("getProMode() !== 'off'"), 'AccountSheet renders the card unless Pro is off');
  assert.ok(ACCOUNT_SHEET_SRC.includes('signedIn'), 'AccountSheet still gates the card on a signed-in user');
});

// Y. Pro Phase 3 — the first REAL Pro feature: a weekly export text + OS share,
// gated behind canExportWeeklyRecap(isPro). Verifies the pure builder is calm,
// non-medical, and leaks nothing sensitive; that the share wrapper is a calm
// react-native wrapper that reuses the pure builder; that ProPreviewCard runs the
// real export only for entitled Pro users (free → paywall, preview → fake-door);
// and that only export_started/export_completed were added to analytics.

// A rich, deterministic view model: 7 days × 6h sleep = 42h total.
const EXPORT_RICH_VM: InsightsViewModel = {
  updatedAt: 0,
  hasEnoughData: true,
  dataDays: 5,
  cards: [],
  weeklySleep: Array.from({ length: 7 }, (_, index) => ({
    date: `2026-06-0${index + 1}`,
    label: 'Day',
    minutes: 360,
  })),
  stats: {
    feedsPerDay: { value: '8', label: 'Feeds / day' },
    sleepPerDay: { value: '6', unit: 'h', label: 'Sleep / day' },
    diapersPerDay: { value: '6', label: 'Diapers / day' },
  },
};

check('Y1. buildWeeklyExportText renders the calm, non-medical weekly summary', () => {
  const text = buildWeeklyExportText(EXPORT_RICH_VM);
  assert.ok(text.includes('Lullaby weekly summary'), 'has the title');
  assert.ok(/not medical advice/i.test(text), 'has the non-medical safety line');
  assert.ok(/Feeds:/.test(text), 'has a feeds label');
  assert.ok(/Sleep:/.test(text), 'has a sleep label');
  assert.ok(/Diaper changes:/.test(text), 'has a diaper label');
  assert.ok(text.includes('42h total'), 'includes weekly total sleep');
  assert.ok(text.includes('8'), 'includes feeds per day');
  // Descriptive only — no diagnosis / prediction / recommendation language.
  assert.ok(!/(diagnos|predict|should|recommend|abnormal)/i.test(text), 'no medical / prescriptive language');
});

check('Y2. buildWeeklyExportText falls back calmly when data is sparse', () => {
  const text = buildWeeklyExportText({ ...EXPORT_RICH_VM, hasEnoughData: false });
  assert.ok(text.includes('Lullaby weekly summary'), 'still has the title');
  assert.ok(/not medical advice/i.test(text), 'still has the safety line');
  assert.ok(
    text.includes('Keep logging to build a clearer weekly summary'),
    'has the sparse-data fallback line',
  );
});

check('Y3. the weekly export leaks no name / notes / ids / secrets / volumes / payment links', () => {
  // Even a view model that (defensively) carries a name-like card id + freeform
  // text must not reach the output — the builder reads only aggregate numbers.
  const text = buildWeeklyExportText({
    ...EXPORT_RICH_VM,
    cards: [
      {
        id: '7f3a9b2c-1234-4d5e-8a9b-0011deadbeef',
        emoji: '🍼',
        text: 'Mia fussed at 3am',
        source: 'x',
        tone: 'feed',
      },
    ],
  });
  assert.ok(!/Mia/.test(text), 'no baby name / card freeform text');
  assert.ok(!text.includes('7f3a9b2c'), 'no raw id substring');
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(text), 'no UUID-looking id');
  assert.ok(!/supabase/i.test(text), 'no supabase reference');
  assert.ok(!/eyJ[A-Za-z0-9]/.test(text), 'no JWT-looking key');
  assert.ok(!/https?:\/\//.test(text), 'no URL / external payment link');
  assert.ok(!/\bml\b/i.test(text), 'no feed volumes');
});

check('Y4. buildWeeklyExportText is pure (no react-native / SDK / Pro-state import) and Node-testable', () => {
  assert.ok(!/from ['"]react-native['"]/.test(BUILD_EXPORT_SRC), 'builder imports no react-native');
  assert.ok(/import type/.test(BUILD_EXPORT_SRC), 'builder imports only a type');
  assert.ok(!BUILD_EXPORT_SRC.includes('react-native-purchases'), 'builder never touches the RC SDK');
  assert.ok(!BUILD_EXPORT_SRC.includes('@/lib/revenueCat'), 'builder never imports the Pro purchase service');
  assert.ok(!/\busePro\b/.test(BUILD_EXPORT_SRC), 'builder never reads Pro entitlement state');
  // generatedAt is deterministic (used above without it; pin it here).
  const dated = buildWeeklyExportText(EXPORT_RICH_VM, { generatedAt: new Date('2026-06-30T12:00:00.000Z') });
  assert.ok(dated.includes('2026-06-30'), 'generatedAt renders a deterministic date');
});

check('Y5. shareWeeklyExport wraps the Share API calmly and reuses the pure builder', () => {
  assert.ok(SHARE_EXPORT_SRC.includes('buildWeeklyExportText'), 'reuses the pure builder');
  assert.ok(/Share\.share/.test(SHARE_EXPORT_SRC), 'uses the React Native Share API');
  assert.ok(/catch/.test(SHARE_EXPORT_SRC), 'guards the share call (no crash on dismiss/error)');
  assert.ok(/dismissed/.test(SHARE_EXPORT_SRC), 'treats a dismissed share calmly');
});

check('Y6. ProPreviewCard is Pro-gated: viewModel prop, real export only for Pro, paywall for free', () => {
  assert.ok(/viewModel/.test(PRO_PREVIEW_CARD_SRC), 'accepts a viewModel prop');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes('canExportWeeklyRecap'), 'gates export via canExportWeeklyRecap');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes('isPro'), 'reads the Pro entitlement');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes('shareWeeklyExport'), 'shares via the export helper');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes("track('export_started'"), 'fires export_started');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes("track('export_completed'"), 'fires export_completed');
  // Free (enabled, not entitled) → the gate + paywall, never a real export.
  assert.ok(PRO_PREVIEW_CARD_SRC.includes("track('pro_gate_seen'"), 'free path records the gate');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes('openPaywall('), 'free path opens the paywall');
  // Preview fake-door preserved.
  assert.ok(PRO_PREVIEW_CARD_SRC.includes("track('export_tapped'"), 'preview keeps the export_tapped fake-door');
  assert.ok(PRO_PREVIEW_CARD_SRC.includes("track('upgrade_card_tapped'"), 'preview keeps the upgrade fake-door');
});

check('Y7. InsightsScreen passes the viewModel into ProPreviewCard and keeps the render gates', () => {
  assert.ok(/<ProPreviewCard\s+viewModel=\{viewModel\}/.test(INSIGHTS_SCREEN_SRC), 'passes viewModel');
  assert.ok(INSIGHTS_SCREEN_SRC.includes("getProMode() !== 'off'"), 'renders in preview or enabled');
  assert.ok(/dataDays >= 4/.test(INSIGHTS_SCREEN_SRC), 'keeps the dataDays >= 4 gate');
});

check('Y8. analytics union carries the export events (export_started + export_completed)', () => {
  assert.ok(ANALYTICS_SRC.includes("'export_started'"), 'export_started in the union');
  assert.ok(ANALYTICS_SRC.includes("'export_completed'"), 'export_completed in the union');
});

// Z. Pro Phase 4 — RevenueCat purchases. Verifies the SDK is installed and
// isolated to the service; that proConfig reads keys from env with pro/default
// fallbacks and hardcodes no key; that the service exposes a real purchase/restore
// surface with no Supabase/URL; that ProProvider drives it via useAuth; that the
// PaywallSheet shows real store price strings + a real restore; and that the six
// purchase/restore analytics events exist.

check('Z1. react-native-purchases is installed; the RevenueCat UI SDK is not', () => {
  assert.ok(PKG_JSON_SRC.includes('"react-native-purchases":'), 'react-native-purchases dependency present');
  assert.ok(!PKG_JSON_SRC.includes('react-native-purchases-ui'), 'react-native-purchases-ui must be absent');
});

check('Z2. proConfig reads RevenueCat keys from env, with entitlement=pro / offering=default fallbacks', () => {
  assert.ok(PRO_CONFIG_SRC.includes('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY'), 'reads the iOS key from env');
  assert.ok(PRO_CONFIG_SRC.includes('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY'), 'reads the Android key from env');
  withEnv({ EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID: undefined, EXPO_PUBLIC_REVENUECAT_OFFERING_ID: undefined }, () => {
    assert.equal(getRevenueCatEntitlementId(), 'pro');
    assert.equal(getRevenueCatOfferingId(), 'default');
  });
  withEnv({ EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID: 'premium', EXPO_PUBLIC_REVENUECAT_OFFERING_ID: 'launch' }, () => {
    assert.equal(getRevenueCatEntitlementId(), 'premium');
    assert.equal(getRevenueCatOfferingId(), 'launch');
  });
  withEnv({ EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: undefined }, () => {
    assert.equal(getRevenueCatApiKey('ios'), null);
    assert.equal(hasRevenueCatConfig('ios'), false);
  });
  withEnv({ EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: '  appl_fromEnv  ' }, () => {
    assert.equal(getRevenueCatApiKey('ios'), 'appl_fromEnv'); // trimmed
    assert.equal(hasRevenueCatConfig('ios'), true);
  });
});

check('Z3. no RevenueCat SDK key is hardcoded in source', () => {
  for (const [name, src] of [
    ['proConfig.ts', PRO_CONFIG_SRC],
    ['revenueCat.ts', REVENUECAT_SRC],
  ] as Array<[string, string]>) {
    assert.ok(!/\bappl_[A-Za-z0-9]{6,}/.test(src), `${name} must not hardcode an Apple RevenueCat key`);
    assert.ok(!/\bgoog_[A-Za-z0-9]{6,}/.test(src), `${name} must not hardcode a Google RevenueCat key`);
  }
});

check('Z4. revenueCat.ts is the SDK boundary: real configure/purchase/restore, no Supabase, no URL', () => {
  assert.ok(/from ['"]react-native-purchases['"]/.test(REVENUECAT_SRC), 'the service imports the RC SDK');
  for (const fn of [
    'configureRevenueCat',
    'getRevenueCatCustomerInfo',
    'getRevenueCatOffering',
    'purchaseRevenueCatPackage',
    'restoreRevenueCatPurchases',
    'hasActiveRevenueCatEntitlement',
    'normalizeRevenueCatError',
  ]) {
    assert.ok(REVENUECAT_SRC.includes(fn), `service exports ${fn}`);
  }
  assert.ok(/Purchases\.purchasePackage/.test(REVENUECAT_SRC), 'makes a real purchasePackage call');
  assert.ok(/Purchases\.restorePurchases/.test(REVENUECAT_SRC), 'makes a real restorePurchases call');
  assert.ok(!REVENUECAT_SRC.includes('@/lib/supabase'), 'service writes no Supabase');
  assert.ok(!/https?:\/\//.test(REVENUECAT_SRC), 'service has no external URL');
});

check('Z5. ProProvider exposes real purchase/restore driven by RevenueCat + the auth identity', () => {
  assert.ok(PRO_PROVIDER_SRC.includes('useAuth'), 'uses the signed-in session');
  assert.ok(PRO_PROVIDER_SRC.includes('configureRevenueCat'), 'configures RevenueCat');
  assert.ok(PRO_PROVIDER_SRC.includes('purchasePackage'), 'exposes purchasePackage');
  assert.ok(PRO_PROVIDER_SRC.includes('restorePurchases'), 'exposes restorePurchases');
  assert.ok(
    PRO_PROVIDER_SRC.includes("track('purchase_started'") && PRO_PROVIDER_SRC.includes("track('purchase_completed'"),
    'fires purchase analytics',
  );
  assert.ok(
    PRO_PROVIDER_SRC.includes("track('restore_started'") && PRO_PROVIDER_SRC.includes("track('restore_completed'"),
    'fires restore analytics',
  );
});

check('Z6. PaywallSheet shows real package price strings and a real restore', () => {
  assert.ok(PAYWALL_SHEET_SRC.includes('priceString'), 'renders store price strings (never hardcoded)');
  assert.ok(PAYWALL_SHEET_SRC.includes('purchasePackage'), 'buys via purchasePackage');
  assert.ok(PAYWALL_SHEET_SRC.includes('restorePurchases'), 'restores via restorePurchases (real, not a stub)');
  assert.ok(PAYWALL_SHEET_SRC.includes('packages'), 'lists packages from usePro');
  assert.ok(PAYWALL_SHEET_SRC.includes('canRestore'), 'restore is enabled when configured + signed-in');
});

check('Z7. analytics union has the six purchase/restore events (coarse props only)', () => {
  for (const event of [
    'purchase_started',
    'purchase_completed',
    'purchase_failed',
    'restore_started',
    'restore_completed',
    'restore_failed',
  ]) {
    assert.ok(ANALYTICS_SRC.includes("'" + event + "'"), event + ' present in the union');
  }
});

// ---------------------------------------------------------------------------
// §X. Reassure v2 — triage-first router, night window, recap, content guards.
// The safety property under test: TRIAGE ALWAYS WINS and cannot silently
// regress (X3 behavioral + X13 source-order guard).
// ---------------------------------------------------------------------------

check('X1. red-flag phrases route to triage', () => {
  assert.deepEqual(route('She feels really hot'), { kind: 'triage' });
  assert.deepEqual(route('I think she has a fever'), { kind: 'triage' });
  assert.deepEqual(route('no wet diaper since lunch'), { kind: 'triage' });
});

check('X2. typographic apostrophes are normalized before matching', () => {
  assert.equal(normalizeAsk('She won’t wake'), "she won't wake");
  assert.deepEqual(route('She’s hard to wake'), { kind: 'triage' });
  assert.deepEqual(route('She won’t wake up'), { kind: 'triage' });
});

check('X3. triage overrides topic — red flag + topic trigger in one ask', () => {
  // 'green vomit' is a red flag even though 'vomit' would match the spit-up topic
  assert.deepEqual(route('green vomit after a feed'), { kind: 'triage' });
  // 'gasping' is a red flag even though it contains the gas topic trigger
  assert.deepEqual(route('gasping between feeds'), { kind: 'triage' });
  // sanity: the topic triggers still work when no red flag is present
  assert.deepEqual(route('a little vomit after a feed'), { kind: 'topic', key: 'spitup' });
});

check('X4. every demo chip routes to its expected outcome', () => {
  assert.deepEqual(route('She hiccups after every feed'), { kind: 'topic', key: 'hiccups' });
  assert.deepEqual(route('A little spit-up after feeding'), { kind: 'topic', key: 'spitup' });
  assert.deepEqual(route('Lots of grunting and squirming'), { kind: 'topic', key: 'gas' });
  // Gas & burping now owns burp/belch asks too.
  assert.deepEqual(route('She burps a lot after feeds'), { kind: 'topic', key: 'gas' });
  // Crying & settling now owns "won't stop crying" and "won't settle".
  assert.deepEqual(route("She won't stop crying"), { kind: 'topic', key: 'crying' });
  assert.deepEqual(route("She won't settle at all"), { kind: 'topic', key: 'crying' });
  assert.deepEqual(route('She feels really hot'), { kind: 'triage' });
  assert.deepEqual(route("She's hard to wake"), { kind: 'triage' });
  // Every chip in the fixture routes to a bounded outcome (never throws/empty).
  for (const chip of EXAMPLE_CHIPS) {
    const result = route(chip.ask, { hasLogs: true });
    assert.ok(['topic', 'guide', 'triage', 'oos'].includes(result.kind), `chip "${chip.label}" is bounded`);
    if (chip.flagged) assert.deepEqual(result, { kind: 'triage' }, `flagged chip "${chip.label}" triages`);
  }
});

check('X4b. crying / fussy / settling asks route to the bounded crying topic', () => {
  for (const ask of [
    "she's crying, is this okay",
    'she is crying',
    'baby is crying',
    "she won't stop crying",
    'crying at night',
    'fussy tonight',
    'very fussy',
    'upset and crying',
    'screaming',
    "won't settle",
    "can't soothe her",
  ]) {
    assert.deepEqual(route(ask), { kind: 'topic', key: 'crying' }, `"${ask}" → crying`);
  }
  // Red flags STILL override the crying topic — triage always wins.
  assert.deepEqual(route('crying and hard to wake'), { kind: 'triage' });
  assert.deepEqual(route('crying and trouble breathing'), { kind: 'triage' });
  assert.deepEqual(route('crying and feels hot'), { kind: 'triage' });
  assert.deepEqual(route('crying and blue lips'), { kind: 'triage' });
  // Truly unrelated asks still get the bounded decline.
  assert.deepEqual(route('which stroller should I buy'), { kind: 'oos' });
});

check('X4c. burping / belching / wind-after-feeds asks route to the bounded gas topic', () => {
  for (const ask of [
    "she's burping",
    'baby is burping a lot',
    'burping after feeds',
    'needs to burp',
    'belching',
    'belching after a feed',
    'lots of wind after feeds',
  ]) {
    assert.deepEqual(route(ask), { kind: 'topic', key: 'gas' }, `"${ask}" → gas`);
  }
  // Red flags STILL override the gas topic — triage always wins.
  assert.deepEqual(route('burping and trouble breathing'), { kind: 'triage' });
  assert.deepEqual(route('burping and blue lips'), { kind: 'triage' });
  assert.deepEqual(route('burping and hard to wake'), { kind: 'triage' });
  // Truly unrelated asks still get the bounded decline.
  assert.deepEqual(route('which stroller should I buy'), { kind: 'oos' });
});

check('X4d. classifyScope buckets non-red-flag parent asks deterministically (v1.5)', () => {
  // scope classifier is pure keyword code — never triage, never an LLM.
  assert.equal(classifyScope('is she eating enough'), 'feeding_tracking');
  assert.equal(classifyScope('how often should she feed'), 'feeding_tracking');
  assert.equal(classifyScope('how many wet diapers is normal'), 'diaper_tracking');
  assert.equal(classifyScope('poop is green'), 'diaper_tracking');
  assert.equal(classifyScope('what should i log this as'), 'app_logging_help');
  assert.equal(classifyScope('how do i track a feed'), 'app_logging_help');
  assert.equal(classifyScope("i'm exhausted"), 'parent_support');
  assert.equal(classifyScope('i feel overwhelmed'), 'parent_support');
  assert.equal(classifyScope('is this normal'), 'baby_comfort');
  assert.equal(classifyScope('which stroller should i buy'), 'out_of_scope');
  // logs_summary needs data to point at — otherwise it is out of scope.
  assert.equal(classifyScope('how many feeds tonight', { hasLogs: true }), 'logs_summary');
  assert.equal(classifyScope('how many feeds tonight', { hasLogs: false }), 'out_of_scope');
  // A "how many … is normal" ask is guidance, not a read-back of my own logs.
  assert.equal(classifyScope('how many naps is normal', { hasLogs: true }), 'sleep_tracking');
});

check('X4e. broader parent-experience asks route to bounded local outcomes (no longer oos)', () => {
  // Common parent-experience asks that used to fall into oos now resolve.
  assert.deepEqual(route('is she eating enough'), { kind: 'topic', key: 'feeding' });
  assert.deepEqual(route('how often should she feed'), { kind: 'topic', key: 'feeding' });
  assert.deepEqual(route('how many wet diapers is normal'), { kind: 'topic', key: 'diaper' });
  assert.deepEqual(route('poop is green'), { kind: 'topic', key: 'diaper' });
  assert.deepEqual(route('what should i log this as'), { kind: 'guide', key: 'app_logging_help' });
  assert.deepEqual(route("i'm exhausted"), { kind: 'guide', key: 'parent_support' });
  // logs_summary is grounded: guide only when there is saved data to point at.
  assert.deepEqual(route('how many feeds tonight', { hasLogs: true }), { kind: 'guide', key: 'logs_summary' });
  assert.deepEqual(route('how many feeds tonight', { hasLogs: false }), { kind: 'oos' });
  // None of the common parent asks are oos anymore (with data present).
  for (const ask of [
    'is she eating enough',
    'how often should she feed',
    'how many wet diapers is normal',
    'what should i log this as',
    "i'm exhausted",
    'how many feeds tonight',
  ]) {
    assert.notEqual(route(ask, { hasLogs: true }).kind, 'oos', `"${ask}" is no longer oos`);
  }
  // A general baby worry with no curated topic stays a bounded decline (future: AI).
  assert.deepEqual(route('is this normal'), { kind: 'oos' });
  // Genuinely unrelated asks are still declined.
  for (const ask of ['which stroller should i buy', 'what is the weather', 'book a flight']) {
    assert.deepEqual(route(ask, { hasLogs: true }), { kind: 'oos' }, `"${ask}" stays oos`);
  }
});

check('X4f. red flags override every broader scope — triage always wins', () => {
  // Triage is decided in code BEFORE classifyScope is ever consulted.
  assert.deepEqual(route('exhausted and no wet diaper'), { kind: 'triage' });
  assert.deepEqual(route('how many feeds but she has a fever'), { kind: 'triage' });
  assert.deepEqual(route('what should i log for her temperature'), { kind: 'triage' });
  assert.deepEqual(route('is she eating enough, she seems limp'), { kind: 'triage' });
});

check('X4g. guides are bounded and NON-medical (parent support never poses as advice)', () => {
  assert.deepEqual(Object.keys(GUIDES).sort(), ['app_logging_help', 'logs_summary', 'parent_support']);
  for (const key of Object.keys(GUIDES) as (keyof typeof GUIDES)[]) {
    const guide = GUIDES[key];
    // A guide is NOT a medical KB card — it carries no normal/helps/call blocks.
    assert.ok(!('normal' in guide) && !('helps' in guide) && !('call' in guide), `${key} has no medical blocks`);
    // Non-medical tags only.
    assert.ok(['App help', 'Support', 'Your logs'].includes(guide.tag), `${key} tag is non-medical`);
    assert.ok(guide.line.length > 0 && guide.body.length > 0, `${key} has copy`);
  }
  // Parent support explicitly disclaims medical advice and points to a real person.
  const support = GUIDES.parent_support.body.toLowerCase();
  assert.ok(support.includes('medical advice'), 'parent support disclaims medical advice');
  assert.ok(support.includes('doctor') || support.includes('support line'), 'parent support points to a real person');
});

check('X5. every KB topic is routable by its own title and listed in TOPIC_ORDER', () => {
  for (const key of TOPIC_ORDER) {
    const result = route(KB[key].title);
    assert.deepEqual(result, { kind: 'topic', key }, `KB title "${KB[key].title}" routes to ${key}`);
  }
  assert.equal(TOPIC_ORDER.length, Object.keys(KB).length, 'TOPIC_ORDER covers every KB topic');
});

check('X6. out-of-scope asks get the bounded decline (incl. empty input)', () => {
  assert.deepEqual(route('what stroller should I buy'), { kind: 'oos' });
  assert.deepEqual(route(''), { kind: 'oos' });
  assert.deepEqual(route('   '), { kind: 'oos' });
});

check('X7. matchesRedFlag expects normalized input and REDFLAGS is lowercase-only', () => {
  for (const flag of REDFLAGS) {
    assert.equal(flag, flag.toLowerCase(), `red flag "${flag}" is lowercase`);
    assert.ok(!/[‘’]/.test(flag), `red flag "${flag}" uses straight apostrophes`);
  }
  assert.ok(matchesRedFlag("she won't wake"), 'matches on normalized text');
});

check('X8. current context: live-night, daytime context, and finished-night boundaries', () => {
  const at = (h: number, min = 0) => new Date(2026, 5, 30, h, min).getTime(); // June 30 2026, local
  // 19:00 → tonight, from today 18:00
  let w = currentContextWindowFor(at(19));
  assert.equal(w.label, 'tonight');
  assert.equal(w.startMs, new Date(2026, 5, 30, NIGHT_RECAP_START_HOUR).getTime());
  assert.equal(w.endMs, at(19));
  // 02:00 → tonight, from YESTERDAY 18:00
  w = currentContextWindowFor(at(2));
  assert.equal(w.label, 'tonight');
  assert.equal(w.startMs, new Date(2026, 5, 29, NIGHT_RECAP_START_HOUR).getTime());
  // 14:00 → current daytime context, from today 10:00
  w = currentContextWindowFor(at(14));
  assert.equal(w.label, 'today');
  assert.equal(w.startMs, new Date(2026, 5, 30, DAY_CONTEXT_START_HOUR).getTime());
  assert.equal(w.endMs, at(14));
  // boundaries for the screen's default current context
  assert.equal(currentContextWindowFor(at(17, 59)).label, 'today');
  assert.equal(currentContextWindowFor(at(18, 0)).label, 'tonight');
  assert.equal(currentContextWindowFor(at(9, 59)).label, 'tonight');
  assert.equal(currentContextWindowFor(at(10, 0)).label, 'today');
  // intentional morning recap still exists as a finished-night helper
  const finished = nightWindowFor(at(14));
  assert.equal(finished.label, 'last-night');
  assert.equal(finished.startMs, new Date(2026, 5, 29, NIGHT_RECAP_START_HOUR).getTime());
  assert.equal(finished.endMs, new Date(2026, 5, 30, NIGHT_RECAP_END_HOUR).getTime());
});

// Recap fixtures — a deterministic 2am "tonight" scenario.
const RX_NOW = new Date(2026, 5, 30, 2, 0).getTime();
const rxIso = (h: number, dayOffset = 0, min = 0) =>
  new Date(2026, 5, 29 + dayOffset, h, min).toISOString();
let rxSeq = 0;
const rxBase = (
  type: CareEvent['type'],
  occurredAt: string,
  over: Partial<CareEventBase> = {},
): CareEventBase => ({
  id: `rx-${(rxSeq += 1)}`,
  clientEventId: `rx-cid-${rxSeq}`,
  familyId: 'rx-baby',
  childId: 'rx-baby',
  createdByUserId: 'rx-cg',
  type,
  status: 'completed',
  occurredAt,
  startedAt: null,
  endedAt: null,
  timezoneOffsetMinutes: 0,
  createdAt: occurredAt,
  updatedAt: occurredAt,
  syncStatus: 'local',
  version: 1,
  ...over,
});
const rxFeed = (at: string): BottleFeedEvent => ({
  ...rxBase('feed', at),
  type: 'feed',
  childId: 'rx-baby',
  status: 'completed',
  method: 'bottle',
  details: { amountMl: 90, milkType: 'formula' },
});
const rxDiaper = (at: string): DiaperEvent => ({
  ...rxBase('diaper', at),
  type: 'diaper',
  childId: 'rx-baby',
  status: 'completed',
  details: { kind: 'wet' },
});
const rxNote = (at: string, noteType: NoteEvent['details']['noteType'], label: string): NoteEvent => ({
  ...rxBase('note', at),
  type: 'note',
  childId: 'rx-baby',
  status: 'completed',
  details: { noteType, label },
});
const rxPump = (at: string): PumpEvent => ({
  ...rxBase('pump', at, { childId: null, startedAt: at, endedAt: at }),
  type: 'pump',
  childId: null,
  subjectUserId: 'rx-cg',
  status: 'completed',
  details: { side: 'left', leftVolumeMl: 40, rightVolumeMl: null },
});
const rxSleep = (startedAt: string, endedAt: string | null = null): SleepEvent => ({
  ...rxBase('sleep', startedAt, {
    status: endedAt === null ? 'active' : 'completed',
    startedAt,
    endedAt,
    updatedAt: endedAt ?? startedAt,
  }),
  type: 'sleep',
  childId: 'rx-baby',
  status: endedAt === null ? 'active' : 'completed',
  details: { sleepType: 'night' },
});

check('X9. recap counts spit-up notes separately from other notes', () => {
  const recap = buildReassureRecap(
    [
      rxNote(rxIso(22), 'spit_up', SPITUP_NOTE_LABEL),
      rxNote(rxIso(23), 'spit_up', SPITUP_NOTE_LABEL),
      rxNote(rxIso(21), 'general', 'Fussy'),
      rxFeed(rxIso(20)),
    ],
    RX_NOW,
  );
  assert.equal(recap.spitUpCount, 2);
  assert.equal(recap.otherNoteCount, 1);
  assert.equal(recap.feedCount, 1);
  assert.equal(recap.isEmpty, false);
});

check('X10. events outside the night window are excluded', () => {
  const recap = buildReassureRecap(
    [
      rxFeed(rxIso(12)), // yesterday noon — before 18:00 open
      rxDiaper(rxIso(15)), // yesterday afternoon
      rxFeed(rxIso(19)), // in window
      rxFeed(rxIso(3, 1)), // "today" 3am but AFTER now (02:00) — excluded
    ],
    RX_NOW,
  );
  assert.equal(recap.feedCount, 1);
  assert.equal(recap.diaperCount, 0);
});

check('X10b. Reassure ignores caregiver-owned pump events in every recap context', () => {
  const dayNow = new Date(2026, 5, 30, 14, 0).getTime();
  const recaps = [
    buildReassureRecap([rxPump(rxIso(20))], RX_NOW),
    buildReassureRecap([rxPump(rxIso(13, 1))], dayNow),
    buildReassureRecap([rxPump(rxIso(20))], dayNow, nightWindowFor(dayNow)),
  ];
  for (const recap of recaps) {
    assert.equal(recap.isEmpty, true);
    assert.equal(recap.feedCount, 0);
    assert.equal(recap.diaperCount, 0);
    assert.equal(recap.spitUpCount, 0);
  }
});

check('X11. sleeps overlapping the window count; a running sleep is flagged', () => {
  const overlapping = buildReassureRecap(
    // began 17:30 (before the window opened) and ended 19:10 inside it
    [rxSleep(rxIso(17, 0, 30), rxIso(19, 0, 10))],
    RX_NOW,
  );
  assert.equal(overlapping.isEmpty, false);
  assert.equal(overlapping.longestSleepMin, 100);
  assert.equal(overlapping.sleepRunning, false);

  const running = buildReassureRecap([rxSleep(rxIso(23))], RX_NOW);
  assert.equal(running.sleepRunning, true);
  assert.equal(running.isEmpty, false);
});

check('X11b. canonical feed/diaper/sleep/spit-up fixture counts, while pump is ignored', () => {
  const recap = buildReassureRecap(
    [
      rxFeed(rxIso(20)),
      rxDiaper(rxIso(21)),
      rxSleep(rxIso(22), rxIso(22, 0, 40)),
      rxNote(rxIso(23), 'spit_up', SPITUP_NOTE_LABEL),
      rxPump(rxIso(23, 0, 30)),
    ],
    RX_NOW,
  );
  assert.equal(recap.feedCount, 1);
  assert.equal(recap.diaperCount, 1);
  assert.equal(recap.longestSleepMin, 40);
  assert.equal(recap.spitUpCount, 1);
  assert.equal(recap.isEmpty, false);
});

check('X11c. local ask workflow outcomes cover typed topic, triage chip, and unknown ask', () => {
  assert.deepEqual(route('She hiccups after every feed'), { kind: 'topic', key: 'hiccups' });
  const triageChips = EXAMPLE_CHIPS.filter((chip) => chip.flagged);
  assert.ok(triageChips.length > 0, 'fixture has red triage chips');
  for (const chip of triageChips) {
    assert.deepEqual(route(chip.ask), { kind: 'triage' }, `${chip.label} routes to triage`);
  }
  assert.deepEqual(route('what stroller should I buy'), { kind: 'oos' });
});

check('X11d. recap wording uses current context unless a finished night is requested', () => {
  const live = buildReassureRecap([], RX_NOW);
  assert.equal(live.window.label, 'tonight');
  assert.equal(recapHeading(live), "Based on tonight's logs");
  assert.equal(recapWindowLabel(live), 'Since 6pm');
  assert.match(recapReadText(live), /^Since 6pm/);
  assert.doesNotMatch(recapReadText(live), /last night's logs/i);

  const dayNow = new Date(2026, 5, 30, 14, 0).getTime();
  const daytime = buildReassureRecap(
    [
      rxFeed(rxIso(11, 1)),
      rxDiaper(rxIso(12, 1)),
      rxSleep(rxIso(9, 1)), // active sleep overlaps the 10am-current daytime context
      rxPump(rxIso(13, 1)),
    ],
    dayNow,
  );
  assert.equal(daytime.window.label, 'today');
  assert.equal(recapHeading(daytime), "Today's context");
  assert.equal(recapWindowLabel(daytime), 'Since 10am');
  assert.match(recapReadText(daytime), /^Since 10am/);
  assert.equal(daytime.feedCount, 1);
  assert.equal(daytime.diaperCount, 1);
  assert.equal(daytime.sleepRunning, true);
  assert.equal(daytime.isEmpty, false);

  const morning = buildReassureRecap([], dayNow, nightWindowFor(dayNow));
  assert.equal(morning.window.label, 'last-night');
  assert.equal(recapHeading(morning), 'Morning recap');
  assert.equal(recapWindowLabel(morning), 'Morning recap');
  assert.doesNotMatch(recapReadText(morning), /last night's logs/i);
});

// Shared AI-layer modules (Deno-side, import-free by design so Node can
// require() them) — the smoke runner exercises the ACTUAL values and guardrail
// both edge functions deploy with. Same pattern as the §X17 content mirror.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RX_LLM = require('../supabase/functions/_shared/reassureLlm') as {
  REASSURE_DEFAULT_MODEL: string;
  REASSURE_TEMPERATURE: number;
  LLM_TIMEOUT_MS: number;
  LLM_MAX_RETRIES: number;
  NIGHT_READ_MAX_TOKENS: number;
  TOPIC_POLISH_MAX_TOKENS: number;
  NIGHT_READ_MAX_CHARS: number;
  TOPIC_POLISH_MAX_CHARS: number;
  JUDGEMENT_VOCAB: readonly string[];
  judgementVocabRegex: () => RegExp;
  validateLlmOutput: (
    raw: string,
    key: string,
    opts: { maxChars: number; sourceText?: string },
  ) => { ok: true; value: string } | { ok: false; reason: 'parse' | 'length' | 'vocab' };
  classifyLlmError: (error: unknown) => 'timeout' | 'api_error';
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RX_AUDIT = require('../supabase/functions/_shared/reassureAudit') as {
  AUDIT_PARENT_TEXT_MAX_CHARS: number;
  minimizeParentTextForAudit: (text: string) => { preview: string; length: number };
  usageOf: (response: unknown) => Record<string, unknown>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RX_CORE = require('../supabase/functions/reassure-night-read/nightReadCore') as {
  SPITUP_NOTE_LABEL: string;
  windowFor: (
    nightKey: string,
    tzOffsetMinutes: number,
    nowMs: number,
  ) => { startMs: number; endMs: number };
  computeTallies: (
    rows: unknown[],
    startMs: number,
    endMs: number,
  ) => {
    feeds: number;
    diapers: number;
    spitUps: number;
    longestSleepMin: number | null;
    sleepRunning: boolean;
  };
  ageBandFromBirthDate: (birthDate: string | null, nowMs: number) => string;
  buildPromptFacts: (tallies: unknown, ageBand: string) => string;
};

check('X12. recapReadText stays strictly descriptive — no judgement vocabulary', () => {
  // The register guard now lives in the SHARED vocabulary the edge functions'
  // output guardrail uses — one list for local copy and LLM output alike.
  for (const word of ['normal', 'abnormal', 'healthy', 'fine', 'typical', 'okay', 'ok']) {
    assert.ok(RX_LLM.JUDGEMENT_VOCAB.includes(word), `shared vocab covers "${word}"`);
  }
  const samples = [
    buildReassureRecap([], RX_NOW),
    buildReassureRecap(
      [
        rxFeed(rxIso(20)),
        rxFeed(rxIso(23)),
        rxDiaper(rxIso(22)),
        rxNote(rxIso(22, 0, 30), 'spit_up', SPITUP_NOTE_LABEL),
        rxSleep(rxIso(21), rxIso(21, 0, 40)),
      ],
      RX_NOW,
    ),
    buildReassureRecap([rxSleep(rxIso(23))], RX_NOW),
  ];
  for (const recap of samples) {
    const text = recapReadText(recap);
    assert.ok(text.length > 0, 'read text is non-empty');
    // fresh regex per sample — the shared regex carries the 'g' flag
    assert.ok(!RX_LLM.judgementVocabRegex().test(text), `descriptive register only, got: "${text}"`);
  }
});

// Source-scan guards — structural invariants on the reassure feature files.
const RX_ROUTER_SRC = readFileSync(
  new URL('../src/features/reassure/domain/router.ts', import.meta.url),
  'utf8',
);
const RX_DOMAIN_SRCS: Record<string, string> = Object.fromEntries(
  [
    'domain/types.ts',
    'domain/redflags.ts',
    'domain/router.ts',
    'domain/scope.ts',
    'domain/voiceTranscript.ts',
    'domain/nightWindow.ts',
    'domain/recap.ts',
    'content/kb.ts',
  ].map((rel) => [
    rel,
    readFileSync(new URL(`../src/features/reassure/${rel}`, import.meta.url), 'utf8'),
  ]),
);

check('X13. router source: the red-flag check precedes the first topic regex', () => {
  const triageIx = RX_ROUTER_SRC.indexOf('matchesRedFlag(t)');
  const firstTopicIx = RX_ROUTER_SRC.indexOf('/hiccup/');
  assert.ok(triageIx > -1, 'router calls matchesRedFlag');
  assert.ok(firstTopicIx > -1, 'router has the topic regexes');
  assert.ok(triageIx < firstTopicIx, 'triage check comes FIRST — triage always wins');
});

check('X14. reassure domain/content are pure leaves (no RN, no Pro, no speech, no LLM)', () => {
  for (const [rel, src] of Object.entries(RX_DOMAIN_SRCS)) {
    assert.ok(!/from 'react/.test(src), `${rel} does not import react/react-native`);
    assert.ok(!src.includes('expo-'), `${rel} does not import expo modules`);
    assert.ok(!src.includes('proGates') && !src.includes('proConfig') && !src.includes('ProProvider'),
      `${rel} never touches Pro gating — safety is structurally unpaywallable`);
    assert.ok(!/from '(@anthropic-ai|@supabase|@\/lib\/supabase)/.test(src),
      `${rel} never imports the LLM or backend clients`);
    // Only type-only imports may reach outside the feature folder.
    for (const line of src.split('\n')) {
      if (/^import .*from '@\//.test(line)) {
        assert.ok(line.startsWith('import type'), `${rel}: '@/' imports must be type-only (${line.trim()})`);
      }
    }
  }
  for (const rel of ['domain/redflags.ts'] as const) {
    assert.ok(!/from '@\//.test(RX_DOMAIN_SRCS[rel]), `${rel} has zero app imports (Deno-mirrorable)`);
  }
});

check('X16. the Tonight note sheet offers the Spit-up preset via the shared constant', () => {
  const tonightSrc = readFileSync(new URL('../src/app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.ok(
    tonightSrc.includes('SPITUP_NOTE_LABEL'),
    'index.tsx uses SPITUP_NOTE_LABEL (never a drifting string literal)',
  );
  assert.ok(
    tonightSrc.includes("from '@/features/reassure/domain/recap'"),
    'the constant is imported from the recap domain, the single source of truth',
  );
  assert.ok(
    tonightSrc.includes("noteType: key === SPITUP_NOTE_LABEL ? 'spit_up' : 'general'"),
    'the Tonight note sheet saves a stable noteType, not only display copy',
  );
});

check('X15. clinician-review metadata is present, well-formed, and honest', () => {
  assert.ok(REASSURE_CONTENT.version.length > 0, 'content is versioned');
  assert.ok(['draft', 'approved'].includes(REASSURE_CONTENT.status), 'status is draft|approved');
  if (REASSURE_CONTENT.status === 'approved') {
    assert.ok(REASSURE_CONTENT.reviewedBy && REASSURE_CONTENT.reviewedAt, 'approved content names its reviewer');
  }
  // Placeholder tagging must survive until a clinician signs off.
  if (REASSURE_CONTENT.status === 'draft') {
    assert.ok(RX_DOMAIN_SRCS['content/kb.ts'].includes('PLACEHOLDER'), 'kb.ts carries the placeholder tag');
    assert.ok(RX_DOMAIN_SRCS['domain/redflags.ts'].includes('PLACEHOLDER'), 'redflags.ts carries the placeholder tag');
  }
});

check('X17. the edge-function content mirror has not drifted from the app modules', () => {
  // The Supabase functions can't import across the tree (Deno needs .ts
  // extensions and knows nothing about '@/'), so they carry a hand-mirrored
  // copy of the triage list + KB. This deep-equal is the drift tripwire: it
  // imports BOTH copies and compares VALUES, not text.
  //
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mirror = require('../supabase/functions/_shared/reassureContent') as {
    REDFLAGS: readonly string[];
    KB: unknown;
    normalizeAsk: (text: string) => string;
  };
  assert.deepEqual([...mirror.REDFLAGS], [...REDFLAGS], 'REDFLAGS identical on both sides');
  assert.deepEqual(mirror.KB, KB, 'KB identical on both sides');
  assert.equal(
    mirror.normalizeAsk("She WON’T wake"),
    normalizeAsk("She WON’T wake"),
    'normalization identical on both sides',
  );
});

check('X17b. Reassure RN workflow wires every local entry point into the answer path', () => {
  assert.ok(REASSURE_SCREEN_SRC.includes('const ask = useCallback'), 'screen owns one shared ask funnel');
  assert.ok(REASSURE_SCREEN_SRC.includes('const result = route(trimmed'), 'shared ask calls route() locally');
  assert.ok(REASSURE_SCREEN_SRC.includes('<AskCard') && REASSURE_SCREEN_SRC.includes('onAsk={ask}'),
    'typed ask and chips receive the shared ask funnel');
  assert.ok(TOPIC_ACCORDION_SRC.includes('Ask about ${topic.title.toLowerCase()}'), 'topic cards expose a specific answer-card CTA');
  assert.ok(REASSURE_SCREEN_SRC.includes('onAskTopic') && REASSURE_SCREEN_SRC.includes("ask(KB[key].title, 'chip')"),
    'topic CTA reuses the same ask path');
  assert.ok(REASSURE_SCREEN_SRC.includes('reassure-answer-scroll-target'), 'answer scroll target exists');
  assert.ok(REASSURE_SCREEN_SRC.includes('scrollToAnswer') && REASSURE_SCREEN_SRC.includes('scrollRef.current?.scrollTo'),
    'answer card is scrolled into view after render');
  assert.ok(ASK_CARD_SRC.includes('<Pressable') && ASK_CARD_SRC.includes("onAsk(chip.ask, 'chip')"),
    'chips are rendered as pressable controls');
  assert.ok(ASK_CARD_SRC.includes('borderRadius: radii.pill') && ASK_CARD_SRC.includes('minHeight: 36'),
    'chips carry clear pill-button styling');
});

check('X17c. voice fallback states are explicit and unavailable voice focuses the text input', () => {
  assert.doesNotThrow(() => isSpeechAvailable(), 'speech availability probe is non-throwing under Node/dev builds');
  assert.equal(classifyVoiceRecognitionError('no-speech'), 'no_match');
  assert.equal(classifyVoiceRecognitionError('no_match'), 'no_match');
  assert.equal(classifyVoiceRecognitionError('speech timeout'), 'no_match');
  assert.equal(classifyVoiceRecognitionError('network'), 'error');
  for (const term of [
    'hiccups',
    'spit-up',
    'spit up',
    'grunting',
    'squirming',
    "won't settle",
    'hard to wake',
    'feels hot',
    'temperature',
    'trouble breathing',
    'green vomit',
    'feed',
    'bottle',
    'breastfeed',
    'diaper',
    'gas',
    'burp',
    'burping',
    'belching',
    'sleep',
    'awake',
  ]) {
    assert.ok(REASSURE_VOICE_CONTEXTUAL_STRINGS.includes(term), `voice context includes "${term}"`);
  }
  assert.equal(normalizeVoiceTranscript('hick ups'), 'hiccups');
  assert.equal(normalizeVoiceTranscript('burping'), 'burp');
  assert.equal(normalizeVoiceTranscript('burping after feeding'), 'burp after feed');
  assert.equal(normalizeVoiceTranscript('hic up'), 'hiccup');
  assert.equal(normalizeVoiceTranscript('spit out'), 'spit up');
  assert.equal(normalizeVoiceTranscript('spit app'), 'spit up');
  assert.equal(normalizeVoiceTranscript('hard awake'), 'hard to wake');
  assert.equal(normalizeVoiceTranscript('heart awake'), 'hard to wake');
  assert.equal(normalizeVoiceTranscript('wont settle'), "won't settle");
  assert.equal(normalizeVoiceTranscript('not waking'), 'hard to wake');
  assert.equal(
    selectVoiceTranscriptCandidate([
      { transcript: 'what stroller should I buy', confidence: 0.96 },
      { transcript: 'hick ups after feed', confidence: 0.61 },
    ])?.route.kind,
    'topic',
  );
  assert.equal(
    selectVoiceTranscriptCandidate([
      { transcript: 'hiccups after feed', confidence: 0.99 },
      { transcript: 'heart awake', confidence: 0.2 },
    ])?.route.kind,
    'triage',
  );
  assert.equal(resolveVoiceTranscript([], [{ transcript: 'quiet hick ups', confidence: 0.5 }])?.transcript, 'quiet hiccups');
  assert.equal(resolveVoiceTranscript([{ transcript: 'final hiccups', confidence: 0.4 }], [{ transcript: 'quiet hiccups', confidence: 0.9 }])?.transcript, 'final hiccups');
  assert.equal(resolveVoiceTranscript('', ''), null);
  assert.equal(nextLowVolumeSampleCount(0, -1), 1);
  assert.equal(nextLowVolumeSampleCount(3, -0.2), 4);
  assert.equal(nextLowVolumeSampleCount(3, 1), 0);
  assert.equal(shouldShowLowVolumeHint(3), false);
  assert.equal(shouldShowLowVolumeHint(4), true);
  for (const label of [
    'Tap to talk',
    'Listening...',
    'Voice unavailable',
    'Enable microphone',
    "Didn't catch that",
    'Try again',
  ]) {
    assert.ok(VOICE_ORB_SRC.includes(label), `VoiceOrb contains "${label}"`);
  }
  assert.ok(!VOICE_ORB_SRC.includes('One moment'), 'voice orb does not show the vague pending label');
  assert.ok(VOICE_ORB_SRC.includes('MicOffIcon') && !VOICE_ORB_SRC.includes('KeyboardIcon'),
    'degraded orb uses a mic-off icon, not a keyboard glyph');
  assert.ok(USE_VOICE_INPUT_SRC.includes("'no_match'"), 'no-speech has its own retryable state');
  assert.ok(USE_VOICE_INPUT_SRC.includes("'permission_denied'"), 'permission denial has its own state');
  assert.ok(USE_VOICE_INPUT_SRC.includes("'error'"), 'speech capture failure has its own state');
  assert.ok(USE_VOICE_INPUT_SRC.includes("settle('no_match')"), 'empty transcript settles as no_match, not unavailable');
  assert.ok(USE_VOICE_INPUT_SRC.includes('retry: () => void') && USE_VOICE_INPUT_SRC.includes('startAttempt'),
    'hook exposes retry and uses one safe start path');
  assert.ok(USE_VOICE_INPUT_SRC.includes('cleanupActiveSession()') && USE_VOICE_INPUT_SRC.includes('sessionRef.current?.abort()'),
    'active speech session/listeners are cleaned before retry and on teardown');
  assert.ok(USE_VOICE_INPUT_SRC.includes('onVolumeChange') && USE_VOICE_INPUT_SRC.includes('setVolumeHint'),
    'low volume only sets a hint in the hook');
  assert.ok(
    USE_VOICE_INPUT_SRC.includes('Try speaking a little closer') &&
      REASSURE_SCREEN_SRC.includes('voice.volumeHint'),
    'low-volume hint is visible but subtle',
  );
  assert.ok(USE_VOICE_INPUT_SRC.includes("state === 'unavailable' || state === 'permission_denied'"),
    'only unavailable/permission states block orb retry');
  assert.ok(SPEECH_SRC.includes('maxAlternatives: REASSURE_VOICE_MAX_ALTERNATIVES'), 'speech asks for multiple alternatives');
  assert.ok(SPEECH_SRC.includes('contextualStrings: REASSURE_VOICE_CONTEXTUAL_STRINGS'), 'speech passes Reassure context strings');
  assert.ok(SPEECH_SRC.includes("EXTRA_LANGUAGE_MODEL: 'web_search'"), 'Android uses web_search language model');
  assert.ok(SPEECH_SRC.includes('EXTRA_MASK_OFFENSIVE_WORDS: false'), 'Android does not mask safety phrases');
  assert.ok(SPEECH_SRC.includes('EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS'), 'Android complete silence length is set');
  assert.ok(SPEECH_SRC.includes("mod.addListener('volumechange'"), 'speech listens for optional volume events');
  assert.ok(REASSURE_SCREEN_SRC.includes("onTranscript: (text) => ask(text, 'voice')"),
    'successful transcript feeds the same local ask path');
  assert.ok(REASSURE_SCREEN_SRC.includes("source === 'text' || source === 'voice'"),
    'voice submit dismisses the keyboard like typed ask');
  assert.ok(REASSURE_SCREEN_SRC.includes('focusAskInputWithHint'), 'unavailable voice focuses text input with a hint');
  assert.ok(REASSURE_SCREEN_SRC.includes('inputRef.current?.focus()'), 'text input receives focus');
  assert.ok(REASSURE_SCREEN_SRC.includes('Voice is unavailable in this build'), 'unavailable build hint is visible');
  assert.ok(REASSURE_SCREEN_SRC.includes('Open Settings') && REASSURE_SCREEN_SRC.includes('Type instead'),
    'permission/unavailable states expose explicit non-voice actions');
  assert.ok(REASSURE_SCREEN_SRC.includes('Try again') && REASSURE_SCREEN_SRC.includes('voice.retry()'),
    'no_match/error expose an explicit voice retry action');
  assert.ok(REASSURE_SCREEN_SRC.includes("voiceFallback.kind === 'retryable'"),
    'retryable voice failures are distinct from permission denial');
  assert.ok(REASSURE_SCREEN_SRC.includes('Linking.openSettings()'), 'Open Settings action reaches OS settings');
});

check('X17d. Reassure keyboard/tabbar structure keeps send, chips, and answers reachable', () => {
  assert.ok(REASSURE_SCREEN_SRC.includes('KeyboardAvoidingView'), 'Reassure is keyboard-aware');
  assert.ok(REASSURE_SCREEN_SRC.includes('Keyboard.dismiss()'), 'typed ask dismisses the keyboard on submit');
  assert.ok(REASSURE_SCREEN_SRC.includes("source === 'text' ? 260 : 120"), 'typed ask scroll waits for keyboard/layout settle');
  assert.ok(REASSURE_SCREEN_SRC.includes('keyboardShouldPersistTaps="handled"'), 'send stays tappable while keyboard is open');
  assert.ok(REASSURE_SCREEN_SRC.includes('REASSURE_TABBAR_EXTRA_CLEARANCE'), 'Reassure has named tabbar clearance');
  assert.ok(REASSURE_SCREEN_SRC.includes('tabbar.height + 64'), 'Reassure bottom clearance accounts for tabbar height plus extra space');
  assert.ok(SCREEN_SRC.includes('StatusBar.currentHeight') && SCREEN_SRC.includes('topInset'),
    'Screen protects Android content from the status bar');
  assert.ok(SCREEN_SRC.includes('keyboardShouldPersistTaps'), 'Screen exposes opt-in keyboard tap behavior');
  assert.ok(LULLABY_TAB_BAR_SRC.includes("Keyboard.addListener('keyboardDidShow'"), 'tabbar observes keyboard open');
  assert.ok(
    LULLABY_TAB_BAR_SRC.includes("activeRouteName === 'reassure' && keyboardVisible"),
    'tabbar hides only for Reassure while the keyboard is visible',
  );
});

check('X17e. Reassure recap title uses active-window wording', () => {
  assert.ok(REASSURE_SCREEN_SRC.includes('recapHeading'), 'screen derives a dynamic recap heading');
  assert.ok(REASSURE_SCREEN_SRC.includes('currentContextWindowFor'), 'screen defaults to current context, not finished night');
  assert.ok(RX_DOMAIN_SRCS['domain/recap.ts'].includes("Based on tonight's logs"), 'live window title is explicit');
  assert.ok(RX_DOMAIN_SRCS['domain/recap.ts'].includes("Today's context"), 'daytime context title is explicit');
  assert.ok(RX_DOMAIN_SRCS['domain/recap.ts'].includes('Morning recap'), 'closed morning window title is explicit');
  assert.ok(!REASSURE_SCREEN_SRC.includes("last night's logs"), 'stale lowercase last-night logs copy is absent');
  assert.ok(!REASSURE_SCREEN_SRC.includes('last night’s logs'), 'stale smart-apostrophe last-night logs copy is absent');
});

// ---------------------------------------------------------------------------
// §X (cont.) — the Reassure AI layer (docs/reassure-ai-layer-spec.md).
// X18–X23: the shared output guardrail, the night-read core, pinned model
// config, code-decides-before-model source order, the client contract, and
// audit privacy. The LLM itself is never called here — everything around it
// is exercised for real, and the call site's structure is source-scanned.
// ---------------------------------------------------------------------------

const RX_EDGE_SRCS: Record<string, string> = Object.fromEntries(
  ['reassure-night-read', 'reassure-topic-polish'].map((fn) => [
    fn,
    readFileSync(new URL(`../supabase/functions/${fn}/index.ts`, import.meta.url), 'utf8'),
  ]),
);

check('X18. shared output guardrail: parse → length cap → judgement-vocab gate', () => {
  // Happy path: valid JSON, bounded, descriptive → the read passes through.
  assert.deepEqual(
    RX_LLM.validateLlmOutput(
      JSON.stringify({ read: 'You logged 3 feeds and 2 diaper changes. Longest sleep was 90 minutes.' }),
      'read',
      { maxChars: RX_LLM.NIGHT_READ_MAX_CHARS },
    ),
    { ok: true, value: 'You logged 3 feeds and 2 diaper changes. Longest sleep was 90 minutes.' },
  );
  // Parse failures → fallback: prose, truncation, wrong key/type, blank.
  for (const bad of ['not json at all', '{"read": 42}', '{"other": "text"}', '{"read": "  "}', '{"read":']) {
    const verdict = RX_LLM.validateLlmOutput(bad, 'read', { maxChars: 360 });
    assert.ok(!verdict.ok && verdict.reason === 'parse', `parse-fails: ${bad}`);
  }
  // Runaway output is capped.
  const runaway = RX_LLM.validateLlmOutput(JSON.stringify({ read: 'a'.repeat(400) }), 'read', {
    maxChars: 360,
  });
  assert.ok(!runaway.ok && runaway.reason === 'length', 'over-length output is discarded');
  // Judgement vocabulary the model introduces is a blocked medical claim —
  // the night read has no source text, so ANY judgement word trips it.
  for (const text of [
    'That is a totally normal night.',
    'Nothing concerning here at all.',
    'Baby seems fine and healthy tonight.',
  ]) {
    const verdict = RX_LLM.validateLlmOutput(JSON.stringify({ read: text }), 'read', {
      maxChars: 360,
    });
    assert.ok(!verdict.ok && verdict.reason === 'vocab', `vocab-blocks: ${text}`);
  }
  // …but vocabulary already present in the clinician-owned KB line is NOT a
  // new claim (topic polish rephrases lines that legitimately say "normal").
  const sourceLine = KB.hiccups.line;
  assert.ok(/\bnormal\b/i.test(sourceLine), 'fixture: the hiccups line itself says "normal"');
  const rephrase = RX_LLM.validateLlmOutput(
    JSON.stringify({ line: 'Little hiccups are a normal newborn reflex — very common.' }),
    'line',
    { maxChars: 300, sourceText: sourceLine },
  );
  assert.ok(rephrase.ok, 'source-present vocab passes the semantic-preservation check');
  const smuggled = RX_LLM.validateLlmOutput(
    JSON.stringify({ line: 'Hiccups are normal and totally safe.' }),
    'line',
    { maxChars: 300, sourceText: sourceLine },
  );
  assert.ok(
    !smuggled.ok && smuggled.reason === 'vocab',
    'introduced vocab ("safe") is blocked even alongside sourced words',
  );
  // Thrown SDK errors classify into distinct audit outcomes.
  assert.equal(
    RX_LLM.classifyLlmError({ name: 'APIConnectionTimeoutError', message: 'Request timed out.' }),
    'timeout',
  );
  assert.equal(RX_LLM.classifyLlmError(new Error('overloaded_error')), 'api_error');
});

check('X19. night-read core: tallies → prompt facts, computed in code, red-flag-clean', () => {
  const now = Date.UTC(2026, 5, 30, 2, 0); // 2am UTC, tz offset 0
  const { startMs, endMs } = RX_CORE.windowFor('2026-06-29', 0, now);
  assert.equal(startMs, Date.UTC(2026, 5, 29, 18, 0), 'window opens at local 18:00');
  assert.equal(endMs, now, 'a live window is clamped to now');

  const iso = (h: number, day = 29) => new Date(Date.UTC(2026, 5, day, h, 0)).toISOString();
  const tallies = RX_CORE.computeTallies(
    [
      { type: 'feed', start_at: iso(20), end_at: null, meta: null },
      { type: 'feed', start_at: iso(23), end_at: null, meta: null },
      { type: 'feed', start_at: iso(12), end_at: null, meta: null }, // before the window
      { type: 'diaper', start_at: iso(22), end_at: null, meta: null },
      { type: 'note', start_at: iso(21), end_at: null, meta: { label: RX_CORE.SPITUP_NOTE_LABEL } },
      { type: 'note', start_at: iso(21), end_at: null, meta: { label: 'Fussy' } },
      { type: 'sleep', start_at: iso(17), end_at: iso(19), meta: null }, // overlaps the open
    ],
    startMs,
    endMs,
  );
  assert.deepEqual(tallies, {
    feeds: 2,
    diapers: 1,
    spitUps: 1,
    longestSleepMin: 120,
    sleepRunning: false,
  });

  const facts = RX_CORE.buildPromptFacts(tallies, RX_CORE.ageBandFromBirthDate('2026-06-10', now));
  assert.ok(facts.includes('Age band: 0-4 weeks.'), 'coarse age band only — no birth date');
  assert.ok(facts.includes('Feeds logged: 2.'));
  assert.ok(facts.includes('Longest sleep logged: 120 minutes.'));
  // Belt-and-suspenders invariant: pure-tally prompts never trip triage.
  assert.ok(!matchesRedFlag(normalizeAsk(facts)), 'prompt facts are red-flag-clean');
  // …and the guardrail's vocab gate would pass them straight through.
  assert.ok(!RX_LLM.judgementVocabRegex().test(facts), 'prompt facts carry no judgement vocab');

  const running = RX_CORE.computeTallies(
    [{ type: 'sleep', start_at: iso(23), end_at: null, meta: null }],
    startMs,
    endMs,
  );
  assert.equal(running.sleepRunning, true);
  assert.ok(RX_CORE.buildPromptFacts(running, 'unknown age').includes('A sleep is currently running.'));
});

check('X20. LLM config pinned: Haiku default, temp 0.3, per-job caps, 8s, 0 retries', () => {
  assert.equal(RX_LLM.REASSURE_DEFAULT_MODEL, 'claude-haiku-4-5-20251001');
  assert.equal(RX_LLM.REASSURE_TEMPERATURE, 0.3);
  assert.equal(RX_LLM.LLM_TIMEOUT_MS, 8_000);
  assert.equal(RX_LLM.LLM_MAX_RETRIES, 0);
  assert.ok(RX_LLM.NIGHT_READ_MAX_TOKENS <= 200, 'night read caps at ≤ 200 output tokens');
  assert.ok(RX_LLM.TOPIC_POLISH_MAX_TOKENS <= 120, 'topic polish caps at ≤ 120 output tokens');
  assert.ok(RX_LLM.NIGHT_READ_MAX_CHARS <= 400 && RX_LLM.TOPIC_POLISH_MAX_CHARS <= 400);
  // Both functions must consume the shared config — local literals drift.
  for (const [name, src] of Object.entries(RX_EDGE_SRCS)) {
    assert.ok(src.includes("from '../_shared/reassureLlm.ts'"), `${name} imports the shared LLM config`);
    assert.ok(src.includes('?? REASSURE_DEFAULT_MODEL'), `${name} defaults REASSURE_MODEL to the shared constant`);
    assert.ok(src.includes('temperature: REASSURE_TEMPERATURE'), `${name} sets the shared temperature`);
    assert.ok(src.includes('maxRetries: LLM_MAX_RETRIES'), `${name} disables retries`);
    assert.ok(src.includes('{ timeout: LLM_TIMEOUT_MS }'), `${name} sets the 8s server-side timeout`);
    assert.ok(src.includes("stop_reason === 'refusal'"), `${name} handles the refusal stop reason`);
    assert.ok(!/max_tokens:\s*\d/.test(src), `${name} has no hard-coded max_tokens literal`);
  }
  assert.ok(RX_EDGE_SRCS['reassure-night-read'].includes('max_tokens: NIGHT_READ_MAX_TOKENS'));
  assert.ok(RX_EDGE_SRCS['reassure-topic-polish'].includes('max_tokens: TOPIC_POLISH_MAX_TOKENS'));
});

check('X21. edge source order: code decides BEFORE the model; audits via the shared writer', () => {
  const night = RX_EDGE_SRCS['reassure-night-read'];
  const nightModelIx = night.indexOf('anthropic.messages.create');
  assert.ok(nightModelIx > -1, 'night read calls the model');
  assert.ok(
    night.indexOf("from('reassure_night_reads')") < nightModelIx,
    'cache lookup precedes the model call — the PK is the once-per-night rate limit',
  );
  // call sites, not the import lines at the top of the file
  assert.ok(night.indexOf('computeTallies((') < nightModelIx, 'tallies are computed in code first');
  assert.ok(
    night.indexOf('matchesRedFlag(normalizeAsk(') > -1 &&
      night.indexOf('matchesRedFlag(normalizeAsk(') < nightModelIx,
    'the red-flag scan precedes the model',
  );
  assert.ok(nightModelIx < night.indexOf('validateLlmOutput(block'), 'the output guardrail follows the call');

  const polish = RX_EDGE_SRCS['reassure-topic-polish'];
  const polishModelIx = polish.indexOf('anthropic.messages.create');
  assert.ok(polishModelIx > -1, 'topic polish calls the model');
  assert.ok(
    polish.indexOf('matchesRedFlag(normalizeAsk(') > -1 &&
      polish.indexOf('matchesRedFlag(normalizeAsk(') < polishModelIx,
    'triage scan precedes the model',
  );
  assert.ok(polish.indexOf("kind: 'triage'") < polishModelIx, 'red flag → triage, NO model call');
  assert.ok(polish.indexOf("kind: 'oos'") < polishModelIx, 'unknown topic → oos, NO model call');
  assert.ok(
    polish.indexOf('let line = topic.line') < polishModelIx,
    'the verbatim KB line is pre-seeded — refusal/parse/guardrail failures return it unchanged',
  );
  assert.ok(polish.includes('sourceText: topic.line'), 'the guardrail exempts only KB-sourced vocab');

  for (const [name, src] of Object.entries(RX_EDGE_SRCS)) {
    assert.ok(src.includes('insertReassureAudit'), `${name} audits via the shared writer`);
    assert.ok(!src.includes("from('reassure_audit')"), `${name} never hand-rolls the audit insert`);
    assert.ok(src.includes("'fallback'"), `${name} falls back deterministically`);
  }
});

check('X22. client contract: local read first, 3s ceiling, Pro-gated; topic polish stays DARK', () => {
  // Non-Pro users render the local read — the gate is pure and closed.
  assert.equal(canUseLlmNightRead(false), false);
  assert.equal(canUseLlmNightRead(true), true);
  const hookSrc = readFileSync(
    new URL('../src/features/reassure/application/nightRead.ts', import.meta.url),
    'utf8',
  );
  // The client wait-cap must EXCEED the function's own 8s server-side LLM
  // timeout, or an uncached call (~5-8s: model + guardrail + audit + cache write)
  // gets abandoned before it answers and mislabeled "unavailable" while the
  // server is still succeeding + caching (the exact bug the first live test hit).
  assert.ok(hookSrc.includes('FETCH_TIMEOUT_MS = 12_000'), 'client wait-cap is 12s');
  const capMatch = hookSrc.match(/FETCH_TIMEOUT_MS = (\d[\d_]*)/);
  assert.ok(capMatch && Number(capMatch[1].replace(/_/g, '')) > RX_LLM.LLM_TIMEOUT_MS,
    'the client wait-cap exceeds the 8s server-side LLM timeout');
  assert.ok(hookSrc.includes('Promise.race'), 'the read races a wait-cap — the UI never blocks (local read is already shown)');
  // A cap-hit is UNKNOWN, never a failure: pending → keep loading, retry next open.
  assert.ok(hookSrc.includes("return { kind: 'pending' }"), 'a wait-cap timeout is pending, not unavailable');
  assert.ok(hookSrc.includes('canUseLlmNightRead(isPro)'), 'the LLM read is Pro-gated');
  const cardSrc = readFileSync(
    new URL('../src/features/reassure/components/RecapCard.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(
    cardSrc.includes('readOverride ?? recapReadText(recap)'),
    'the local descriptive read always renders first; the LLM read only replaces it',
  );
  // Topic polish must stay unwired until consent + clinician sign-off land
  // (manifest #10/#13): no client file may reference the function.
  const srcRoot = new URL('../src/', import.meta.url);
  const offenders = (readdirSync(srcRoot, { recursive: true, encoding: 'utf8' }) as string[])
    .filter((rel) => /\.(ts|tsx)$/.test(rel))
    .filter((rel) => readFileSync(new URL(rel, srcRoot), 'utf8').includes('reassure-topic-polish'));
  assert.deepEqual(offenders, [], 'no src/ file references reassure-topic-polish (gated dark)');
});

check('X23. audit privacy: minimized parent text, token usage, retention TTL, zero policies', () => {
  // §6 — the Job 2 audit stores a short preview + length, never the raw text.
  const long =
    'my baby hiccups after every feed and I am worried sick about it, should I do something tonight?';
  const minimized = RX_AUDIT.minimizeParentTextForAudit(long);
  assert.equal(minimized.preview.length, RX_AUDIT.AUDIT_PARENT_TEXT_MAX_CHARS);
  assert.equal(minimized.length, long.length);
  assert.ok(RX_AUDIT.AUDIT_PARENT_TEXT_MAX_CHARS < 280, 'preview is shorter than accepted input');
  assert.ok(
    RX_EDGE_SRCS['reassure-topic-polish'].includes('parentText: minimizeParentTextForAudit(parentText)'),
    'the topic-polish audit request minimizes the raw text',
  );
  // §8 — token usage is captured on every model call, for both jobs.
  assert.deepEqual(RX_AUDIT.usageOf({ usage: { input_tokens: 5, output_tokens: 7 } }), {
    input_tokens: 5,
    output_tokens: 7,
  });
  assert.deepEqual(RX_AUDIT.usageOf({}), {}, 'missing usage degrades to an empty block');
  for (const [name, src] of Object.entries(RX_EDGE_SRCS)) {
    assert.ok(src.includes('usageOf(response)'), `${name} records token usage`);
  }
  // Migration: service-role only, TTL defined, and the audit columns exist.
  const auditSql = readFileSync(
    new URL('../supabase/migrations/20260702090002_create_reassure_audit.sql', import.meta.url),
    'utf8',
  );
  assert.ok(!auditSql.includes('create policy'), 'reassure_audit has ZERO client policies');
  assert.ok(auditSql.includes('enable row level security'), 'RLS enabled (deny-all for clients)');
  for (const col of ['outcome', 'usage', 'expires_at']) {
    assert.ok(new RegExp(`^\\s{2}${col}\\s`, 'm').test(auditSql), `reassure_audit has "${col}"`);
  }
  assert.ok(auditSql.includes("interval '90 days'"), 'the retention TTL is defined');
});

// ---------------------------------------------------------------------------
// X24: AI night-read consent (client) + the server kill-switch. The AI read is
// only ever ATTEMPTED when Pro/dev + explicit consent (client) + the server
// kill-switch is on; the local read and recap always render without any of it.
// ---------------------------------------------------------------------------
const RX_CONSENT_DOMAIN_SRC = readFileSync(
  new URL('../src/features/reassure/domain/aiConsent.ts', import.meta.url),
  'utf8',
);
const RX_CONSENT_STORE_SRC = readFileSync(
  new URL('../src/features/reassure/application/aiConsentStore.ts', import.meta.url),
  'utf8',
);
const RX_CONSENT_HOOK_SRC = readFileSync(
  new URL('../src/features/reassure/application/useAiNightReadConsent.ts', import.meta.url),
  'utf8',
);
const RX_CONSENT_CARD_SRC = readFileSync(
  new URL('../src/features/reassure/components/AiConsentCard.tsx', import.meta.url),
  'utf8',
);
const RX_NIGHTREAD_HOOK_SRC = readFileSync(
  new URL('../src/features/reassure/application/nightRead.ts', import.meta.url),
  'utf8',
);
const RX_REASSURE_SCREEN_SRC = readFileSync(
  new URL('../src/app/(tabs)/reassure.tsx', import.meta.url),
  'utf8',
);
const RX_AUDIT_SHARED_SRC = readFileSync(
  new URL('../supabase/functions/_shared/reassureAudit.ts', import.meta.url),
  'utf8',
);

check('X24a. consent gate: only "granted" lets the client attempt the AI read', () => {
  // The pure decision: granted → allowed; declined / undecided → never.
  assert.equal(consentAllowsAiNightRead('granted'), true);
  assert.equal(consentAllowsAiNightRead('declined'), false);
  assert.equal(consentAllowsAiNightRead(null), false);
  // Parse is total and trusts nothing it can't recognize (corrupt → undecided).
  assert.equal(parseAiConsent('granted'), 'granted');
  assert.equal(parseAiConsent('declined'), 'declined');
  for (const bad of [null, undefined, '', '  ', 'yes', 'true', '1', 'GRANTED']) {
    assert.equal(parseAiConsent(bad), null, `"${String(bad)}" is not a decision`);
  }
  assert.ok(AI_NIGHT_READ_CONSENT_KEY.startsWith('lullaby.'), 'stored under a local namespaced key');

  // The client hook makes consent a HARD precondition for the edge call: the
  // effect that fetches is gated on `eligible`, and `eligible` requires both the
  // Pro gate AND consent. No consent → no invoke.
  assert.ok(
    RX_NIGHTREAD_HOOK_SRC.includes('consentAllowsAiNightRead('),
    'the hook consults the consent gate',
  );
  assert.ok(
    RX_NIGHTREAD_HOOK_SRC.includes('canUseLlmNightRead(isPro)'),
    'the Pro/dev gate still applies (consent does not bypass it)',
  );
  const eligibleIx = RX_NIGHTREAD_HOOK_SRC.indexOf('const eligible =');
  const guardIx = RX_NIGHTREAD_HOOK_SRC.indexOf('if (!eligible');
  // The only site that calls the edge function is inside the guarded effect.
  const fetchCallIx = RX_NIGHTREAD_HOOK_SRC.indexOf('await fetchNightRead(babyId');
  assert.ok(eligibleIx > -1 && guardIx > -1 && fetchCallIx > -1, 'hook shape intact');
  assert.ok(
    RX_NIGHTREAD_HOOK_SRC.includes('const eligible = aiEligible && consentGranted'),
    'the edge call requires Pro-eligibility AND explicit consent',
  );
  assert.ok(
    guardIx < fetchCallIx,
    'the eligible-guard short-circuits before the effect ever calls fetchNightRead',
  );
});

check('X24b. local read + recap always render; consent notice is one-time only', () => {
  // The recap card renders unconditionally, and its local read is the base — the
  // LLM read only ever overrides it (this is the X22 contract, re-asserted here
  // from the consent angle: nothing about consent can hide the local read).
  assert.ok(
    RX_REASSURE_SCREEN_SRC.includes('<RecapCard surfaceMode={mode} recap={recap} readOverride={nightRead} />'),
    'the local recap/read renders regardless of consent',
  );
  // The consent card is shown ONLY when needsConsent — which the hook sets only
  // for AI-eligible parents who have not yet decided (so it never re-nags).
  assert.ok(
    RX_REASSURE_SCREEN_SRC.includes('needsConsent ?') &&
      RX_REASSURE_SCREEN_SRC.includes('<AiConsentCard'),
    'the consent card is conditional on needsConsent',
  );
  assert.ok(
    RX_NIGHTREAD_HOOK_SRC.includes('needsConsent: aiEligible && consent.ready && consent.status === null'),
    'the notice is owed once: eligible, loaded, still undecided',
  );
});

check('X24c. consent copy is honest: local works without AI, no diagnosis/treatment claim', () => {
  assert.ok(
    /works fully without this/i.test(RX_CONSENT_CARD_SRC) && /without AI/i.test(RX_CONSENT_CARD_SRC),
    'copy states Reassure works without AI',
  );
  assert.ok(/not medical advice/i.test(RX_CONSENT_CARD_SRC), 'copy states it is not medical advice');
  assert.ok(/never a diagnosis/i.test(RX_CONSENT_CARD_SRC), 'copy disclaims diagnosis');
  // It explains the minimized data that leaves the device, and what never does.
  assert.ok(/minimized/i.test(RX_CONSENT_CARD_SRC), 'copy says the summary is minimized');
  assert.ok(
    /never sent/i.test(RX_CONSENT_CARD_SRC),
    'copy names what never leaves the device (notes / typed text / phone)',
  );
  // It must not CLAIM to diagnose, treat, or cure.
  assert.ok(
    !/\b(diagnose|treat|treats|treating|treatment|cure|cures)\b/i.test(RX_CONSENT_CARD_SRC),
    'consent copy makes no diagnosis/treatment claim',
  );
});

check('X24d. server kill-switch: disabled → NO Anthropic call path, no token spend', () => {
  const night = RX_EDGE_SRCS['reassure-night-read'];
  const envIx = night.indexOf("Deno.env.get('REASSURE_NIGHT_READ_ENABLED')");
  const guardIx = night.indexOf('if (!nightReadEnabled)');
  const clientIx = night.indexOf('new Anthropic(');
  const modelIx = night.indexOf('anthropic.messages.create');
  assert.ok(envIx > -1, 'the function reads the kill-switch env var');
  assert.ok(
    night.includes("=== '1'"),
    'the kill-switch is on ONLY for the exact value "1" (off by default)',
  );
  assert.ok(guardIx > -1 && guardIx < clientIx && guardIx < modelIx, 'the disabled branch precedes any Anthropic construction/call');
  assert.ok(night.includes("outcome = 'disabled'"), 'a disabled run audits outcome=disabled');
  // The disabled branch returns the fallback shape the client already expects.
  assert.ok(night.includes("source: 'fallback'"), 'disabled returns the local fallback shape');
  // The audit outcome union carries the new disabled state (unconstrained text
  // column → no migration needed).
  assert.ok(RX_AUDIT_SHARED_SRC.includes("| 'disabled'"), 'the audit outcome union includes disabled');
});

check('X24e. consent never leaks: no phone, no analytics, no LLM in the consent path', () => {
  for (const [name, src] of [
    ['domain', RX_CONSENT_DOMAIN_SRC],
    ['store', RX_CONSENT_STORE_SRC],
    ['hook', RX_CONSENT_HOOK_SRC],
    ['card', RX_CONSENT_CARD_SRC],
  ] as const) {
    // The pediatrician phone must never touch the AI consent path. (The prose
    // privacy notes may NAME it to promise it stays out; what must be absent is
    // any real import/symbol that would actually handle the number.)
    assert.ok(
      !src.includes('pediatricianContact') &&
        !src.includes('pediatricianStore') &&
        !src.includes('telUrlFor') &&
        !src.includes('PEDIATRICIAN_PHONE_KEY'),
      `${name} never imports or uses the pediatrician phone`,
    );
    // Consent state is private: never posted to analytics or the LLM.
    assert.ok(
      !src.includes('useAnalytics') && !src.includes('trackEvent') && !src.includes('lib/analytics'),
      `${name} wires no analytics for the consent state`,
    );
    assert.ok(!src.includes('anthropic') && !src.includes('functions.invoke'), `${name} reaches no backend/LLM`);
    // Neither the DARK topic-polish nor the un-built parent-answer is wired here.
    assert.ok(
      !src.includes('reassure-topic-polish') && !src.includes('reassure-parent-answer'),
      `${name} keeps topic-polish / parent-answer dark`,
    );
  }
  // The night-read payload carries only the three code-computed fields — never
  // consent state, the phone, or raw parent text.
  const bodyMatch = RX_NIGHTREAD_HOOK_SRC.match(/body:\s*\{[\s\S]*?\}/);
  assert.ok(bodyMatch, 'the invoke body is present');
  const body = bodyMatch![0];
  assert.ok(
    body.includes('babyId') && body.includes('nightKey') && body.includes('tzOffsetMinutes'),
    'the payload sends only babyId + nightKey + tzOffsetMinutes',
  );
  assert.ok(
    !/consent|phone|pediatrician|askText|rawText/i.test(body),
    'the payload carries no consent state, phone, or raw parent text',
  );
});

// ---------------------------------------------------------------------------
// NR1–NR7: night-read release-readiness. The real deployed calls (2026-07-02
// audit) all ended in guardrail_block: valid JSON, short, end_turn — but every
// response reached for the word "okay" ("that's okay"), which is judgement
// vocabulary the night read has no source text to exempt, so it was a VOCAB
// block. The fix steers the prompt away from those words WITHOUT weakening the
// guardrail. These checks pin both halves: the guardrail still blocks medical
// wording, and a prompt-following safe read now passes.
// ---------------------------------------------------------------------------

check('NR1. the read that shipped as guardrail_block is a VOCAB block ("okay"); a prompt-following read passes', () => {
  // Verbatim from a real reassure_audit row that resolved guardrail_block.
  const shipped =
    "It looks like you haven't logged anything yet tonight, and that's okay. If you need support or have concerns about your baby, your pediatrician is always there to help.";
  assert.ok(shipped.length <= RX_LLM.NIGHT_READ_MAX_CHARS, 'fixture: it was under the length cap');
  const blocked = RX_LLM.validateLlmOutput(JSON.stringify({ read: shipped }), 'read', {
    maxChars: RX_LLM.NIGHT_READ_MAX_CHARS,
  });
  assert.ok(
    !blocked.ok && blocked.reason === 'vocab',
    'the shipped read blocked on judgement vocab, not parse/length',
  );
  assert.ok(/\bokay\b/i.test(shipped), 'fixture: the culprit word is "okay"');

  // A sparse-night read that follows the fixed prompt — reflects the (absent)
  // counts, gentle uncertainty, a general pediatrician pointer, NO judgement word.
  const safeSparse =
    'Tonight is quiet in Lullaby so far — no feeds, diaper changes, or spit-ups are logged, and no sleep has been recorded yet. If anything feels off, trust your instincts and reach out to your pediatrician.';
  // A read that restates real tallies, same safe register.
  const safeData =
    'So far tonight you have logged 3 feeds, 2 diaper changes, and one 90-minute stretch of sleep. If anything feels off, trust your instincts and reach out to your pediatrician.';
  for (const read of [safeSparse, safeData]) {
    const verdict = RX_LLM.validateLlmOutput(JSON.stringify({ read }), 'read', {
      maxChars: RX_LLM.NIGHT_READ_MAX_CHARS,
    });
    assert.ok(verdict.ok, `a safe, prompt-following read passes the guardrail: ${read}`);
  }
});

check('NR2. medical / diagnostic / false-reassurance wording is still blocked by the guardrail', () => {
  for (const bad of [
    'Your baby looks perfectly healthy and this is a completely normal night.',
    'Everything is fine — nothing concerning here.',
    'This is a safe amount of sleep for a newborn.',
    'That is a reassuring number of wet diapers.',
  ]) {
    const verdict = RX_LLM.validateLlmOutput(JSON.stringify({ read: bad }), 'read', {
      maxChars: RX_LLM.NIGHT_READ_MAX_CHARS,
    });
    assert.ok(!verdict.ok && verdict.reason === 'vocab', `blocked: ${bad}`);
  }
});

check('NR3. the night-read prompt names the forbidden judgement words so the model is steered, not only caught', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const content = require('../supabase/functions/_shared/reassureContent') as {
    NIGHT_READ_SYSTEM_PROMPT: string;
  };
  const prompt = content.NIGHT_READ_SYSTEM_PROMPT.toLowerCase();
  assert.ok(prompt.includes('forbidden'), 'the prompt carries an explicit forbidden-words rule');
  // The exact culprit ("okay") plus a representative sample of the shared ban.
  for (const word of ['okay', 'normal', 'healthy', 'fine', 'reassuring', 'safe']) {
    assert.ok(prompt.includes(word), `the prompt lists "${word}" as forbidden`);
  }
  assert.ok(prompt.includes('never diagnose'), 'the prompt still forbids diagnosis');
  assert.ok(prompt.includes('pediatrician'), 'the only allowed guidance stays the pediatrician pointer');
  assert.ok(prompt.includes('single "read" string'), 'the prompt matches the single-key schema (guardrail unchanged)');
});

check('NR4. every code-built prompt fact is red-flag-clean AND judgement-vocab-clean (nothing to smuggle)', () => {
  const bands = ['0-4 weeks', '1-3 months', 'over 12 months', 'unknown age'];
  const tallySets = [
    { feeds: 0, diapers: 0, spitUps: 0, longestSleepMin: null, sleepRunning: false },
    { feeds: 3, diapers: 2, spitUps: 1, longestSleepMin: 90, sleepRunning: false },
    { feeds: 12, diapers: 9, spitUps: 4, longestSleepMin: 1, sleepRunning: true },
  ];
  for (const band of bands) {
    for (const t of tallySets) {
      const facts = RX_CORE.buildPromptFacts(t, band);
      assert.ok(!matchesRedFlag(normalizeAsk(facts)), `prompt facts red-flag-clean: ${facts}`);
      assert.ok(!RX_LLM.judgementVocabRegex().test(facts), `prompt facts vocab-clean: ${facts}`);
    }
  }
});

check('NR5. cost control: cache-hit returns before any model call; a blocked read caches nothing and falls back', () => {
  const night = RX_EDGE_SRCS['reassure-night-read'];
  const cacheHitIx = night.indexOf('if (cached?.read)');
  const clientIx = night.indexOf('new Anthropic(');
  assert.ok(
    cacheHitIx > -1 && clientIx > -1 && cacheHitIx < clientIx,
    'a cache hit short-circuits BEFORE the Anthropic client is constructed (no re-spend)',
  );
  // Only a real (non-null) read is ever written to the once-per-night cache.
  assert.ok(
    night.indexOf('if (read == null)') < night.indexOf('.upsert('),
    'the null-read fallback returns before the cache upsert — failures cache nothing',
  );
  assert.ok(
    night.includes('.upsert({ baby_id: babyId, night_key: nightKey, read'),
    'the cache stores only a validated read',
  );
  // A discarded answer audits guardrail_block and falls back; the SDK is built
  // with 0 retries, so a block is one call, never an auto-retry loop.
  assert.ok(
    night.includes("outcome = verdict.reason === 'parse' ? 'parse_fail' : 'guardrail_block'"),
    'a discarded answer audits guardrail_block',
  );
  assert.ok(night.includes('maxRetries: LLM_MAX_RETRIES'), 'the SDK is constructed with 0 retries');
});

check('NR6. the honest AI/fallback label is wired and keeps the non-medical disclaimer visible', () => {
  const noteSrc = readFileSync(
    new URL('../src/features/reassure/components/AiReadNote.tsx', import.meta.url),
    'utf8',
  );
  // A successful AI read is clearly labelled AS an AI read, and stays non-medical.
  assert.ok(/AI-phrased/i.test(noteSrc), 'a successful AI read is labelled AI-phrased');
  assert.ok(/not medical advice/i.test(noteSrc), 'the AI label keeps "not medical advice" visible');
  assert.ok(/never a diagnosis/i.test(noteSrc), 'the AI label keeps "never a diagnosis" visible');
  // The failure copy is calm and honest — points at the local read, never an error.
  assert.ok(noteSrc.includes('available right now'), 'the unavailable note is calm and honest');
  assert.ok(
    noteSrc.includes('the local read based on your logs'),
    'the unavailable note points at the local read, not a technical failure',
  );
  // The screen renders it, driven by the hook status; the four states live in
  // the pure view leaf, and the hook derives its status from it.
  assert.ok(
    RX_REASSURE_SCREEN_SRC.includes('<AiReadNote surfaceMode={mode} status={nightReadStatus} />'),
    'the reassure screen renders the honest label under the recap',
  );
  const viewSrc = readFileSync(
    new URL('../src/features/reassure/domain/nightReadView.ts', import.meta.url),
    'utf8',
  );
  for (const s of ['idle', 'loading', 'ai', 'unavailable']) {
    assert.ok(viewSrc.includes(`'${s}'`), `the view leaf models the "${s}" status`);
  }
  assert.ok(
    RX_NIGHTREAD_HOOK_SRC.includes('nightReadView('),
    'the hook derives its status from the pure view leaf',
  );
});

check('NR7. display path: an llm/cached read shows AI status; a resolved fallback shows unavailable; idle is silent', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const view = require('../src/features/reassure/domain/nightReadView') as {
    classifyNightReadResponse: (body: unknown) => { kind: 'read'; text: string } | { kind: 'fallback' };
    nightReadView: (
      eligible: boolean,
      resolved: { text: string | null } | null,
    ) => { read: string | null; status: 'idle' | 'loading' | 'ai' | 'unavailable' };
  };

  // A fresh llm answer and a server CACHE HIT both arrive as { read, source:'llm' }.
  const fresh = view.classifyNightReadResponse({ read: 'Nothing has been logged yet tonight.', source: 'llm' });
  assert.deepEqual(fresh, { kind: 'read', text: 'Nothing has been logged yet tonight.' });
  const cached = view.classifyNightReadResponse({ read: 'Two feeds are logged so far.', source: 'llm' });
  assert.deepEqual(cached, { kind: 'read', text: 'Two feeds are logged so far.' });
  // Fallbacks: null read, missing read, empty/whitespace, or no body → local read.
  for (const body of [
    { read: null, source: 'fallback' },
    { source: 'fallback' },
    { read: '   ', source: 'llm' },
    null,
    undefined,
  ]) {
    assert.deepEqual(
      view.classifyNightReadResponse(body),
      { kind: 'fallback' },
      `fallback for ${JSON.stringify(body)}`,
    );
  }

  // The view maps eligibility + resolved outcome to the read + honest status.
  // 1) llm response displays AI status (read shown).
  assert.deepEqual(view.nightReadView(true, { text: fresh.text }), { read: fresh.text, status: 'ai' });
  // 2) cached llm response displays AI status.
  assert.deepEqual(view.nightReadView(true, { text: cached.text }), { read: cached.text, status: 'ai' });
  // 3) resolved fallback displays the unavailable note (no read).
  assert.deepEqual(view.nightReadView(true, { text: null }), { read: null, status: 'unavailable' });
  // 4) local-only idle shows NO AI failure (not eligible → idle, nothing rendered).
  assert.deepEqual(view.nightReadView(false, null), { read: null, status: 'idle' });
  assert.deepEqual(view.nightReadView(false, { text: null }), { read: null, status: 'idle' });
  // 5) in-flight / wait-cap pending stays a calm loading state (never the note).
  assert.deepEqual(view.nightReadView(true, null), { read: null, status: 'loading' });

  // AiReadNote renders nothing for idle/loading — a not-attempted state can never
  // surface as an AI failure.
  const noteSrc = readFileSync(
    new URL('../src/features/reassure/components/AiReadNote.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(
    noteSrc.includes("if (status !== 'ai' && status !== 'unavailable') return null;"),
    'idle/loading render nothing (no scary AI failure surface)',
  );
});

// §PC — the Reassure triage "Call pediatrician" phone action (local + private).
const RX_ANSWERCARD_SRC = readFileSync(
  new URL('../src/features/reassure/components/AnswerCard.tsx', import.meta.url),
  'utf8',
);
const RX_PED_DOMAIN_SRC = readFileSync(
  new URL('../src/features/reassure/domain/pediatricianContact.ts', import.meta.url),
  'utf8',
);
const RX_PED_STORE_SRC = readFileSync(
  new URL('../src/features/reassure/application/pediatricianStore.ts', import.meta.url),
  'utf8',
);
const RX_PED_HOOK_SRC = readFileSync(
  new URL('../src/features/reassure/application/usePediatricianPhone.ts', import.meta.url),
  'utf8',
);

check('PC1. a saved pediatrician number becomes a real tel: dial action', () => {
  // The dialable form keeps a leading + but strips visual separators.
  assert.equal(telUrlFor('+1 (555) 123-4567'), 'tel:+15551234567');
  assert.equal(telUrlFor('555 123 4567'), 'tel:5551234567');
  // The triage card feeds the SAVED number straight into Linking.openURL.
  assert.ok(
    RX_ANSWERCARD_SRC.includes('Linking.openURL(telUrlFor(phone))'),
    'the call button dials the stored number via telUrlFor',
  );
});

check('PC2. with no number, triage offers add-number — it never fakes a call', () => {
  assert.ok(RX_ANSWERCARD_SRC.includes('Add pediatrician number'), 'offers the add-number action');
  assert.ok(RX_ANSWERCARD_SRC.includes('setEditingNumber(true)'), 'add opens the inline setup sheet');
  assert.ok(RX_ANSWERCARD_SRC.includes('phone != null'), 'the primary action branches on a saved number');
  // The old placeholder (an empty `tel:` with no number) must be gone.
  assert.ok(
    !RX_ANSWERCARD_SRC.includes("openURL('tel:')") && !RX_ANSWERCARD_SRC.includes('openURL(`tel:`)'),
    'the fake empty-dial placeholder is removed',
  );
});

check('PC3. the emergency action is information-only and never auto-dials', () => {
  // Exactly one dial site in the whole card, and it is the pediatrician number.
  const dialSites = RX_ANSWERCARD_SRC.split('Linking.openURL').length - 1;
  assert.equal(dialSites, 1, 'AnswerCard dials in exactly one place');
  assert.ok(!RX_ANSWERCARD_SRC.includes('tel:'), 'no hardcoded tel: literal anywhere in the card');
  // Emergency only reveals calm guidance — no country number is dialed.
  assert.ok(RX_ANSWERCARD_SRC.includes('setShowEmergencyInfo(true)'), 'emergency reveals info only');
  assert.ok(
    RX_ANSWERCARD_SRC.includes("onTriageAction('emergency-info')"),
    'emergency reports a coarse enum, not a dial',
  );
});

check('PC4. phone normalization allows +, digits, spaces, dashes, parentheses', () => {
  assert.equal(normalizePediatricianPhone('  Dr. +1 (555) 123-4567 please  '), '+1 (555) 123-4567');
  // Every allowed class survives; letters and stray symbols are dropped.
  const kept = normalizePediatricianPhone('+1 (555) 123-4567');
  for (const ch of ['+', '(', ')', '-', ' ', '5']) {
    assert.ok(kept.includes(ch), `normalization keeps "${ch}"`);
  }
  assert.ok(!/[a-z]/i.test(normalizePediatricianPhone('call 5 now')), 'letters are stripped');
  assert.equal(normalizePediatricianPhone('5  5   5'), '5 5 5', 'duplicate whitespace collapses');
});

check('PC5. the number is never sent to analytics, logs, Supabase, or an LLM', () => {
  for (const [name, src] of [
    ['store', RX_PED_STORE_SRC],
    ['hook', RX_PED_HOOK_SRC],
    ['domain', RX_PED_DOMAIN_SRC],
  ] as const) {
    assert.ok(!src.includes('@/lib/supabase') && !src.includes("from '@supabase"), `${name} imports no Supabase client`);
    assert.ok(
      !src.includes('trackEvent') && !src.includes('useAnalytics') && !src.includes('lib/analytics'),
      `${name} wires no analytics`,
    );
    assert.ok(!src.includes('console.'), `${name} writes no log line`);
    assert.ok(!src.includes('fetch('), `${name} makes no network call`);
    assert.ok(!src.includes('anthropic'), `${name} reaches no LLM`);
  }
  // The number lives in local AsyncStorage under one namespaced key — nowhere else.
  assert.ok(
    RX_PED_STORE_SRC.includes("from '@react-native-async-storage/async-storage'"),
    'the store persists to local AsyncStorage',
  );
  assert.ok(PEDIATRICIAN_PHONE_KEY.startsWith('lullaby.'), 'stored under a local namespaced key');
  // The card never hands the raw number to the analytics-bearing callback.
  assert.ok(!/onTriageAction\([^)]*phone/.test(RX_ANSWERCARD_SRC), 'onTriageAction never receives the number');
});

check('PC6. the reassure router still routes triage vs. non-triage correctly', () => {
  assert.deepEqual(route('She feels really hot'), { kind: 'triage' });
  assert.deepEqual(route('no wet diaper since lunch'), { kind: 'triage' });
  assert.notEqual(route('is hiccups normal').kind, 'triage', 'a benign topic ask is not triaged');
});

check('PC7. local storage parse handles empty/corrupt values calmly', () => {
  for (const bad of [null, undefined, '', '   ', '()- ', 'not a phone']) {
    assert.equal(parsePediatricianPhone(bad), null, `"${String(bad)}" parses to null (no crash)`);
    assert.equal(hasDialablePhone(normalizePediatricianPhone(bad)), false);
  }
  // A real number round-trips untouched.
  assert.equal(parsePediatricianPhone('+1 555'), '+1 555');
  assert.ok(hasDialablePhone('+1 555'));
});

// ─────────────────────────────────────────────────────────────────────────────
// RG. Reassure draft-content release gate (Apple review safety posture)
//
// REASSURE_CONTENT.status is the clinician sign-off flag. Until it flips to
// 'approved', the placeholder clinical KB blocks must stay out of public
// builds; dev builds keep them for QA. Triage escalation and the non-medical
// guides are never gated — pointing at a real professional is always safe.
// ─────────────────────────────────────────────────────────────────────────────

check('RG1. the pure gate: dev builds see draft content, public builds need approval', () => {
  assert.equal(clinicalContentVisible(true), true, 'dev builds keep draft content visible for QA');
  assert.equal(
    clinicalContentVisible(false),
    REASSURE_CONTENT.status === 'approved',
    'public builds show clinical KB content only after clinician sign-off',
  );
});

check('RG2. both clinical render sites consult the gate; triage stays ungated', () => {
  for (const [name, src] of [
    ['AnswerCard', RX_ANSWERCARD_SRC],
    ['reassure screen', RX_REASSURE_SCREEN_SRC],
  ] as const) {
    assert.ok(
      src.includes('clinicalContentVisible(__DEV__)'),
      `${name} consults the gate with the real __DEV__`,
    );
  }
  // The clinical KB blocks render only behind the gate…
  assert.ok(
    RX_ANSWERCARD_SRC.includes("result.kind === 'topic' && showClinical"),
    'AnswerCard shows the clinical answer blocks only when the gate allows',
  );
  // …the gated replacement is a pediatrician pointer, not silence…
  assert.ok(
    RX_ANSWERCARD_SRC.includes("result.kind === 'topic' && !showClinical"),
    'a gated topic still gets a calm bounded card',
  );
  // …and the triage branch has no gate anywhere near it (escalation is never hidden).
  assert.ok(
    RX_ANSWERCARD_SRC.includes("result.kind === 'triage' ?") &&
      !RX_ANSWERCARD_SRC.includes("result.kind === 'triage' && showClinical"),
    'triage renders unconditionally',
  );
  // The topic accordion (all-KB surface) is gated on the screen.
  assert.ok(
    RX_REASSURE_SCREEN_SRC.includes('showClinical ? (') &&
      RX_REASSURE_SCREEN_SRC.includes('<TopicAccordion'),
    'the Common-tonight accordion renders only behind the gate',
  );
});

check('RG3. the Reassure screen states plainly that it is not medical advice', () => {
  assert.ok(
    RX_REASSURE_SCREEN_SRC.includes('not medical advice'),
    'the screen carries an explicit not-medical-advice statement',
  );
  assert.ok(
    RX_REASSURE_SCREEN_SRC.includes('General information, not medical advice.'),
    'the quiet persistent disclaimer is intact',
  );
  assert.ok(
    RX_REASSURE_SCREEN_SRC.includes('doesn’t diagnose or treat'),
    'the bounded-promise card is intact',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// RE. Release env hygiene — .env.example safe beta defaults (docs/release-env.md)
//
// Beta posture: Pro is OFF unless a build explicitly enables it AND provides
// real RevenueCat keys. These checks pin the example env file to safe-by-default
// values, keep server secrets out of it, and re-assert that "enabled with
// missing keys" resolves to the unconfigured state rather than a live paywall.
// ─────────────────────────────────────────────────────────────────────────────

const ENV_EXAMPLE_SRC = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

/** The value of `NAME=value` in .env.example, or null when the line is absent. */
function envExampleValue(name: string): string | null {
  const match = ENV_EXAMPLE_SRC.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

check('RE1. .env.example documents the full EXPO_PUBLIC env surface', () => {
  const required = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
    'EXPO_PUBLIC_FORCE_ONBOARDING',
    'EXPO_PUBLIC_PRO_ENABLED',
    'EXPO_PUBLIC_PRO_PREVIEW_ENABLED',
    'EXPO_PUBLIC_PRO_DEV_ENTITLEMENT',
    'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY',
    'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY',
    'EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID',
    'EXPO_PUBLIC_REVENUECAT_OFFERING_ID',
    'EXPO_PUBLIC_THEME_REVEAL_DURATION_MS',
    'EXPO_PUBLIC_APP_INSTALL_URL',
    'EXPO_PUBLIC_PRIVACY_POLICY_URL',
    'EXPO_PUBLIC_TERMS_URL',
    'EXPO_PUBLIC_SUPPORT_EMAIL',
  ];
  for (const name of required) {
    assert.ok(envExampleValue(name) !== null, `.env.example must document ${name}=`);
  }
});

check('RE2. .env.example ships safe beta defaults: onboarding + all Pro flags off', () => {
  assert.equal(envExampleValue('EXPO_PUBLIC_FORCE_ONBOARDING'), 'false');
  assert.equal(envExampleValue('EXPO_PUBLIC_PRO_ENABLED'), '0');
  assert.equal(envExampleValue('EXPO_PUBLIC_PRO_PREVIEW_ENABLED'), '0');
  assert.equal(envExampleValue('EXPO_PUBLIC_PRO_DEV_ENTITLEMENT'), '0');
});

check('RE3. .env.example keeps RevenueCat keys empty and ids on the code defaults', () => {
  assert.equal(envExampleValue('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY'), '');
  assert.equal(envExampleValue('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY'), '');
  assert.ok(!/appl_[A-Za-z0-9]/.test(ENV_EXAMPLE_SRC), 'no real iOS SDK key in the example');
  assert.ok(!/goog_[A-Za-z0-9]/.test(ENV_EXAMPLE_SRC), 'no real Android SDK key in the example');
  assert.equal(envExampleValue('EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID'), 'pro');
  assert.equal(envExampleValue('EXPO_PUBLIC_REVENUECAT_OFFERING_ID'), 'default');
});

check('RE4. .env.example never assigns a server secret (comments may name them)', () => {
  for (const secret of [
    'ANTHROPIC_API_KEY',
    'REASSURE_MODEL',
    'REASSURE_NIGHT_READ_ENABLED',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]) {
    const assigned = new RegExp(`^\\s*(EXPO_PUBLIC_)?${secret}\\s*=`, 'm');
    assert.ok(!assigned.test(ENV_EXAMPLE_SRC), `${secret} must never be assigned in .env.example`);
  }
});

check('RE5. Pro enabled with missing RevenueCat keys is the unconfigured state, not beta-ready', () => {
  withEnv(
    {
      EXPO_PUBLIC_PRO_ENABLED: '1',
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: undefined,
      EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: undefined,
    },
    () => {
      assert.equal(getProMode(), 'enabled');
      assert.equal(getRevenueCatApiKey('ios'), null);
      assert.equal(getRevenueCatApiKey('android'), null);
      assert.equal(hasRevenueCatConfig('ios'), false);
      assert.equal(hasRevenueCatConfig('android'), false);
    },
  );
  // Whitespace-only keys count as missing too (trimmedEnv).
  withEnv({ EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: '   ' }, () =>
    assert.equal(getRevenueCatApiKey('ios'), null),
  );
  // ProProvider maps the missing-config case to the 'unconfigured' paywall status.
  assert.ok(
    /!hasRevenueCatConfig\(platform\)\s*\?\s*'unconfigured'/.test(PRO_PROVIDER_SRC),
    "ProProvider resolves missing RevenueCat config to paywallStatus 'unconfigured'",
  );
});

check('RE6. dev entitlement stays __DEV__-gated through resolveDevProEntitlement', () => {
  withEnv({ EXPO_PUBLIC_PRO_DEV_ENTITLEMENT: '1' }, () => {
    assert.equal(resolveDevProEntitlement(true), true);
    assert.equal(resolveDevProEntitlement(false), false, 'a shipped build always ignores the override');
  });
  assert.ok(
    PRO_CONFIG_SRC.includes('return isDev && isProDevEntitlementEnabled();'),
    'proConfig keeps the isDev && flag shape',
  );
  assert.ok(
    PRO_PROVIDER_SRC.includes('resolveDevProEntitlement(__DEV__)'),
    'ProProvider passes the real __DEV__',
  );
});

check('RE7. Restore is reachable everywhere and crash-safe when RevenueCat is unconfigured', () => {
  // ProProvider.restorePurchases short-circuits with a calm message (never an SDK
  // call) when RevenueCat was never configured — so Restore cannot crash a build
  // that enables Pro without keys / the native module, or while signed out.
  assert.ok(
    PRO_PROVIDER_SRC.includes('isRevenueCatConfigured'),
    'restore guards on whether RevenueCat is actually configured',
  );
  assert.ok(
    /errorCode:\s*'not_configured'/.test(PRO_PROVIDER_SRC),
    'the unconfigured restore path reports a coarse not_configured code',
  );
  // The PaywallSheet Restore control is reachable in every state — disabled only
  // while a restore is in flight — so an Apple reviewer can always tap it.
  assert.ok(
    /disabled=\{isRestoring\}/.test(PAYWALL_SHEET_SRC),
    'Restore is tappable regardless of paywall status (only disabled mid-restore)',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SL. Settings links — privacy policy / terms / support rows (Apple review).
//
// The Settings screen must always offer a Privacy Policy link, a Terms link,
// and a support contact. Destinations are env-configurable with safe
// placeholder fallbacks (src/lib/appLinks.ts), and opening one must never be
// able to crash the screen when a device has no browser / mail app.
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_SCREEN_SRC = readFileSync(new URL('../src/app/settings.tsx', import.meta.url), 'utf8');
const APP_LINKS_SRC = readFileSync(new URL('../src/lib/appLinks.ts', import.meta.url), 'utf8');

check('SL1. link resolvers fall back to placeholders on unset/blank and trim overrides', () => {
  assert.equal(resolvePrivacyPolicyUrl(undefined), DEFAULT_PRIVACY_POLICY_URL);
  assert.equal(resolvePrivacyPolicyUrl(''), DEFAULT_PRIVACY_POLICY_URL);
  assert.equal(resolvePrivacyPolicyUrl('   '), DEFAULT_PRIVACY_POLICY_URL);
  assert.equal(resolvePrivacyPolicyUrl('  https://example.test/privacy  '), 'https://example.test/privacy');
  assert.equal(resolveTermsUrl(undefined), DEFAULT_TERMS_URL);
  assert.equal(resolveTermsUrl('  https://example.test/terms  '), 'https://example.test/terms');
  assert.equal(resolveSupportEmail(undefined), DEFAULT_SUPPORT_EMAIL);
  assert.equal(resolveSupportEmail('  care@example.test  '), 'care@example.test');
  // The placeholders themselves are well-formed destinations, never empty.
  assert.match(DEFAULT_PRIVACY_POLICY_URL, /^https:\/\//);
  assert.match(DEFAULT_TERMS_URL, /^https:\/\//);
  assert.match(DEFAULT_SUPPORT_EMAIL, /^[^@\s]+@[^@\s]+$/);
});

check('SL2. the support mailto carries only the address and an app-version subject', () => {
  const url = buildSupportMailtoUrl({ email: 'care@example.test', appVersion: '1.2.3' });
  assert.ok(url.startsWith('mailto:care@example.test?subject='), 'mailto + subject shape');
  assert.ok(url.includes(encodeURIComponent('Lullaby feedback (v1.2.3)')), 'subject names the app version');
  assert.ok(!/body=/.test(url), 'no prefilled body — nothing from the device rides along');
});

check('SL3. Settings renders privacy/terms/support rows through the guarded opener', () => {
  for (const row of ['Privacy Policy', 'Terms of Use', 'Contact support']) {
    assert.ok(SETTINGS_SCREEN_SRC.includes(`label="${row}"`), `Settings has a ${row} row`);
  }
  for (const resolver of ['resolvePrivacyPolicyUrl()', 'resolveTermsUrl()', 'resolveSupportEmail()']) {
    assert.ok(SETTINGS_SCREEN_SRC.includes(resolver), `destinations come from ${resolver}`);
  }
  // Every open goes through the single try/catch wrapper with an inline
  // fallback — Linking.openURL is never called bare.
  const openSites = SETTINGS_SCREEN_SRC.split('Linking.openURL').length - 1;
  assert.equal(openSites, 1, 'exactly one Linking.openURL site (inside openExternal)');
  assert.match(
    SETTINGS_SCREEN_SRC,
    /try\s*\{\s*await Linking\.openURL\(url\);\s*\}\s*catch\s*\{/,
    'the opener catches failure instead of crashing',
  );
});

check('SL4. no store URL, secret, or payment reference rides into the link surfaces', () => {
  for (const src of [APP_LINKS_SRC, SETTINGS_SCREEN_SRC]) {
    for (const banned of ['apps.apple.com', 'itunes.apple.com', 'play.google.com', 'testflight.apple.com']) {
      assert.ok(!src.includes(banned), `must not hardcode ${banned}`);
    }
    for (const secret of ['ANTHROPIC_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ANON_KEY']) {
      assert.ok(!src.includes(secret), `must not reference ${secret}`);
    }
  }
  assert.ok(!/Stripe|checkout/i.test(APP_LINKS_SRC), 'no payment link sneaks into appLinks');
});

// ─────────────────────────────────────────────────────────────────────────────
// §DA. Delete account (Apple 5.1.1(v)) — Settings offers honest in-app account
// deletion: an armed two-step confirm, a self-scoped definer RPC, the local
// session dropped only AFTER the server verifiably deleted the account, and a
// manual email fallback on failure. Local-first stores survive, same as
// sign-out.
// ─────────────────────────────────────────────────────────────────────────────

const DELETE_ACCOUNT_MIGRATION_SRC = readFileSync(
  new URL('../supabase/migrations/20260703060000_delete_account.sql', import.meta.url),
  'utf8',
);
const SYNC_ACCOUNT_SRC = readFileSync(new URL('../src/sync/account.ts', import.meta.url), 'utf8');

check('DA1. Settings arms Delete account behind an explicit second confirm tap', () => {
  assert.ok(SETTINGS_SCREEN_SRC.includes('accessibilityLabel="Delete account"'), 'the entry row exists');
  assert.ok(
    SETTINGS_SCREEN_SRC.includes('accessibilityLabel="Permanently delete account"'),
    'the destructive tap is a separate, explicit confirm',
  );
  assert.ok(
    SETTINGS_SCREEN_SRC.includes('accessibilityLabel="Keep my account"'),
    'the confirm block offers a calm way out',
  );
  assert.ok(
    /can\s*\{'’'\}t be undone/.test(SETTINGS_SCREEN_SRC),
    'the confirm copy states permanence plainly',
  );
});

check('DA2. the delete_account RPC is self-scoped and locked to signed-in callers', () => {
  const src = DELETE_ACCOUNT_MIGRATION_SRC;
  assert.ok(src.includes('security definer'), 'definer RPC — deleting auth.users needs privilege');
  assert.ok(src.includes('auth.uid()'), 'the target comes from the token, never a parameter');
  assert.ok(src.includes('create or replace function public.delete_account()'), 'takes no parameters — cannot target another user');
  assert.ok(src.includes('if v_uid is null then'), 'anonymous callers are rejected inside the function too');
  assert.ok(
    src.includes('delete from public.events where caregiver_id = v_uid'),
    'authored events are cleared first (events.caregiver_id is NOT NULL with ON DELETE SET NULL)',
  );
  assert.ok(
    src.includes('delete from auth.users where id = v_uid'),
    'the account row itself is deleted — real deletion, not a soft flag',
  );
  assert.ok(src.includes('revoke all on function public.delete_account() from public'), 'not callable by PUBLIC');
  assert.ok(src.includes('revoke all on function public.delete_account() from anon'), 'not callable anonymously');
  assert.ok(src.includes('grant execute on function public.delete_account() to authenticated'), 'signed-in self-service only');
});

check('DA3. deleteAccount wipes local data then drops the session, only after the server delete', () => {
  const body = AUTH_PROVIDER_SRC.slice(
    AUTH_PROVIDER_SRC.indexOf('const deleteAccount'),
    AUTH_PROVIDER_SRC.indexOf('const clearError'),
  );
  const rpcAt = body.indexOf('await deleteAccountRemote()');
  // The failure-path return is the FIRST `return false` AFTER the RPC call — not
  // the `if (!supabase) return false` guard that precedes it.
  const failReturnAt = rpcAt === -1 ? -1 : body.indexOf('return false', rpcAt);
  const localWipeAt = body.indexOf('clearLocalAppDataAfterAccountDeletion(');
  const localSignOutAt = body.indexOf("signOut({ scope: 'local' })");
  assert.ok(rpcAt !== -1, 'the provider calls the sync-layer RPC wrapper first');
  assert.ok(failReturnAt !== -1, 'a failed RPC resolves false so the UI can stay honest');
  assert.ok(localWipeAt !== -1, 'a verified delete wipes local-first data (the fresh-restart fix)');
  assert.ok(localSignOutAt !== -1, "the follow-up sign-out is scope 'local' (the server user no longer exists)");
  // Order: RPC → (on failure) return false BEFORE any wipe → local wipe → session drop.
  assert.ok(rpcAt < failReturnAt, 'the failure return sits after the RPC call');
  assert.ok(
    failReturnAt < localWipeAt,
    'the failure path returns BEFORE the wipe — a failed delete clears nothing',
  );
  assert.ok(localWipeAt < localSignOutAt, 'local data is cleared before (and around) the session drop');
  // The in-memory account decision is reset so we land on account-entry, not local-only.
  assert.ok(
    body.includes('prefersLocalRef.current = false'),
    'the sticky prefers-local flag is dropped so applySession(null) lands on account entry',
  );
  assert.ok(
    !body.includes('setErrorMessage('),
    'no provider errorMessage — it would resurface as a stale note on the account surfaces later',
  );
});

check('DA4. a failed deletion surfaces the manual email fallback, never a fake success', () => {
  assert.ok(
    SETTINGS_SCREEN_SRC.includes('const deleted = await deleteAccount()'),
    'the screen awaits the verified server result before leaving',
  );
  assert.ok(/Couldn’t delete your account just now/.test(SETTINGS_SCREEN_SRC), 'calm failure copy');
  assert.ok(SETTINGS_SCREEN_SRC.includes('${supportEmail}'), 'the fallback names the real support address');
  assert.ok(SYNC_ACCOUNT_SRC.includes("rpc('delete_account')"), 'deletion goes through the self-scoped RPC');
  assert.ok(
    !SYNC_ACCOUNT_SRC.includes('SERVICE_ROLE'),
    'no service-role key anywhere near the client deletion path',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// DR. Delete Account → FULL local reset (fix/delete-account-full-local-reset).
//
// The reported bug: after deleting the account and signing back in with the same
// Google account, the app restored the old baby name/logs — because a verified
// server delete used to preserve the local stores (same hygiene as sign-out).
// The fix: a verified deletion now ALSO wipes this device's local-first data via
// the pure `@/data/accountReset` contract + `@/data/accountResetStorage` wipe, so
// a fresh sign-in is genuinely fresh. Sign-out still preserves everything (GP*).
// ─────────────────────────────────────────────────────────────────────────────

const ACCOUNT_RESET_STORAGE_SRC = readFileSync(
  new URL('../src/data/accountResetStorage.ts', import.meta.url),
  'utf8',
);

// A realistic full AsyncStorage keyset: the guest stores, the onboarding
// gate/draft, the account decision, the private Reassure prefs, per-baby/night
// caches, per-context cursors — plus the device theme (which must SURVIVE).
function seedFullDeviceSnapshot(): Record<string, string> {
  return {
    ...seedGuestSnapshot(),
    'lullaby.onboarding.v2.complete': 'true',
    'lullaby.onboarding.v2.draft': JSON.stringify({ babyName: 'Aria', birthDate: '2026-05-01' }),
    'lullaby/auth/prefers-local/v1': 'true',
    'lullaby.coach.firstLog.v1.dismissed': 'true',
    'lullaby.reassure.aiNightReadConsent.v1': 'granted',
    'lullaby.reassure.pediatricianPhone.v1': '+1 555 123 4567',
    'lullaby/reassure/night-read/v1:local-baby:2026-06-16': 'a soft note about Aria’s night',
    'lullaby/handoff-cursor/local': '1718500000000',
    'lullaby/handoff-cursor/user-1:local-baby': '1718500000000',
    'lullaby.surfaceMode': 'night', // device config, NOT account data → survives
  };
}

// Apply the real selector to model exactly what the device wipe removes.
function simulateAccountDeletionWipe(before: Record<string, string>): Record<string, string> {
  const toRemove = new Set(selectAccountDeletionKeys(Object.keys(before)));
  const after: Record<string, string> = {};
  for (const [key, value] of Object.entries(before)) {
    if (!toRemove.has(key)) after[key] = value;
  }
  return after;
}

check('DR1. the reset key set is a superset of the guest stores + onboarding + account decision', () => {
  const keys = ACCOUNT_LOCAL_DATA_KEYS as readonly string[];
  // Every guest-owned store (baby + both event stores) is cleared on deletion —
  // the inverse of the preservation contract that protects them on sign-out.
  for (const guestKey of GUEST_OWNED_STORAGE_KEYS) {
    assert.ok(keys.includes(guestKey), `${guestKey} must be cleared on account deletion`);
  }
  // …plus the onboarding gate/draft and the sticky account decision.
  assert.ok(keys.includes('lullaby.onboarding.v2.complete'), 'onboarding must re-run after deletion');
  assert.ok(keys.includes('lullaby.onboarding.v2.draft'), 'no stale draft may re-prefill the old baby');
  assert.ok(keys.includes('lullaby/auth/prefers-local/v1'), 'the account decision resets to account-entry');
  // The device theme is NOT account data → it is deliberately preserved.
  assert.ok(!keys.includes('lullaby.surfaceMode'), 'device theme is not swept into the account wipe');
  assert.deepEqual([...ACCOUNT_RESET_PRESERVED_KEYS], ['lullaby.surfaceMode']);
});

check('DR2. the selector clears every user key from a full snapshot and keeps only device config', () => {
  const before = seedFullDeviceSnapshot();
  const removed = new Set(selectAccountDeletionKeys(Object.keys(before)));
  // Prefix-keyed stores (night-read cache, handoff cursors) are matched + cleared.
  assert.ok(removed.has('lullaby/reassure/night-read/v1:local-baby:2026-06-16'), 'per-night AI cache cleared by prefix');
  assert.ok(removed.has('lullaby/handoff-cursor/local'), 'local cursor cleared by prefix');
  assert.ok(removed.has('lullaby/handoff-cursor/user-1:local-baby'), 'per-account cursor cleared by prefix');
  // The private Reassure prefs (the parent's own data) are cleared.
  assert.ok(removed.has('lullaby.reassure.pediatricianPhone.v1'), "the parent's own phone number is cleared");
  assert.ok(removed.has('lullaby.reassure.aiNightReadConsent.v1'), 'AI consent resets for the fresh account');
  assert.ok(removed.has('lullaby.coach.firstLog.v1.dismissed'), 'the first-log coach re-arms for the fresh baby');
  // Exactly one key survives: the device theme.
  const after = simulateAccountDeletionWipe(before);
  assert.deepEqual(Object.keys(after), ['lullaby.surfaceMode']);
  assert.equal(after['lullaby.surfaceMode'], 'night');
  // At least one prefix exists so DR2 can't pass vacuously.
  assert.ok((ACCOUNT_LOCAL_DATA_PREFIXES as readonly string[]).length >= 1);
});

check('DR3. deletion clears the local baby profile AND the logs (so re-login restores neither)', () => {
  const before = seedFullDeviceSnapshot();
  // Precondition: the guest snapshot really holds a restorable baby named "Aria".
  assert.equal(parseLocalBaby(before[LOCAL_BABY_STORAGE_KEY])?.baby.name, 'Aria');
  const beforeEvents = parsePersistedState(before[LOCAL_EVENTS_STORAGE_KEY]);
  assert.ok(beforeEvents !== null && beforeEvents.events.length > 0, 'there are local logs to lose');

  const after = simulateAccountDeletionWipe(before);
  // The baby profile store is gone → nothing to restore.
  assert.equal(after[LOCAL_BABY_STORAGE_KEY], undefined, 'local baby profile is erased');
  assert.equal(parseLocalBaby(after[LOCAL_BABY_STORAGE_KEY] ?? null), null, 'no old baby can be re-hydrated');
  // Both event stores are gone → no old logs/timeline.
  assert.equal(after[LOCAL_EVENTS_STORAGE_KEY], undefined, 'legacy local night is erased');
  assert.equal(after[LOGGING_STORAGE_KEY], undefined, 'logging-v2 snapshot is erased');
  // The preservation predicate would (correctly) report this as data loss —
  // proving the wipe is real, and that it is the OPPOSITE of the sign-out path.
  assert.ok(!isGuestDataPreserved(before, after));
});

check('DR4. deletion resets onboarding so a fresh baby setup is required and never re-prefilled', () => {
  const before = seedFullDeviceSnapshot();
  // Precondition: onboarding was complete and a draft named the old baby.
  assert.equal(before['lullaby.onboarding.v2.complete'], 'true');
  assert.equal(JSON.parse(before['lullaby.onboarding.v2.draft']).babyName, 'Aria');

  const after = simulateAccountDeletionWipe(before);
  assert.equal(after['lullaby.onboarding.v2.complete'], undefined, 'onboarding gate reopens → setup runs again');
  assert.equal(after['lullaby.onboarding.v2.draft'], undefined, 'no draft survives to re-prefill the old name/date');
  // The account decision is cleared too, so the next launch resolves to
  // account-entry, not a local-only rehydrate of the (now empty) baby.
  assert.equal(after['lullaby/auth/prefers-local/v1'], undefined, 'the sticky local-first flag is cleared');
});

check('DR5. a FAILED remote delete clears nothing (order-guarded in the provider)', () => {
  // The runtime order is guarded in DA3 (the failure path returns BEFORE the
  // wipe). Here we pin the structural contract: the ONLY caller of the local
  // wipe is deleteAccount, and it is invoked exactly once (never on sign-out /
  // any other transition), so nothing can clear local data outside that path.
  const wipeCalls = AUTH_PROVIDER_SRC.match(/clearLocalAppDataAfterAccountDeletion\s*\(/g) ?? [];
  assert.equal(wipeCalls.length, 1, 'the local wipe is invoked exactly once, in deleteAccount only');
  // The single call site lives inside the deleteAccount callback (not signOut or
  // any other transition) — GP5 separately proves signOut never references it.
  const deleteBody = AUTH_PROVIDER_SRC.slice(
    AUTH_PROVIDER_SRC.indexOf('const deleteAccount'),
    AUTH_PROVIDER_SRC.indexOf('const clearError'),
  );
  assert.ok(
    /clearLocalAppDataAfterAccountDeletion\s*\(/.test(deleteBody),
    'the wipe call sits inside deleteAccount',
  );
});

check('DR6. the device wipe scans the keyset and batch-removes via the pure selector, best-effort', () => {
  const src = ACCOUNT_RESET_STORAGE_SRC;
  assert.ok(src.includes('AsyncStorage.getAllKeys()'), 'it scans the live keyset (covers prefix-keyed stores)');
  assert.ok(src.includes('selectAccountDeletionKeys('), 'it removes exactly what the pure contract selects');
  assert.ok(src.includes('AsyncStorage.multiRemove('), 'it removes them in a single batch');
  assert.ok(src.includes('try {') && src.includes('catch'), 'best-effort — a failed wipe never traps the parent');
});

runAsyncChecks()
  .then(() => {
    console.log(`\nAll ${passed} checks passed ✅`);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
