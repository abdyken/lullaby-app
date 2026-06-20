/**
 * TonightStatus — the compact "time since last…" strip on Tonight (P0.5).
 *
 * Answers the #1 night question at a glance — when did she last eat / change,
 * and is she asleep — without making the parent think. Three calm columns in a
 * single card. Strictly descriptive: no goals, targets, predictions, or
 * judgement. Reads the pure buildTonightStatus() over the shared local events.
 *
 * Night-aware via `surfaceMode` (default 'day'), so day is unchanged and the
 * card stays readable on the low-glare night surface.
 */
import { Text, View } from 'react-native';

import { buildTonightStatus, type TonightStatusItem } from '@/data/currentState';
import type { LogEvent } from '@/data/models';
import { fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

type Props = {
  events: LogEvent[];
  /** Frozen clock — passed so the "X ago" values don't shift mid theme-reveal. */
  now?: number;
  /**
   * Precomputed status columns. When provided (e.g. the loggingV2 path), these
   * are rendered instead of deriving from `events`, so the strip can read the v2
   * store. Omitted → derived from `events` exactly as before.
   */
  items?: TonightStatusItem[];
  surfaceMode?: SurfaceMode;
};

export function TonightStatus({ events, now, items: itemsProp, surfaceMode = 'day' }: Props) {
  const palette = surfaces[surfaceMode];
  const items = itemsProp ?? buildTonightStatus(events, now);

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: palette.card,
        borderRadius: radii.medium,
        borderWidth: surfaceMode === 'night' ? 1 : 0,
        borderColor: palette.border,
        paddingVertical: 14,
        paddingHorizontal: 8,
        ...shadows.card,
      }}>
      {items.map((item, index) => (
        <View
          key={item.key}
          style={{
            flex: 1,
            alignItems: 'center',
            paddingHorizontal: 4,
            borderLeftWidth: index === 0 ? 0 : 1,
            borderLeftColor: palette.line,
          }}>
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 9.5,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color: palette.inkFaint,
              textAlign: 'center',
            }}>
            {item.label}
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={{
              fontFamily: fonts.display,
              fontSize: 16,
              color: palette.ink,
              marginTop: 4,
              textAlign: 'center',
            }}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default TonightStatus;
