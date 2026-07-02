/**
 * Logging v2 — hydration & foreground reconcile (plan §1.3, §6 AppState, Phase 4).
 *
 * Orchestrates the repository reads that (re)build `LoggingState`:
 *   - `hydrateLoggingState` runs after app launch — reads today's events and
 *     active sessions, and restores running timers purely from stored
 *     `startedAt`/`endedAt` (there is no persisted counter to read), so a session
 *     survives a full restart (plan Phase 4 acceptance).
 *   - `reconcileLoggingState` runs when the app returns to the foreground — it
 *     re-reads the same data and recomputes durations from timestamps, so a
 *     session finished on another device drops out and durations stay correct
 *     after time in the background (plan §6 AppState behavior).
 *
 * Pure orchestration over the injected `LoggingRepository` + `Clock` (no React,
 * no AsyncStorage) — testable with the in-memory repository under the Node smoke
 * test. The RN foreground trigger that calls this lives in `appStateReconcile`.
 */
import { loggingError } from '../domain/errors';
import type { CareEvent } from '../domain/types';
import type { ActiveSessionsQuery, LoggingRepository } from '../data/LoggingRepository';
import { mergeCanonicalEvents } from '../data/normalizedEvents';
import type { Clock } from '../timer/clock';
import { isReversedRange } from '../timer/sessionMath';
import {
  applyActiveSessions,
  applyTodayEvents,
  createInitialLoggingState,
  setHydrated,
  withError,
  type LoggingState,
} from './loggingStore';

/** Family + child + caregiver scope for the reads (mirrors `ActiveSessionsQuery`). */
export type LoggingScope = ActiveSessionsQuery;

const ms = (iso: string): number => Date.parse(iso);

function isSameLocalDay(aMs: number, bMs: number): boolean {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function belongsToChildTimeline(event: CareEvent, childId: string): boolean {
  if (event.type === 'pump') return true;
  return event.childId === childId;
}

function isTimelineVisible(event: CareEvent): boolean {
  return event.status !== 'deleted' && event.status !== 'cancelled';
}

function isActiveInContext(event: CareEvent, scope: LoggingScope): boolean {
  if (event.status !== 'active' || event.familyId !== scope.familyId) return false;
  if (event.type === 'pump') return event.subjectUserId === scope.userId;
  return event.childId === scope.childId;
}

function occurredAtMs(event: CareEvent): number {
  return ms(event.occurredAt);
}

function activeStartedAtMs(event: CareEvent): number {
  return ms(event.startedAt ?? event.occurredAt);
}

export function mergeLoggingEventsById(...groups: (readonly CareEvent[])[]): CareEvent[] {
  const [first = [], ...rest] = groups;
  return mergeCanonicalEvents(first, rest.flat());
}

/** Read today's events and active sessions together. */
async function readState(
  repo: LoggingRepository,
  scope: LoggingScope,
): Promise<{ todayEvents: CareEvent[]; activeSessions: CareEvent[] }> {
  const [todayEvents, activeSessions] = await Promise.all([
    repo.getTodayEvents({ familyId: scope.familyId, childId: scope.childId }),
    repo.getActiveSessions(scope),
  ]);
  return { todayEvents, activeSessions };
}

/**
 * Flag a recover/error state if any active session started in the future
 * relative to `now` — i.e. the device clock moved backwards. The session is left
 * in place (it is real, stored data); the error tells the UI to show a recover
 * prompt rather than trusting a negative duration (plan §6).
 */
function detectClockAnomaly(state: LoggingState, now: number): LoggingState {
  const active: (CareEvent | null)[] = [state.activeSleep, state.activeBreastFeed, state.activePump];
  const reversed = active.some(
    (event) => event?.startedAt != null && isReversedRange(event.startedAt, null, now),
  );
  return reversed
    ? withError(
        state,
        loggingError(
          'started_in_future',
          'An active session starts after the current time — check the device clock.',
        ),
      )
    : state;
}

/**
 * Merge events restored by the legacy/Supabase event provider into the v2 store
 * shape. During the migration window this keeps the v2 Today/History selectors
 * pointed at the same restored event source as the visible app shell.
 */
export function mergeExternalLoggingEvents(
  state: LoggingState,
  externalEvents: readonly CareEvent[],
  scope: LoggingScope,
  clock: Clock,
): LoggingState {
  const now = clock.now();
  const externalToday = externalEvents
    .filter((event) => event.familyId === scope.familyId)
    .filter((event) => belongsToChildTimeline(event, scope.childId))
    .filter(isTimelineVisible)
    .filter((event) => isSameLocalDay(occurredAtMs(event), now));
  const externalActive = externalEvents.filter((event) => isActiveInContext(event, scope));
  const currentActive: CareEvent[] = [];
  if (state.activeSleep) currentActive.push(state.activeSleep);
  if (state.activeBreastFeed) currentActive.push(state.activeBreastFeed);
  if (state.activePump) currentActive.push(state.activePump);

  let next = applyTodayEvents(
    state,
    mergeLoggingEventsById(state.todayEvents, externalToday).sort(
      (a, b) => occurredAtMs(b) - occurredAtMs(a),
    ),
  );
  next = applyActiveSessions(
    next,
    mergeLoggingEventsById(currentActive, externalActive).sort(
      (a, b) => activeStartedAtMs(a) - activeStartedAtMs(b),
    ),
    scope.userId,
  );
  return detectClockAnomaly(next, now);
}

/**
 * Build the hydrated state after launch. Active timers are restored from stored
 * timestamps and recomputed against `clock.now()`.
 */
export async function hydrateLoggingState(
  repo: LoggingRepository,
  scope: LoggingScope,
  clock: Clock,
): Promise<LoggingState> {
  const { todayEvents, activeSessions } = await readState(repo, scope);
  let state = createInitialLoggingState();
  state = applyTodayEvents(state, todayEvents);
  state = applyActiveSessions(state, activeSessions, scope.userId);
  state = detectClockAnomaly(state, clock.now());
  return setHydrated(state, true);
}

/**
 * Re-read events and active sessions on foreground, preserving UI-only state
 * (drafts, the live Undo). A session that ended elsewhere drops from the active
 * slots, and durations are recomputed from timestamps. A prior clock error is
 * re-evaluated against the fresh `now`.
 */
export async function reconcileLoggingState(
  repo: LoggingRepository,
  scope: LoggingScope,
  clock: Clock,
  previous: LoggingState,
): Promise<LoggingState> {
  const { todayEvents, activeSessions } = await readState(repo, scope);
  let state = applyTodayEvents({ ...previous, error: null }, todayEvents);
  state = applyActiveSessions(state, activeSessions, scope.userId);
  state = detectClockAnomaly(state, clock.now());
  return setHydrated(state, true);
}
