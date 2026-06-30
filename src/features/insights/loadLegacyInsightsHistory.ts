// Relative (not `@/`) value import so the Node/tsx smoke test can load this pure
// leaf. `LegacyLoggingMapper` has only type-only imports, so it is runtime-free.
import type { LogEvent } from '../../data/models';
import { mapLegacyEvents } from '../logging/data/LegacyLoggingMapper';
import type { CareEvent } from '../logging/domain/types';

/**
 * Adapt the production night history (legacy `LogEvent[]`, the only path with
 * real Supabase sync) into the `CareEvent[]` shape the Insights selectors expect,
 * via the existing, already-tested `LegacyLoggingMapper`. This is what makes
 * Insights (and the weekly recap) work in a default production build, where the
 * V2 logging flag is off and `loadInsightsHistory` returns [].
 *
 * The 7-day windowing happens inside `buildInsightsViewModel`, so the full event
 * list is passed straight through (notes are dropped by the mapper).
 */
export function loadLegacyInsightsHistory(events: LogEvent[]): CareEvent[] {
  return mapLegacyEvents(events);
}
