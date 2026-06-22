/**
 * TimelineItem — one row of the tonight timeline (`.lb-tl-item`): a time, a
 * colored rounded dot with a kind icon, the event label, and a small caregiver
 * chip. A subtle vertical connector threads the dots between rows.
 */
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { TimelineEntry } from '@/data/mock';
import { colors, fonts, surfaces, type SurfaceMode } from '@/theme';

type Props = {
  entry: TimelineEntry;
  isLast: boolean;
  /** surface palette — 'day' (default) or 'night' */
  surfaceMode?: SurfaceMode;
};

// time(34) + gap(12) + dot center(14) → connector sits under the dot column
const CONNECTOR_LEFT = 34 + 12 + 13;

// note reuses the calm sleep tones (no new colors); not surfaced in the UI yet.
const KIND_TINT: Record<TimelineEntry['kind'], string> = {
  feed: colors.feedTint,
  sleep: colors.sleepTint,
  diaper: colors.diaperTint,
  pump: colors.pumpTint,
  note: colors.sleepTint,
};

const KIND_COLOR: Record<TimelineEntry['kind'], string> = {
  feed: colors.feed,
  sleep: colors.sleep,
  diaper: colors.diaper,
  pump: colors.pump,
  note: colors.sleep,
};

function DotIcon({ kind, color }: { kind: TimelineEntry['kind']; color: string }) {
  const sw = 1.9;
  if (kind === 'feed') {
    return (
      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
        <Path
          d="M9 2h6M10 2v3.5a4 4 0 0 0-1.2 2.8L8 19a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3l-.8-10.7A4 4 0 0 0 14 5.5V2"
          stroke={color}
          strokeWidth={sw}
        />
      </Svg>
    );
  }
  if (kind === 'diaper') {
    return (
      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
        <Path d="M3 7h18l-1.5 4.5A8 8 0 0 1 12 17a8 8 0 0 1-7.5-5.5L3 7Z" stroke={color} strokeWidth={sw} />
      </Svg>
    );
  }
  if (kind === 'pump') {
    return (
      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
        <Path
          d="M7 21h10M8 21V11h8v10M6 11h12M9 11V7a3 3 0 0 1 6 0v4"
          stroke={color}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  // sleep + note fall back to the moon glyph
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke={color} strokeWidth={sw} />
    </Svg>
  );
}

export function TimelineItem({ entry, isLast, surfaceMode = 'day' }: Props) {
  const initial = entry.caregiverName?.trim().charAt(0).toUpperCase() ?? '';
  const palette = surfaces[surfaceMode];

  return (
    <View style={{ position: 'relative' }}>
      {!isLast ? (
        <View
          style={{
            position: 'absolute',
            left: CONNECTOR_LEFT,
            top: 34,
            bottom: -8,
            width: 2,
            backgroundColor: palette.line,
          }}
        />
      ) : null}

      <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 8 }}>
        <Text
          style={{
            width: 34,
            paddingTop: 6,
            fontFamily: fonts.bodyBold,
            fontSize: 11.5,
            color: palette.inkFaint,
          }}>
          {entry.time}
        </Text>

        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: KIND_TINT[entry.kind],
            zIndex: 1,
          }}>
          <DotIcon kind={entry.kind} color={KIND_COLOR[entry.kind]} />
        </View>

        <View style={{ flex: 1, paddingTop: 1 }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: palette.ink }}>
            {entry.label}
          </Text>
          {entry.detail ? (
            <Text style={{ marginTop: 2, fontFamily: fonts.body, fontSize: 11.5, color: palette.inkSoft }}>
              {entry.detail}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            {entry.caregiverName && entry.caregiverColor ? (
              <>
                <View
                  style={{
                    width: 17,
                    height: 17,
                    borderRadius: 9,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: entry.caregiverColor,
                  }}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 8.5, color: colors.white }}>
                    {initial}
                  </Text>
                </View>
                <Text style={{ fontFamily: fonts.body, fontSize: 11.5, color: palette.inkSoft }}>
                  {entry.caregiverName}
                </Text>
              </>
            ) : (
              <Text style={{ fontFamily: fonts.body, fontSize: 11.5, color: palette.inkSoft }}>
                On the clock
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

export default TimelineItem;
