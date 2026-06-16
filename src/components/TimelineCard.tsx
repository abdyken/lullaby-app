/**
 * TimelineCard — tonight's events in a calm white card (`.lb-tl-card`).
 *
 * Header: "Tonight" on the left, a visual-only "See all" on the right (it will
 * route to the Log tab later). Rows come from the shared mock store. Includes a
 * warm empty state so the card is never a blank list.
 */
import { Text, View } from 'react-native';

import { TimelineItem } from '@/components/TimelineItem';
import type { TimelineEntry } from '@/data/mock';
import { colors, fonts, radii, shadows } from '@/theme';

type Props = {
  entries: TimelineEntry[];
  /** accent for the "See all" affordance — calm sleep accent by default */
  accentColor?: string;
};

export function TimelineCard({ entries, accentColor = colors.sleep }: Props) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.medium,
        paddingTop: 15,
        paddingHorizontal: 16,
        paddingBottom: 7,
        ...shadows.card,
      }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}>
        <Text style={{ fontFamily: fonts.displayMedium, fontSize: 14.5, color: colors.ink }}>
          Tonight
        </Text>
        {/* visual-only for now — Log routing comes later */}
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11.5, color: accentColor }}>See all</Text>
      </View>

      {entries.length > 0 ? (
        entries.map((entry, index) => (
          <TimelineItem key={entry.id} entry={entry} isLast={index === entries.length - 1} />
        ))
      ) : (
        <View style={{ paddingVertical: 14 }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.inkSoft }}>
            Nothing logged yet tonight. Tap a quick-log tile above to start the night.
          </Text>
        </View>
      )}
    </View>
  );
}

export default TimelineCard;
