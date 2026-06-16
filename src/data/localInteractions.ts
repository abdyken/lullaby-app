/**
 * Pure, UI-free local interaction logic for the Tonight screen.
 *
 * Everything here is a plain function of (state, now) → new state, with no React
 * and no side effects, so it can be exercised by a Node smoke test without a
 * phone (see scripts/check-local-interactions.ts). The Tonight screen is a thin
 * wrapper that holds this state in `useState` and calls these helpers.
 *
 * Sibling modules are imported relatively so this stays runnable under plain
 * Node/tsx (no '@/' alias or React Native in the runtime graph).
 */
import {
  createDiaperEvent,
  createFeedEvent,
  createSleepEvent,
  endRunningSleep,
  getTonightTimeline,
  hasRunningSleep,
  wasLoggedRecently,
  type TimelineEntry,
} from './mock';
import type { OrbView, PreviewState } from './currentState';
import type { LogEvent } from './models';

/** Everything the Tonight screen needs to remember locally. */
export type TonightState = {
  events: LogEvent[];
  orbView: OrbView;
};

/** Only the newest few events belong on the Tonight home; the rest live in Log. */
export const TIMELINE_LIMIT = 4;

/** Build the starting state from a seed list (a copy — never mutates the seed). */
export function initTonightState(seed: LogEvent[]): TonightState {
  return {
    events: [...seed],
    orbView: hasRunningSleep(seed) ? 'sleep' : 'calm',
  };
}

/**
 * Quick-log tap. Appends at most one event of `kind`:
 *  - sleep: only if no sleep is already running
 *  - feed/diaper: only if one wasn't logged in the recent dedup window
 * Always switches the orb/active tile to that kind.
 */
export function handleQuickLog(
  state: TonightState,
  kind: PreviewState,
  now: number = Date.now(),
): TonightState {
  let events = state.events;

  if (kind === 'sleep') {
    if (!hasRunningSleep(events)) {
      events = [createSleepEvent(now), ...events];
    }
  } else if (!wasLoggedRecently(events, kind, now)) {
    events = [kind === 'feed' ? createFeedEvent(now) : createDiaperEvent(now), ...events];
  }

  return { events, orbView: kind };
}

export const handleFeedTap = (state: TonightState, now?: number): TonightState =>
  handleQuickLog(state, 'feed', now);

export const handleDiaperTap = (state: TonightState, now?: number): TonightState =>
  handleQuickLog(state, 'diaper', now);

export const handleSleepTap = (state: TonightState, now?: number): TonightState =>
  handleQuickLog(state, 'sleep', now);

/**
 * The orb's contextual primary button:
 *  - sleep  → "Wake baby": end the running sleep, return to calm
 *  - feed   → "End feed":   already logged on tap, just return to calm
 *  - diaper → "Done":       already logged on tap, just return to calm
 *  - calm   → "Start sleep": begin a running sleep
 * Never creates duplicate feed/diaper events.
 */
export function handlePrimaryAction(state: TonightState, now: number = Date.now()): TonightState {
  switch (state.orbView) {
    case 'sleep':
      return { events: endRunningSleep(state.events), orbView: 'calm' };
    case 'feed':
    case 'diaper':
      return { events: state.events, orbView: 'calm' };
    case 'calm':
    default:
      return {
        events: hasRunningSleep(state.events)
          ? state.events
          : [createSleepEvent(now), ...state.events],
        orbView: 'sleep',
      };
  }
}

/** Which quick-log tile is active (null in the calm state). */
export function selectActiveTile(state: TonightState): PreviewState | null {
  return state.orbView === 'calm' ? null : state.orbView;
}

/** The capped Tonight timeline (newest first, at most TIMELINE_LIMIT rows). */
export function cappedTimeline(
  state: TonightState,
  now: number = Date.now(),
  limit: number = TIMELINE_LIMIT,
): TimelineEntry[] {
  return getTonightTimeline(state.events, now).slice(0, limit);
}
