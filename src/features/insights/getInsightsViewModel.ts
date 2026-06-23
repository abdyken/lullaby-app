import { getInsightsSevenDayHistory } from '@/features/logging/application/getInsightsSevenDayHistory';
import type { LoggingRepository, TodayEventsQuery } from '@/features/logging/data/LoggingRepository';

import { buildInsightsViewModel } from './insightSelectors';
import type { InsightsViewModel } from './types';

export interface GetInsightsViewModelInput {
  repo: LoggingRepository;
  scope: TodayEventsQuery;
  nowMs?: number;
}

export async function getInsightsViewModel({
  repo,
  scope,
  nowMs = Date.now(),
}: GetInsightsViewModelInput): Promise<InsightsViewModel> {
  const events = await getInsightsSevenDayHistory(repo, scope, nowMs);
  return buildInsightsViewModel({ events, now: nowMs });
}
