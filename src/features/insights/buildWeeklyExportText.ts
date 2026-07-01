/**
 * buildWeeklyExportText — the first real Pro feature: a plain-text weekly recap a
 * parent can keep or share. PURE and dependency-free (it imports only a type), so
 * it is unit-testable under Node and safe to reuse anywhere.
 *
 * It restates ONLY the descriptive per-day rhythm already in the InsightsViewModel
 * (sleep average + weekly total, feeds/day, diaper changes/day). It is strictly
 * calm and non-medical: no diagnosis, no prediction, no recommendation.
 *
 * It deliberately carries NONE of the sensitive surface: no baby name, no note /
 * freeform text, no feed volumes, no diaper detail, no raw ids, no Supabase
 * URL/key, no invite code, and no payment links — the InsightsViewModel it reads
 * exposes only aggregate numbers, and this builder only ever emits those.
 */
import type { InsightsViewModel } from './types';

export type WeeklyExportOptions = {
  /** Pin the "generated" date for deterministic output (tests). */
  generatedAt?: Date;
  /** Human label for the window; defaults to "the last 7 days". */
  periodLabel?: string;
};

const TITLE = 'Lullaby weekly summary';
const SAFETY_LINE = 'This is a calm summary of what you logged, not medical advice.';
const SPARSE_LINE = 'Keep logging to build a clearer weekly summary.';

/** Minutes → "45m" / "6h" / "6h 30m". */
function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function formatDayCount(days: number): string {
  const count = Math.max(0, Math.round(days));
  return count === 1 ? '1 day' : `${count} days`;
}

export function buildWeeklyExportText(
  viewModel: InsightsViewModel,
  options: WeeklyExportOptions = {},
): string {
  const periodLabel = options.periodLabel ?? 'the last 7 days';
  const lines: string[] = [TITLE, '', SAFETY_LINE, ''];

  if (!viewModel.hasEnoughData) {
    // Sparse data → calm fallback instead of thin, misleading numbers.
    lines.push(SPARSE_LINE);
  } else {
    const { feedsPerDay, sleepPerDay, diapersPerDay } = viewModel.stats;
    const totalSleepMinutes = viewModel.weeklySleep.reduce((sum, day) => sum + day.minutes, 0);
    const sleepAverage = `${sleepPerDay.value}${sleepPerDay.unit ?? ''}`;

    lines.push(`Days logged: ${formatDayCount(viewModel.dataDays)} in ${periodLabel}.`);
    if (totalSleepMinutes > 0) {
      lines.push(`Sleep: about ${sleepAverage} a day (${formatMinutes(totalSleepMinutes)} total).`);
    } else {
      lines.push('Sleep: no completed sleep logged yet.');
    }
    lines.push(`Feeds: about ${feedsPerDay.value} a day.`);
    lines.push(`Diaper changes: about ${diapersPerDay.value} a day.`);
  }

  if (options.generatedAt) {
    lines.push('');
    lines.push(`Generated ${options.generatedAt.toISOString().slice(0, 10)}.`);
  }

  return lines.join('\n');
}

export default buildWeeklyExportText;
