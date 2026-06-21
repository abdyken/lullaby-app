/**
 * TabBarPill — the floating tab-bar pill, presentational and theme-explicit.
 *
 * Shared by BOTH the real (interactive) tab bar (LullabyTabBar) and the
 * full-window theme-reveal overlay (TabBarRevealOverlay) so the current-theme
 * and next-theme layers are pixel-identical in layout — only colours differ.
 *
 * ACTIVE-TAB MOTION (Reanimated, UI thread):
 *  - There is ONE moving tint pill (the lavender chip) that SLIDES between tab
 *    slots via translateX — never a per-tab background crossfade. A single shared
 *    value `activeIndex` (a float that springs between integer slot indices) is
 *    the SOLE source of truth: it drives the pill's translateX, and each tab's
 *    icon opacity, label colour, and content scale derive from how close it is.
 *    So the pill, icons, and labels all move as one continuous gesture instead of
 *    several independent JS-thread fades fighting the screen transition.
 *  - Slot geometry is computed DETERMINISTICALLY from `pillWidth` (equal flex
 *    slots, known padding/gap), not measured with onLayout. Both the base bar and
 *    the reveal-overlay copy mount independently mid-transition; deterministic
 *    geometry guarantees they land on identical pixels with no onLayout race, and
 *    the moving pill is correct on its very first frame.
 *  - `activeIndex` is INITIALISED to the focused slot (not 0), so the reveal
 *    overlay's fresh copy renders the pill already at rest in the right place and
 *    never animates-in mid-reveal. Only a real focus change springs it.
 *
 * ANDROID RULES (load-bearing — do not "simplify" away):
 *  - The fake border is a FILLED inset (outer view = border colour, inner view =
 *    surface), NEVER a native borderWidth/borderColor stroke. Fills clip to the
 *    circular reveal mask; native strokes don't, so a real border would not
 *    reveal with the rest of the pill.
 *  - NO `elevation` anywhere in this tree (incl. the animated pill). Android
 *    elevation breaks MaskedView compositing and competes with zIndex for draw
 *    order. Draw order is document-order only (the moving pill is the first child
 *    of the surface row, so it sits behind the icons/labels). Shadow (iOS only,
 *    theme-stable) lives on the base pill via `withShadow`; the masked overlay
 *    copy passes false and is shadowless.
 *  - We animate transform / opacity / colour only — never native
 *    borderWidth/borderColor, and never per-frame layout props (left/width/margin).
 *
 * EXTENDING THE BAR: every theme-dependent visual (badges, extra chips, icons,
 * labels, backgrounds, outlines) MUST live inside this component and take its
 * colour from `palette` — i.e. be driven by the `themeMode` prop. Anything
 * theme-coloured added outside here won't exist identically in both the base and
 * the reveal-overlay copies and will flicker or mismatch during the transition.
 * The moving pill's tint is the theme-INDEPENDENT shell accent on purpose, so it
 * paints identical pixels in both layers and stays static through the reveal.
 */
import { useEffect } from 'react';
import { PixelRatio, Pressable, useWindowDimensions, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabIcon, type TabName } from '@/components/TabIcon';
import { fonts, getAccentForState, tabbar, tabbarSurfaces, type SurfaceMode } from '@/theme';

const TABBAR_BORDER_WIDTH = 1;
/** Tabs in the navigator. Used for deterministic slot geometry. */
const TAB_COUNT = 3;
// The shell accent (sleep). Theme-independent, so it never changes with the reveal.
const accent = getAccentForState('sleep');

/**
 * Soft-but-responsive spring for the sliding pill / colour crossfade. Damping and
 * stiffness sit in the "premium, settles without overshoot wobble" band.
 */
const PILL_SPRING = { damping: 26, stiffness: 220, mass: 1 } as const;

/** Smallest content scale for an inactive tab (active = 1). */
const INACTIVE_SCALE = 0.94;

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

