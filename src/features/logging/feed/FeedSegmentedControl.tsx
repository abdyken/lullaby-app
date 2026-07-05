/**
 * FeedSegmentedControl — the shared pill toggle used by every logging sheet:
 * Feed's Breast/Bottle and Left/Right, Bottle's milk type, and Pump's
 * Left/Right/Both. One component, so this animation propagates to all of them.
 *
 * The selection highlight is a SINGLE absolute pill that slides (translateX +
 * width) from the old segment to the new one on the UI thread (Reanimated), with
 * the label colours cross-fading in sync and a light selection haptic on change.
 * Segment geometry is measured via onLayout so the pill lands exactly on each
 * segment on both platforms and for any label width (2-up vs the 3-up Left/Right/
 * Both). First paint snaps to the already-selected segment (no travel); Reduce
 * Motion snaps every change. Selection VALUES are unchanged — `onChange` still
 * emits exactly `option.value`.
 */
import { useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { hapticSelection } from '@/lib/haptics';
import { colors, fonts } from '@/theme';

export type FeedSegmentedOption<T extends string> = {
  value: T;
  label: string;
  accessibilityLabel?: string;
};

type FeedSegmentedControlProps<T extends string> = {
  value: T | null;
  options: readonly FeedSegmentedOption<T>[];
  onChange: (value: T) => void;
};

type SlotLayout = { x: number; width: number };

/** Short ease-out slide — long enough to read as motion, short enough to feel instant. */
const SLIDE = { duration: 200, easing: Easing.out(Easing.cubic) } as const;
/** Parked far from every index so all labels read fully inactive when nothing is selected. */
const NO_SELECTION = -5;

function Segment<T extends string>({
  option,
  index,
  selected,
  progress,
  onLayout,
  onPress,
}: {
  option: FeedSegmentedOption<T>;
  index: number;
  selected: boolean;
  /** shared float index of the (animating) selection — the single source of truth */
  progress: SharedValue<number>;
  onLayout: (index: number, layout: SlotLayout) => void;
  onPress: () => void;
}) {
  const textStyle = useAnimatedStyle(() => {
    const p = 1 - Math.min(Math.abs(progress.value - index), 1);
    return { color: interpolateColor(p, [0, 1], [colors.inkSoft, colors.ink]) };
  }, [index]);

  return (
    <View
      style={styles.segmentSlot}
      onLayout={(e: LayoutChangeEvent) =>
        onLayout(index, { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width })
      }>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={option.accessibilityLabel ?? option.label}
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
        <View style={styles.optionSurface}>
          <Animated.Text numberOfLines={1} style={[styles.optionText, textStyle]}>
            {option.label}
          </Animated.Text>
        </View>
      </Pressable>
    </View>
  );
}

export function FeedSegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: FeedSegmentedControlProps<T>) {
  const reducedMotion = useReducedMotion();
  const selectedIndex = options.findIndex((option) => option.value === value);

  // Measured segment frames (relative to the padding-free row), so the pill lands
  // exactly on each segment regardless of label width / platform.
  const [layouts, setLayouts] = useState<(SlotLayout | null)[]>(() => options.map(() => null));
  const ready = layouts.length === options.length && layouts.every((l): l is SlotLayout => l !== null);

  // Shared values first, THEN the mutating effect, THEN the reading animated style
  // (React Compiler requires this order to allow the effect to write the value).
  const progress = useSharedValue(selectedIndex >= 0 ? selectedIndex : NO_SELECTION);
  const pillOpacity = useSharedValue(0);
  const positioned = useRef(false);

  const handleLayout = (index: number, layout: SlotLayout) => {
    setLayouts((prev) => {
      const current = prev[index];
      if (current && Math.abs(current.x - layout.x) < 0.5 && Math.abs(current.width - layout.width) < 0.5) {
        return prev; // unchanged — avoid a re-render loop
      }
      const next = prev.slice();
      next[index] = layout;
      return next;
    });
  };

  useEffect(() => {
    if (!ready) return;
    const target = selectedIndex >= 0 ? selectedIndex : NO_SELECTION;
    const show = selectedIndex >= 0 ? 1 : 0;
    // First positioning (or Reduce Motion) snaps; every later change slides.
    if (!positioned.current || reducedMotion) {
      progress.value = target;
      pillOpacity.value = show;
      positioned.current = true;
      return;
    }
    progress.value = withTiming(target, SLIDE);
    pillOpacity.value = withTiming(show, SLIDE);
  }, [ready, selectedIndex, reducedMotion, progress, pillOpacity]);

  const xs = ready ? layouts.map((l) => (l as SlotLayout).x) : options.map(() => 0);
  const widths = ready ? layouts.map((l) => (l as SlotLayout).width) : options.map(() => 0);
  const indexRange = options.map((_, i) => i);

  const pillStyle = useAnimatedStyle(() => {
    const clamped = Math.max(0, Math.min(progress.value, options.length - 1));
    return {
      opacity: pillOpacity.value,
      width: interpolate(clamped, indexRange, widths),
      transform: [{ translateX: interpolate(clamped, indexRange, xs) }],
    };
  }, [xs, widths]);

  const handlePress = (option: FeedSegmentedOption<T>) => {
    if (option.value !== value) hapticSelection();
    onChange(option.value);
  };

  return (
    <View style={styles.segmented}>
      <View style={styles.row}>
        <Animated.View pointerEvents="none" style={[styles.pill, pillStyle]} />
        {options.map((option, index) => (
          <Segment
            key={option.value}
            option={option}
            index={index}
            selected={option.value === value}
            progress={progress}
            onLayout={handleLayout}
            onPress={() => handlePress(option)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceSoft,
    borderRadius: 16,
    padding: 4,
  },
  // Padding-free row: segment onLayout.x and the pill's translateX share one origin.
  row: {
    width: '100%',
    alignSelf: 'stretch',
    flexDirection: 'row',
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 999,
    backgroundColor: colors.surface,
    shadowColor: 'rgb(60,40,30)',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 7 },
  },
  segmentSlot: {
    flex: 1,
    minWidth: 0,
  },
  pressable: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: 999,
  },
  optionSurface: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  optionText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    textAlign: 'center',
  },
});

export default FeedSegmentedControl;
