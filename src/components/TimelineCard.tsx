/**
 * TimelineCard — tonight's events in a calm white card (`.lb-tl-card`).
 *
 * Header: "Tonight" on the left, a visual-only "See all" on the right (it will
 * route to the Log tab later). Rows come from the shared mock store. Includes a
 * warm empty state so the card is never a blank list.
 */
import { Pressable, Text, View } from 'react-native';

import { TimelineItem } from '@/components/TimelineItem';
import type { TimelineEntry } from '@/data/mock';
import { colors, fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

type Props = {
  entries: TimelineEntry[];
  /** accent for the "See all" affordance — calm sleep accent by default */
  accentColor?: string;
  /** Open the lightweight note/spit-up sheet. */
  onAddNote?: () => void;
  /** surface palette — 'day' (default) or 'night' */
  surfaceMode?: SurfaceMode;
};

export function TimelineCard({ entries, accentColor = colors.sleep, onAddNote, surfaceMode = 'day' }: Props) {
  const palette = surfaces[surfaceMode];
  return (
    <View
      style={{
        backgroundColor: palette.card,
        borderRadius: radii.medium,
        borderWidth: surfaceMode === 'night' ? 1 : 0,
        borderColor: palette.border,
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
        <Text style={{ fontFamily: fonts.displayMedium, fontSize: 14.5, color: palette.ink }}>
          Tonight
        </Text>
        {onAddNote ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add note"
            onPress={onAddNote}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11.5, color: accentColor }}>Add note</Text>
          </Pressable>
        ) : (
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11.5, color: accentColor }}>See all</Text>
        )}
      </View>

      {entries.length > 0 ? (
        entries.map((entry, index) => (
          <TimelineItem
            key={entry.id}
            entry={entry}
            isLast={index === entries.length - 1}
            surfaceMode={surfaceMode}
          />
        ))
      ) : (
        <View style={{ paddingVertical: 14 }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: palette.inkSoft }}>
            Nothing logged yet. Tap a tile to start the night.
          </Text>
        </View>
      )}
    </View>
  );
}

export default TimelineCard;
