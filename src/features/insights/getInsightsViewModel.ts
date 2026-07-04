import type { CareEvent } from '@/features/logging/domain/types';

import { buildInsightsViewModel } from './insightSelectors';
import type { InsightsViewModel } from './types';

export interface GetInsightsViewModelInput {
  loadHistory: (nowMs: number) => Promise<CareEvent[]>;
  nowMs?: number;
  /** Local-day window size; defaults to the free 7-day view. The caller's
   * `loadHistory` must cover at least this window. */
  windowDays?: number;
}

export async function getInsightsViewModel({
  loadHistory,
  nowMs = Date.now(),
  windowDays,
}: GetInsightsViewModelInput): Promise<InsightsViewModel> {
  const events = await loadHistory(nowMs);
  return buildInsightsViewModel({ events, now: nowMs, windowDays });
}
