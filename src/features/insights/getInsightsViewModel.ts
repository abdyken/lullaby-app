import type { CareEvent } from '@/features/logging/domain/types';

import { buildInsightsViewModel } from './insightSelectors';
import type { InsightsViewModel } from './types';

export interface GetInsightsViewModelInput {
  loadHistory: (nowMs: number) => Promise<CareEvent[]>;
  nowMs?: number;
}

export async function getInsightsViewModel({
  loadHistory,
  nowMs = Date.now(),
}: GetInsightsViewModelInput): Promise<InsightsViewModel> {
  const events = await loadHistory(nowMs);
  return buildInsightsViewModel({ events, now: nowMs });
}
