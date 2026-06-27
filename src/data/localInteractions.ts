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
  createNoteEvent,
  createPumpEvent,
  createSleepEvent,
  endRunningSleep,
  getTonightTimeline,
  hasRunningSleep,
  SEED_ACTOR,
  wasLoggedRecently,
  type DiaperDetails,
  type EventActor,
  type FeedDetails,
  type NoteDetails,
  type PumpDetails,
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
  actor: EventActor = SEED_ACTOR,
): TonightState {
  let events = state.events;

  if (kind === 'sleep') {
    if (!hasRunningSleep(events)) {
      events = [createSleepEvent(now, actor), ...events];
    }
  } else if (!wasLoggedRecently(events, kind, now)) {
    events = [
      kind === 'feed' ? createFeedEvent(now, undefined, actor) : createDiaperEvent(now, undefined, actor),
      ...events,
    ];
  }

  return { events, orbView: kind };
}

export const handleFeedTap = (state: TonightState, now?: number, actor?: EventActor): TonightState =>
  handleQuickLog(state, 'feed', now, actor);

export const handleDiaperTap = (state: TonightState, now?: number, actor?: EventActor): TonightState =>
  handleQuickLog(state, 'diaper', now, actor);

export const handleSleepTap = (state: TonightState, now?: number, actor?: EventActor): TonightState =>
  handleQuickLog(state, 'sleep', now, actor);

/**
 * The orb's contextual primary button:
 *  - sleep  → "Wake baby": end the running sleep, return to calm
 *  - feed   → "End feed":   already logged on tap, just return to calm
 *  - diaper → "Done":       already logged on tap, just return to calm
 *  - calm   → "Start sleep": begin a running sleep
 * Never creates duplicate feed/diaper events.
 */
export function handlePrimaryAction(
  state: TonightState,
  now: number = Date.now(),
  actor: EventActor = SEED_ACTOR,
): TonightState {
  switch (state.orbView) {
    case 'sleep':
      return { events: endRunningSleep(state.events, now), orbView: 'calm' };
    case 'feed':
    case 'diaper':
      return { events: state.events, orbView: 'calm' };
    case 'calm':
    default:
      return {
        events: hasRunningSleep(state.events)
          ? state.events
          : [createSleepEvent(now, actor), ...state.events],
        orbView: 'sleep',
      };
  }
}

/**
 * Append a feed event with optional details (side / amount / duration), e.g.
 * from the Feed sheet. Mirrors handleQuickLog's anti-spam guard: a rapid second
 * save within the dedup window is swallowed (no duplicate) but still selects the
 * feed tile/orb. Bottle = no side (pass {}); Left/Right = { side: 'L' | 'R' }.
 */
export function addFeed(
  state: TonightState,
  details?: FeedDetails,
  now: number = Date.now(),
  actor: EventActor = SEED_ACTOR,
): TonightState {
  if (wasLoggedRecently(state.events, 'feed', now)) {
    return { events: state.events, orbView: 'feed' };
  }
  return { events: [createFeedEvent(now, details, actor), ...state.events], orbView: 'feed' };
}

/**
 * Append a diaper event with optional details (kind / note), e.g. from the
 * Diaper sheet. Same anti-spam guard as addFeed. Wet/Dirty/Mixed map to
 * { kind: 'wet' | 'dirty' | 'both' }.
 */
export function addDiaper(
  state: TonightState,
  details?: DiaperDetails,
  now: number = Date.now(),
  actor: EventActor = SEED_ACTOR,
): TonightState {
  if (wasLoggedRecently(state.events, 'diaper', now)) {
    return { events: state.events, orbView: 'diaper' };
  }
  return { events: [createDiaperEvent(now, details, actor), ...state.events], orbView: 'diaper' };
}

/**
 * Append a note event. Notes are an instant side-log: they never change the
 * orb/active tile, and (unlike feed/diaper) there is no dedup window because a
 * note is always an explicit, intentional entry.
 */
export function addNote(
  state: TonightState,
  details?: NoteDetails,
  now: number = Date.now(),
  actor: EventActor = SEED_ACTOR,
): TonightState {
  return { events: [createNoteEvent(now, details, actor), ...state.events], orbView: state.orbView };
}

/**
 * Append a pump event from the Pump sheet. Like a note, a pump is an instant
 * side-log: it adds to the night's history but never owns an orb state or active
 * quick-log tile (the orb keeps showing the baby's real feed/sleep/diaper
 * context). No dedup window — a pump is always an explicit, intentional entry.
 */
export function addPump(
  state: TonightState,
  details?: PumpDetails,
  now: number = Date.now(),
  actor: EventActor = SEED_ACTOR,
): TonightState {
  return { events: [createPumpEvent(now, details, actor), ...state.events], orbView: state.orbView };
}

/**
 * Remove the most recently created event (by createdAt — robust to the mixed
 * ordering of the seed vs. prepended quick-logs). After removing, the orb view
 * is reconciled: still sleeping if a sleep is running, otherwise calm. A no-op
 * on an empty list.
 */
export function undoLastEvent(state: TonightState): TonightState {
  if (state.events.length === 0) return state;

  let newestIndex = 0;
  for (let i = 1; i < state.events.length; i += 1) {
    if (
      new Date(state.events[i].createdAt).getTime() >
      new Date(state.events[newestIndex].createdAt).getTime()
    ) {
      newestIndex = i;
    }
  }

  const events = state.events.filter((_, index) => index !== newestIndex);
  return { events, orbView: hasRunningSleep(events) ? 'sleep' : 'calm' };
}

/**
 * Supabase-safe Undo: remove only the most recently created event that belongs
 * to `caregiverId`. In a shared two-caregiver night the newest event overall can
 * be the PARTNER's (theirs may land newer over realtime), and Undo must never
 * delete their work — so this scopes the removal to the current caregiver. If
 * this caregiver has nothing to undo it is a calm no-op (returns the same state).
 *
 * Local-only mode keeps using {@link undoLastEvent} (newest overall), which is
 * correct on a single-caregiver device and unchanged.
 */
export function undoLastOwnEvent(state: TonightState, caregiverId: string): TonightState {
  if (state.events.length === 0) return state;

  let newestIndex = -1;
  for (let i = 0; i < state.events.length; i += 1) {
    if (state.events[i].caregiverId !== caregiverId) continue;
    if (
      newestIndex === -1 ||
      new Date(state.events[i].createdAt).getTime() >
        new Date(state.events[newestIndex].createdAt).getTime()
    ) {
      newestIndex = i;
    }
  }

  // Nothing of mine to undo → leave the shared night untouched.
  if (newestIndex === -1) return state;

  const events = state.events.filter((_, index) => index !== newestIndex);
  return { events, orbView: hasRunningSleep(events) ? 'sleep' : 'calm' };
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
