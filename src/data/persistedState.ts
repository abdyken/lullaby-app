/**
 * Pure (de)serialization + validation for the persisted local night state.
 *
 * Deliberately free of React and AsyncStorage so it stays runnable under plain
 * Node/tsx (the smoke test exercises it). The actual AsyncStorage I/O lives in
 * './localStorage', which is the only place that touches the device.
 *
 * We persist ONLY the local night loop: the event list + the current orb view.
 * Baby profile, caregivers, settings, etc. are NOT persisted here.
 */
import type { TonightState } from './localInteractions';
import type { OrbView } from './currentState';
import type { LogEvent, LogEventType } from './models';

/** AsyncStorage key. Versioned so a future shape change can bump `/v2`. */
export const STORAGE_KEY = 'lullaby/local-events/v1';

const ORB_VIEWS: readonly OrbView[] = ['calm', 'feed', 'sleep', 'diaper'];
const EVENT_TYPES: readonly LogEventType[] = ['feed', 'sleep', 'diaper', 'pump'];

function isOrbView(value: unknown): value is OrbView {
  return typeof value === 'string' && (ORB_VIEWS as readonly string[]).includes(value);
}

/** Minimal structural check — enough to trust a row without crashing the UI. */
function isLogEvent(value: unknown): value is LogEvent {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.babyId === 'string' &&
    typeof e.caregiverId === 'string' &&
    typeof e.type === 'string' &&
    (EVENT_TYPES as readonly string[]).includes(e.type) &&
    typeof e.startAt === 'string' &&
    (e.endAt === null || typeof e.endAt === 'string') &&
    typeof e.createdAt === 'string' &&
    typeof e.meta === 'object' &&
    e.meta !== null
  );
}

/** Serialize only the fields we persist (events + orbView). */
export function serializeState(state: TonightState): string {
  return JSON.stringify({ events: state.events, orbView: state.orbView });
}

/**
 * Parse + validate a stored string into a TonightState. Returns null for
 * anything we don't fully trust (not JSON, not an object, bad events array, or
 * an unknown orbView) so the caller can fall back to the seed without crashing.
 */
export function parsePersistedState(raw: string | null | undefined): TonightState | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.events) || !obj.events.every(isLogEvent)) return null;
  if (!isOrbView(obj.orbView)) return null;

  return { events: obj.events as LogEvent[], orbView: obj.orbView };
}
