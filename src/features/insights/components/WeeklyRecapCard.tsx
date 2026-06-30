/**
 * WeeklyRecapCard — a FREE, calm weekly recap built entirely from the data the
 * Insights screen already loaded (`InsightsViewModel`). No new plumbing.
 *
 * Copy is strictly descriptive: it restates what the parent logged (per-day
 * averages + total sleep this week). No diagnosis, no prediction, no
 * "normal/abnormal", no prescription — matching the app's reassurance tone.
 */
import { Text, View } from 'react-native';

import { useTheme } from '@/state/ThemeProvider';
import { fonts, surfaces } from '@/theme';

import type { InsightsViewModel } from '../types';
import { InsightsSectionCard } from './InsightsSectionCard';

function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

const SAFETY_LINE =
  'Patterns can vary night to night. This is a calm summary of what you logged, not medical advice.';

export function WeeklyRecapCard({ viewModel }: { viewModel: InsightsViewModel }) {
  const { mode } = useTheme();
  const palette = surfaces[mode];

  const { feedsPerDay, sleepPerDay, diapersPerDay } = viewModel.stats;
  const totalSleep = formatMinutes(viewModel.weeklySleep.reduce((sum, day) => sum + day.minutes, 0));
  const sleepAvg = `${sleepPerDay.value}${sleepPerDay.unit ?? ''}`;

  const summary =
    `So far this week your baby has slept about ${sleepAvg} a day (${totalSleep} total), ` +
    `with around ${feedsPerDay.value} feeds and ${diapersPerDay.value} diaper changes a day.`;

  return (
    <InsightsSectionCard title="This week">
      <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, color: palette.ink }}>
        {summary}
      </Text>
      <View style={{ marginTop: 8 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: palette.inkFaint }}>
          {SAFETY_LINE}
        </Text>
      </View>
    </InsightsSectionCard>
  );
}

export default WeeklyRecapCard;
