/**
 * QuickLogButton — one large quick-log card, in the spirit of the Hush
 * reference's `.qbtn`: a soft white card with a rounded tinted icon block on the
 * LEFT and a two-line text column on the right (a label plus a smaller secondary
 * line). Active cards get a faint accent ring (no layout shift) and an accent label.
 *
 * The card surface lives on an inner View — not the Pressable — because on real
 * Android the Pressable's own background doesn't paint reliably (see the project
 * memory note). The Pressable only carries calm opacity feedback.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentType } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import DiaperIcon from '@/assets/icons/quicklog/diaper.svg';
import FeedIcon from '@/assets/icons/quicklog/feed.svg';
import PumpIcon from '@/assets/icons/quicklog/pump.svg';
import SleepIcon from '@/assets/icons/quicklog/sleep.svg';
import { colors, fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

export type QuickLogKind = 'feed' | 'sleep' | 'diaper' | 'pump';

type Props = {
  kind: QuickLogKind;
  label: string;
  /** smaller second line, e.g. "Left · 2h 45m ago" / "Sleep running" / "Log pump" */
  secondary: string;
  active?: boolean;
  /** Native-safe measured width supplied by QuickLogRow. */
  cardWidth?: number;
  /** surface palette — 'day' (default) or 'night' */
  surfaceMode?: SurfaceMode;
  onPress?: () => void;
};

// Solid accent per quick-log kind (Pump = warm yellow, the others their event
// colors). Quick-log isn't an orb AccentState, so it keeps its own small map.
const ACCENT: Record<QuickLogKind, string> = {
  feed: colors.feed,
  sleep: colors.sleep,
  diaper: colors.diaper,
  pump: colors.pump,
};

const CARD_HEIGHT = 82;
const ICON_SIZE = 46;

const ACTIVE_BORDER: Record<QuickLogKind, string> = {
  feed: 'rgba(255,122,61,0.38)',
  sleep: 'rgba(85,96,198,0.36)',
  diaper: 'rgba(35,183,158,0.36)',
  pump: 'rgba(255,177,46,0.42)',
};

const ACTIVE_SURFACE: Record<QuickLogKind, string> = {
  feed: 'rgba(255,122,61,0.06)',
  sleep: 'rgba(85,96,198,0.06)',
  diaper: 'rgba(35,183,158,0.06)',
  pump: 'rgba(255,177,46,0.08)',
};

// Tinted icon-block gradients, verbatim from the reference's `.qbtn .qicon`.
const TILE_GRADIENT: Record<QuickLogKind, [string, string]> = {
  feed: ['#FFE0CC', '#FFD0B6'],
  sleep: ['#E5E8FB', '#D6DBF7'],
  diaper: ['#DAF4EE', '#C9EFE6'],
  pump: ['#FFF0D2', '#FCE6B6'],
};

// Each tile renders its imported single-color SVG (Flaticon), recolored to the
// tile accent. The assets bake their fill on an inner <g>, so a root `fill` prop
// can't override it; they carry fill="currentColor" and take the accent via the
// `color` prop. Sized 22×22 to match the outgoing hand-drawn glyphs.
const TILE_ICON: Record<QuickLogKind, ComponentType<SvgProps>> = {
  feed: FeedIcon,
  sleep: SleepIcon,
  diaper: DiaperIcon,
  pump: PumpIcon,
};

function TileIcon({ kind, color }: { kind: QuickLogKind; color: string }) {
  const Glyph = TILE_ICON[kind];
  return <Glyph width={22} height={22} color={color} />;
}

export function QuickLogButton({
  kind,
  label,
  secondary,
  active = false,
  cardWidth,
  surfaceMode = 'day',
  onPress,
}: Props) {
  const palette = surfaces[surfaceMode];
  const accent = ACCENT[kind];
  const iconColor = accent;
  const labelColor = active ? accent : palette.ink;
  const secondaryLabel = secondary.replace(/^Awake for /, 'Awake ');
  // Visible inactive boundary so the card reads as raised on Android, where the
  // warm iOS box-shadow is ignored (only `elevation` renders, faint on cream).
  // Day uses a soft warm rim; night a white hairline above the palette border.
  const inactiveBorder = surfaceMode === 'night' ? 'rgba(255,255,255,0.22)' : 'rgba(60,40,30,0.14)';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}. ${secondaryLabel}`}
      onPress={onPress}
      style={({ pressed }) => ({
        // Native ScrollView measurement can collapse flex-only children. A
        // measured width from QuickLogRow keeps all four cards equal on device.
        width: cardWidth,
        maxWidth: cardWidth,
        flexGrow: 0,
        flexShrink: 0,
        minWidth: 0,
        opacity: pressed ? 0.82 : 1,
      })}>
      <View
        style={{
          // Fill the Pressable's measured half-row width, and pin a stable
          // height so all four cards match regardless of secondary-line length.
          width: cardWidth ?? '100%',
          height: CARD_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 11,
          backgroundColor: palette.card,
          borderRadius: radii.medium,
          paddingVertical: 13,
          paddingHorizontal: 13,
          // 2px ring at all times so selection never changes the card's size.
          borderWidth: 2,
          borderColor: active ? ACTIVE_BORDER[kind] : inactiveBorder,
          ...shadows.card,
          elevation: 9,
        }}>
        {active ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              borderRadius: radii.medium - 2,
              backgroundColor: ACTIVE_SURFACE[kind],
            }}
          />
        ) : null}
        <LinearGradient
          colors={TILE_GRADIENT[kind]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={{
            width: ICON_SIZE,
            height: ICON_SIZE,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
          <TileIcon kind={kind} color={iconColor} />
        </LinearGradient>

        <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              fontFamily: fonts.displayMedium,
              fontSize: 15.5,
              lineHeight: 19,
              color: labelColor,
              includeFontPadding: false,
            }}>
            {label}
          </Text>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 11,
              lineHeight: 15,
              color: active ? palette.inkSoft : palette.inkFaint,
              marginTop: 3,
              includeFontPadding: false,
            }}>
            {secondaryLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default QuickLogButton;
