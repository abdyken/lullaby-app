/**
 * QuickLogButton — one tinted quick-log tile, translated from `.lb-q` in the
 * mockup: a soft white card with a rounded tinted icon square, a small bold
 * label, and a warm shadow. Active tiles get an accent ring (no layout shift)
 * and accent-colored label; "More" is muted because it's a P1 overflow.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { fonts, getAccentForState, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

export type QuickLogKind = 'feed' | 'sleep' | 'diaper' | 'note' | 'more';

type Props = {
  kind: QuickLogKind;
  label: string;
  active?: boolean;
  /** muted, non-committal look (used by More) */
  muted?: boolean;
  /** surface palette — 'day' (default) or 'night' */
  surfaceMode?: SurfaceMode;
  onPress?: () => void;
};

// Tinted icon-square gradients, verbatim from the mockup's `.lb-q .lb-qi`.
const TILE_GRADIENT: Record<QuickLogKind, [string, string]> = {
  feed: ['#FFE0CC', '#FFD0B6'],
  sleep: ['#E5E8FB', '#D6DBF7'],
  diaper: ['#DAF4EE', '#C9EFE6'],
  // note + more share the calm neutral cream tile (no new color introduced)
  note: ['#F2ECE6', '#ECE4DC'],
  more: ['#F2ECE6', '#ECE4DC'],
};

function TileIcon({ kind, color }: { kind: QuickLogKind; color: string }) {
  const sw = 1.9;
  if (kind === 'feed') {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
          d="M9 2h6M10 2v3.5a4 4 0 0 0-1.2 2.8L8 19a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3l-.8-10.7A4 4 0 0 0 14 5.5V2"
          stroke={color}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <Path d="M8.4 12h7.2" stroke={color} strokeWidth={sw} />
      </Svg>
    );
  }
  if (kind === 'sleep') {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
          d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
          stroke={color}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  if (kind === 'diaper') {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
          d="M3 7h18l-1.5 4.5A8 8 0 0 1 12 17a8 8 0 0 1-7.5-5.5L3 7Z"
          stroke={color}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <Path d="M9 11c1 1.2 5 1.2 6 0" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      </Svg>
    );
  }
  if (kind === 'note') {
    // a calm stroke-based pencil, same 1.9 stroke style as the other tiles
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
          d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
          stroke={color}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <Path d="M15 5l4 4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      </Svg>
    );
  }
  // more — a calm horizontal ellipsis (the P1 overflow: pump / bottle / medicine)
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={5} cy={12} r={1.8} fill={color} />
      <Circle cx={12} cy={12} r={1.8} fill={color} />
      <Circle cx={19} cy={12} r={1.8} fill={color} />
    </Svg>
  );
}

export function QuickLogButton({
  kind,
  label,
  active = false,
  muted = false,
  surfaceMode = 'day',
  onPress,
}: Props) {
  const palette = surfaces[surfaceMode];
  // note + more are neutral (no per-state accent); the rest map to their state accent
  const neutral = kind === 'more' || kind === 'note';
  const accent = neutral ? null : getAccentForState(kind);
  const iconColor = muted
    ? palette.inkFaint
    : kind === 'note'
      ? palette.inkSoft
      : (accent?.color ?? palette.inkFaint);
  const labelColor = active ? accent?.color ?? palette.inkSoft : muted ? palette.inkFaint : palette.inkSoft;
  // Visible inactive boundary so the tile reads as a card on Android, where the
  // warm iOS box-shadow is ignored (only `elevation` renders, and it's far too
  // faint on cream). Day uses a soft warm rim (matching the warm shadow palette)
  // — stronger than the near-white `line` hairline, which barely read on-device
  // — and night uses a white hairline well above the shared 0.07 palette border.
  const inactiveBorder = surfaceMode === 'night' ? 'rgba(255,255,255,0.22)' : 'rgba(60,40,30,0.14)';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: muted }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        opacity: muted ? 0.6 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}>
      <View
        style={{
          alignItems: 'center',
          gap: 6,
          backgroundColor: palette.card,
          borderRadius: radii.small,
          paddingTop: 11,
          paddingBottom: 9,
          paddingHorizontal: 6,
          // 2px ring at all times so selection never changes the tile's size:
          // accent when active, otherwise a visible hairline (never transparent,
          // which is what made the tile vanish on Android).
          borderWidth: 2,
          borderColor: active ? accent?.color ?? inactiveBorder : inactiveBorder,
          ...shadows.card,
          // Lift the tile a little more on Android so it reads as a raised card,
          // closer to the elevated web look (web keeps the warm shadow above).
          elevation: 9,
        }}>
        <LinearGradient
          colors={TILE_GRADIENT[kind]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={{
            width: 38,
            height: 38,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: active ? 1.05 : 1 }],
          }}>
          <TileIcon kind={kind} color={iconColor} />
        </LinearGradient>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: labelColor }}>{label}</Text>
      </View>
    </Pressable>
  );
}

export default QuickLogButton;
