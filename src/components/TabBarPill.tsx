/**
 * TabBarPill — the floating tab-bar pill, presentational and theme-explicit.
 *
 * Used by the real interactive tab bar. Geometry is deterministic and fixed so
 * route changes can recolour and slide the indicator without moving tab content.
 *
 * ACTIVE-TAB MOTION (Reanimated, UI thread):
 *  - There is ONE moving tint pill (the lavender chip) that SLIDES between tab
 *    slots via translateX — never a per-tab background crossfade. A single shared
 *    value `activeIndex` (a float that springs between integer slot indices) is
 *    the SOLE source of truth: it drives the pill's translateX, icon opacity,
 *    and label colour. It never changes tab content layout or scale.
 *    So the pill, icons, and labels all update as one continuous gesture instead of
 *    several independent JS-thread fades fighting the screen transition.
 *  - Slot geometry is computed DETERMINISTICALLY from `pillWidth` (equal flex
 *    slots, known padding/gap), not measured with onLayout.
 *  - `activeIndex` is INITIALISED to the focused slot (not 0), so first paint
 *    starts in the right place. Only a real focus change springs it.
 *
 * ANDROID RULES (load-bearing — do not "simplify" away):
 *  - The fake border is a FILLED inset (outer view = border colour, inner view =
 *    surface), NEVER a native borderWidth/borderColor stroke.
 *  - NO `elevation` anywhere in this tree (incl. the animated pill). Draw order is
 *    document-order only (the moving pill is the first child of the surface row,
 *    so it sits behind the icons/labels).
 *  - We animate transform / opacity / colour only — never native
 *    borderWidth/borderColor, and never per-frame layout props (left/width/margin).
 *
 * EXTENDING THE BAR: every theme-dependent visual (badges, extra chips, icons,
 * labels, backgrounds, outlines) MUST live inside this component and take its
 * colour from `palette` — i.e. be driven by the `themeMode` prop.
 */
import { useEffect } from 'react';
import { PixelRatio, Pressable, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabIcon, type TabName } from '@/components/TabIcon';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { getAccentForState, tabbar, tabbarSurfaces, type SurfaceMode } from '@/theme';

const TABBAR_BORDER_WIDTH = 1;
/** Tabs in the navigator. Used for deterministic slot geometry. */
const TAB_COUNT = 4;
// The shell accent (sleep). Theme-independent, so tab focus motion stays stable.
const accent = getAccentForState('sleep');

/**
 * Soft-but-responsive spring for the sliding pill / colour crossfade. Damping and
 * stiffness sit in the "premium, settles without overshoot wobble" band.
 */
const PILL_SPRING = { damping: 26, stiffness: 220, mass: 1 } as const;

/**
 * Subtle settled grow on the ACTIVE icon — a touch of liveliness on select.
 * It rides the SAME `activeIndex`/`tabProgress` driver as the pill slide and
 * colour cross-fade (no new shared value, no new spring), so it costs nothing
 * extra on the UI thread. Derived from tabProgress it only ever eases up to
 * 1 + this bonus and settles — PILL_SPRING's ~0.3% index overshoot maps to a
 * sub-perceptible <0.02% scale ripple, so it reads as settled/no-bounce, in the
 * spirit of the usePressScale (overshootClamping) standard. Kept small on
 * purpose — a calm night app, not a toy.
 */
const ACTIVE_ICON_SCALE_BONUS = 0.06;

/**
 * The ONE source of tab-bar frame geometry (pill width + bottom offset). Both the
 * real bar and any callers use this so the pill is pixel-snapped in size and
 * position. Values are snapped to the device pixel grid so the 1px fake border
 * stays crisp and never shimmers.
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

/**
 * Deterministic geometry for the sliding tint pill, derived purely from
 * `pillWidth`. The inner surface row is `pillWidth - 2*border` wide with equal
 * `paddingX`/`gap`, so the tab slots are evenly spaced and the pill only
 * ever needs a linear translateX — no width animation, no measuring.
 */
function pillGeometry(pillWidth: number) {
  const innerRowWidth = pillWidth - 2 * TABBAR_BORDER_WIDTH;
  const contentWidth = innerRowWidth - 2 * tabbar.paddingX;
  const slotWidth = (contentWidth - (TAB_COUNT - 1) * tabbar.gap) / TAB_COUNT;
  // distance between adjacent slot centres == distance between slot left edges
  const slotStep = slotWidth + tabbar.gap;
  // fixed-width pill, centred in a slot
  const pillItemWidth = tabbar.chipMinWidth;
  // absolute insets are measured from the row's padding edge, so add paddingX/Y back
  const pillLeft = tabbar.paddingX + (slotWidth - pillItemWidth) / 2;
  const innerRowHeight = tabbar.height - 2 * TABBAR_BORDER_WIDTH;
  const pillTop = tabbar.paddingY + (innerRowHeight - 2 * tabbar.paddingY - tabbar.chipHeight) / 2;
  return { slotStep, pillItemWidth, pillLeft, pillTop };
}

/** 1 when this tab is fully active, 0 when ≥1 slot away (linear in between). */
function tabProgress(activeIndex: number, index: number) {
  'worklet';
  return 1 - Math.min(Math.abs(activeIndex - index), 1);
}

