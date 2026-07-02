// Relative (not `@/`) value import so the Node/tsx smoke test can load this pure
// leaf. `LegacyLoggingMapper` has only type-only imports, so it is runtime-free.
import type { LogEvent } from '../../data/models';
import { mapLegacyEvents } from '../logging/data/LegacyLoggingMapper';
import type { CareEvent } from '../logging/domain/types';

/**
 * Adapt the production night history (legacy `LogEvent[]`, the only path with
 * real Supabase sync) into the `CareEvent[]` shape the Insights selectors expect,
 * via the existing, already-tested `LegacyLoggingMapper`. This remains useful
 * for compatibility tests and any explicit legacy fixture migration.
 *
 * The 7-day windowing happens inside `buildInsightsViewModel`, so the full event
 * list is passed straight through. Notes map through; Insights ignores them.
 */
export function loadLegacyInsightsHistory(events: LogEvent[]): CareEvent[] {
  return mapLegacyEvents(events);
}
