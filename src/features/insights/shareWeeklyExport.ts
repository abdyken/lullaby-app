/**
 * shareWeeklyExport — opens the OS share sheet with the pure weekly-recap text.
 *
 * A thin, calm wrapper over React Native's Share API: it builds the text with the
 * pure `buildWeeklyExportText` and never throws. A user dismissing the sheet is a
 * normal outcome ('dismissed'), and any platform error is swallowed to 'failed'
 * — the caller shows a calm state either way and the app never crashes.
 *
 * No subscription/purchase logic lives here; the Pro gate is enforced by the
 * caller (canExportWeeklyRecap). This only formats + shares descriptive numbers.
 */
import { Share } from 'react-native';

import { buildWeeklyExportText, type WeeklyExportOptions } from './buildWeeklyExportText';
import type { InsightsViewModel } from './types';

export type WeeklyExportResult = 'shared' | 'dismissed' | 'failed';

export async function shareWeeklyExport(
  viewModel: InsightsViewModel,
  options?: WeeklyExportOptions,
): Promise<WeeklyExportResult> {
  const message = buildWeeklyExportText(viewModel, options);
  try {
    const result = await Share.share({ message });
    // iOS reports an explicit dismiss; Android only reports a share. Either is calm.
    if (result.action === Share.dismissedAction) return 'dismissed';
    return 'shared';
  } catch {
    // Never surface a raw error — the caller degrades calmly.
    return 'failed';
  }
}

export default shareWeeklyExport;