export type TabBarTab = {
  key: string;
  label: string;
  iconName: TabName;
  focused: boolean;
  onPress?: () => void;
};

function AnimatedTabItem({
  index,
  activeIndex,
  focused,
  label,
  iconName,
  inactiveColor,
  motionEnabled,
  onPress,
}: {
  index: number;
  /** shared float index driving every active-state visual (single source of truth) */
  activeIndex: SharedValue<number>;
  /** static navigator focus — drives accessibility only (never read shared value in render) */
  focused: boolean;
  label: string;
  iconName: TabName;
  inactiveColor: string;
  /** Reduce Motion gate — false (RM on / unknown) freezes the active-icon grow */
  motionEnabled: boolean;
  onPress: () => void;
}) {
  // Cross-fade two stacked icons (muted ↔ accent) — SVG stroke colour can't be
  // animated directly, so opacity is the UI-thread-friendly way to retint.
  const inactiveIconStyle = useAnimatedStyle(() => {
    return { opacity: 1 - tabProgress(activeIndex.value, index) };
  }, [index]);
  const activeIconStyle = useAnimatedStyle(() => {
    return { opacity: tabProgress(activeIndex.value, index) };
  }, [index]);
  // Settled grow on the active icon — same tabProgress driver as the cross-fade
  // above (no new shared value/spring). RM off → flat scale 1 (instant active
  // state, no motion). A transform on the icon's OWN box only, so it grows in
  // place and never reflows the sibling tabs.
  const iconScaleStyle = useAnimatedStyle(() => {
    const grow = motionEnabled ? ACTIVE_ICON_SCALE_BONUS * tabProgress(activeIndex.value, index) : 0;
    return { transform: [{ scale: 1 + grow }] };
  }, [index, motionEnabled]);

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
          opacity: pressed ? 0.85 : 1,
        })}>
        {/* Icons only — labels are hidden. The tab name still reaches screen
            readers via the Pressable's accessibilityLabel above. The icon sits
            centred in the chip (no label row to balance against). */}
        <View
          style={{
            minWidth: tabbar.chipMinWidth,
            height: tabbar.chipHeight,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Animated.View
            style={[
              {
                width: tabbar.iconSize,
                height: tabbar.iconSize,
                alignItems: 'center',
                justifyContent: 'center',
              },
              iconScaleStyle,
            ]}>
            <Animated.View style={inactiveIconStyle}>
              <TabIcon name={iconName} color={inactiveColor} size={tabbar.iconSize} />
            </Animated.View>
            <Animated.View style={[{ position: 'absolute' }, activeIconStyle]}>
              <TabIcon name={iconName} color={accent.color} size={tabbar.iconSize} />
            </Animated.View>
          </Animated.View>
        </View>
      </Pressable>
    </View>
  );
}

const noop = () => {};

export function TabBarPill({
  themeMode,
  pillWidth,
  tabs,
}: {
  themeMode: SurfaceMode;
  pillWidth: number;
  tabs: TabBarTab[];
}) {
  const palette = tabbarSurfaces[themeMode];
  const { slotStep, pillItemWidth, pillLeft, pillTop } = pillGeometry(pillWidth);

  // Reduce Motion gate for the active-icon grow, same rule as the tab 'shift'
  // transition: useReduceMotion() is null until its async read resolves, so
  // only a CONFIRMED RM-off (=== false) animates — null/unknown and RM-on both
  // hold a flat, motionless active state.
  const reduceMotion = useReduceMotion();
  const motionEnabled = reduceMotion === false;

  // Single source of truth for ALL active-state visuals. Initialised to the
  // focused slot so first paint is already at rest in the right place.
  const focusedIndex = Math.max(0, tabs.findIndex((t) => t.focused));
  const activeIndex = useSharedValue(focusedIndex);
  useEffect(() => {
    activeIndex.value = withSpring(focusedIndex, PILL_SPRING);
  }, [focusedIndex, activeIndex]);

  const movingPillStyle = useAnimatedStyle(() => {
    return { transform: [{ translateX: activeIndex.value * slotStep }] };
  }, [slotStep]);

  return (
    <View
      style={{
        width: pillWidth,
        alignSelf: 'center',
        height: tabbar.height,
        borderRadius: tabbar.radius,
        backgroundColor: palette.border,
        padding: TABBAR_BORDER_WIDTH,
        shadowColor: tabbar.shadowColor,
        shadowOpacity: tabbar.shadowOpacity,
        shadowRadius: tabbar.shadowRadius,
        shadowOffset: tabbar.shadowOffset,
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
        {/* The single sliding tint pill — first child, so it sits BEHIND the tab
            content (document-order draw, no elevation). */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: pillLeft,
              top: pillTop,
              width: pillItemWidth,
              height: tabbar.chipHeight,
              borderRadius: tabbar.chipRadius,
              backgroundColor: accent.tint,
            },
            movingPillStyle,
          ]}
        />
        {tabs.map((tab, index) => (
          <AnimatedTabItem
            key={tab.key}
            index={index}
            activeIndex={activeIndex}
            focused={tab.focused}
            label={tab.label}
            iconName={tab.iconName}
            inactiveColor={palette.inactiveColor}
            motionEnabled={motionEnabled}
            onPress={tab.onPress ?? noop}
          />
        ))}
      </View>
    </View>
  );
}

export default TabBarPill;