/**
 * Deterministic geometry for the sliding tint pill, derived purely from
 * `pillWidth`. The inner surface row is `pillWidth - 2*border` wide with equal
 * `paddingX`/`gap`, so the three tab slots are evenly spaced and the pill only
 * ever needs a linear translateX — no width animation, no measuring. Identical
 * inputs in both copies → identical pixels.
 */
function pillGeometry(pillWidth: number) {
  const innerRowWidth = pillWidth - 2 * TABBAR_BORDER_WIDTH;
  const contentWidth = innerRowWidth - 2 * tabbar.paddingX;
  const slotWidth = (contentWidth - (TAB_COUNT - 1) * tabbar.gap) / TAB_COUNT;
  // distance between adjacent slot centres == distance between slot left edges
  const slotStep = slotWidth + tabbar.gap;
  // fixed-width pill, centred in a slot (chipMinWidth always fits — slots are wider)
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
  /** omitted for the non-interactive reveal overlay copy */
  onPress?: () => void;
};

function AnimatedTabItem({
  index,
  activeIndex,
  focused,
  label,
  iconName,
  inactiveColor,
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
  onPress: () => void;
}) {
  // Content (icon + label group) scales up subtly as the tab becomes active.
  const chipStyle = useAnimatedStyle(() => {
    const p = tabProgress(activeIndex.value, index);
    return { transform: [{ scale: INACTIVE_SCALE + (1 - INACTIVE_SCALE) * p }] };
  }, [index]);

  // Cross-fade two stacked icons (muted ↔ accent) — SVG stroke colour can't be
  // animated directly, so opacity is the UI-thread-friendly way to retint.
  const inactiveIconStyle = useAnimatedStyle(() => {
    return { opacity: 1 - tabProgress(activeIndex.value, index) };
  }, [index]);
  const activeIconStyle = useAnimatedStyle(() => {
    return { opacity: tabProgress(activeIndex.value, index) };
  }, [index]);

  const labelStyle = useAnimatedStyle(() => {
    const p = tabProgress(activeIndex.value, index);
    return { color: interpolateColor(p, [0, 1], [inactiveColor, accent.color]) };
  }, [index, inactiveColor]);

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
        <Animated.View
          style={[
            {
              minWidth: tabbar.chipMinWidth,
              height: tabbar.chipHeight,
              alignItems: 'center',
              justifyContent: 'center',
              gap: tabbar.chipGap,
            },
            chipStyle,
          ]}>
          <View
            style={{
              width: tabbar.iconSize,
              height: tabbar.iconSize,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Animated.View style={inactiveIconStyle}>
              <TabIcon name={iconName} color={inactiveColor} size={tabbar.iconSize} />
            </Animated.View>
            <Animated.View style={[{ position: 'absolute' }, activeIconStyle]}>
              <TabIcon name={iconName} color={accent.color} size={tabbar.iconSize} />
            </Animated.View>
          </View>
          <Animated.Text
            numberOfLines={1}
            style={[
              {
                fontFamily: fonts.bodyBold,
                fontSize: tabbar.labelSize,
                letterSpacing: 0.1,
              },
              labelStyle,
            ]}>
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
}: {
  themeMode: SurfaceMode;
  pillWidth: number;
  tabs: TabBarTab[];
  /** iOS soft shadow on the base pill only; the masked overlay copy passes false */
  withShadow?: boolean;
}) {
  const palette = tabbarSurfaces[themeMode];
  const { slotStep, pillItemWidth, pillLeft, pillTop } = pillGeometry(pillWidth);

  // Single source of truth for ALL active-state visuals. Initialised to the
  // focused slot so a freshly-mounted copy (the reveal overlay) is already at
  // rest in the right place — only a genuine focus change springs it.
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
        // "border" as a fill so the circular mask reveals it like normal content
        backgroundColor: palette.border,
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
        {/* The single sliding tint pill — first child, so it sits BEHIND the tab
            content (document-order draw, no elevation). Theme-independent accent
            tint so both reveal layers paint it identically and it never shifts as
            the circle passes. */}
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
            onPress={tab.onPress ?? noop}
          />
        ))}
      </View>
    </View>
  );
}

export default TabBarPill;
