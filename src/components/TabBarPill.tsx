/**
 * TabBarPill — the floating tab-bar pill, presentational and theme-explicit.
 *
 * Shared by BOTH the real (interactive) tab bar (LullabyTabBar) and the
 * full-window theme-reveal overlay (TabBarRevealOverlay) so the current-theme
 * and next-theme layers are pixel-identical in layout — only colours differ.
 *
 * Border is a FILLED inset (outer view = border colour, inner view = surface),
 * never a native borderWidth/borderColor stroke — fills clip to the circular
 * reveal mask, native strokes don't. Shadow (iOS only, theme-stable) lives on
 * the base pill via `withShadow`; the masked copy is shadowless. NO `elevation`
 * anywhere — Android elevation breaks MaskedView compositing and competes with
 * zIndex for draw order (this was the bug). Draw order is zIndex-only.
 */
import { Animated, PixelRatio, Pressable, useWindowDimensions, View } from 'react-native';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabIcon, type TabName } from '@/components/TabIcon';
import { fonts, getAccentForState, tabbar, tabbarSurfaces, type SurfaceMode } from '@/theme';

/** Flip to true to paint each tab-bar layer a bright colour for on-device
 *  diagnosis (base pill = RED, reveal overlay = GREEN, active chip = YELLOW;
 *  the layout paints the RN container BLUE and the safe-area backdrop PURPLE). */
export const TAB_BAR_DEBUG = false;

const TABBAR_BORDER_WIDTH = 1;
// The shell accent (sleep). Theme-independent, so it never changes with the reveal.
const accent = getAccentForState('sleep');

/**
 * The ONE source of tab-bar frame geometry (pill width + bottom offset). Both the
 * real bar (LullabyTabBar) and the reveal overlay (TabBarRevealOverlay) call this
 * so their pills are guaranteed pixel-identical in size and position — no
 * duplicated clamp math drifting between the two. Values are snapped to the
 * device pixel grid so the 1px fake border stays crisp and never shimmers, and so
 * the two layers can never round to different sub-pixels.
 */
export function useTabBarLayout(): { pillWidth: number; paddingBottom: number } {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pillWidth = PixelRatio.roundToNearestPixel(
    Math.max(tabbar.minWidth, Math.min(width - tabbar.sideAllowance, tabbar.maxWidth)),
  );
  const paddingBottom = PixelRatio.roundToNearestPixel(Math.max(insets.bottom + 8, 18));
  return { pillWidth, paddingBottom };
}

export type TabBarTab = {
  key: string;
  label: string;
  iconName: TabName;
  focused: boolean;
  /** omitted for the non-interactive reveal overlay copy */
  onPress?: () => void;
};

function AnimatedTabItem({
  focused,
  label,
  iconName,
  inactiveColor,
  onPress,
  debugChip,
}: {
  focused: boolean;
  label: string;
  iconName: TabName;
  inactiveColor: string;
  onPress: () => void;
  debugChip?: string;
}) {
  const [progress] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: focused ? 1 : 0,
      duration: 190,
      useNativeDriver: false,
    }).start();
  }, [focused, progress]);

  const tint = progress.interpolate({ inputRange: [0, 1], outputRange: [inactiveColor, accent.color] });
  const chipBackground = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(233,235,251,0)', debugChip ?? accent.tint],
  });
  const chipScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const inactiveIconOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const activeIconOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => ({
          width: '100%',
          height: tabbar.tabHeight,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: tabbar.tabRadius,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        })}>
        <Animated.View
          style={{
            minWidth: tabbar.chipMinWidth,
            height: tabbar.chipHeight,
            alignItems: 'center',
            justifyContent: 'center',
            gap: tabbar.chipGap,
            borderRadius: tabbar.chipRadius,
            backgroundColor: chipBackground,
            transform: [{ scale: chipScale }],
          }}>
          <Animated.View
            style={{
              width: tabbar.iconSize,
              height: tabbar.iconSize,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Animated.View style={{ opacity: inactiveIconOpacity }}>
              <TabIcon name={iconName} color={inactiveColor} size={tabbar.iconSize} />
            </Animated.View>
            <Animated.View style={{ position: 'absolute', opacity: activeIconOpacity }}>
              <TabIcon name={iconName} color={accent.color} size={tabbar.iconSize} />
            </Animated.View>
          </Animated.View>
          <Animated.Text
            numberOfLines={1}
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: tabbar.labelSize,
              letterSpacing: 0.1,
              color: tint,
            }}>
            {label}
          </Animated.Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const noop = () => {};

export function TabBarPill({
  themeMode,
  pillWidth,
  tabs,
  withShadow = true,
  debugBorder,
}: {
  themeMode: SurfaceMode;
  pillWidth: number;
  tabs: TabBarTab[];
  /** iOS soft shadow on the base pill only; the masked overlay copy passes false */
  withShadow?: boolean;
  /** debug tint for the pill frame (RED base / GREEN overlay) */
  debugBorder?: string;
}) {
  const palette = tabbarSurfaces[themeMode];
  const debugChip = TAB_BAR_DEBUG ? 'yellow' : undefined;
  return (
    <View
      style={{
        width: pillWidth,
        alignSelf: 'center',
        height: tabbar.height,
        borderRadius: tabbar.radius,
        // "border" as a fill so the circular mask reveals it like normal content
        backgroundColor: debugBorder ?? palette.border,
        padding: TABBAR_BORDER_WIDTH,
        ...(withShadow
          ? {
              shadowColor: tabbar.shadowColor,
              shadowOpacity: tabbar.shadowOpacity,
              shadowRadius: tabbar.shadowRadius,
              shadowOffset: tabbar.shadowOffset,
            }
          : null),
      }}>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: tabbar.radius - TABBAR_BORDER_WIDTH,
          backgroundColor: palette.surface,
          paddingHorizontal: tabbar.paddingX,
          paddingVertical: tabbar.paddingY,
          gap: tabbar.gap,
        }}>
        {tabs.map((tab) => (
          <AnimatedTabItem
            key={tab.key}
            focused={tab.focused}
            label={tab.label}
            iconName={tab.iconName}
            inactiveColor={palette.inactiveColor}
            onPress={tab.onPress ?? noop}
            debugChip={debugChip}
          />
        ))}
      </View>
    </View>
  );
}

export default TabBarPill;
