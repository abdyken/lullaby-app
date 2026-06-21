import { Pressable, StyleSheet, Text, View } from 'react-native';

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

export function FeedSegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: FeedSegmentedControlProps<T>) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <View key={option.value} style={styles.segmentSlot}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option.accessibilityLabel ?? option.label}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.pressable,
                {
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}>
              <View style={[styles.optionShadow, selected && styles.optionShadowSelected]}>
                <View style={[styles.optionSurface, selected && styles.optionSurfaceSelected]}>
                  <Text
                    numberOfLines={1}
                    style={[styles.optionText, selected ? styles.optionTextSelected : styles.optionTextInactive]}>
                    {option.label}
                  </Text>
                </View>
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: {
    width: '100%',
    alignSelf: 'stretch',
    flexDirection: 'row',
    backgroundColor: colors.surfaceSoft,
    borderRadius: 16,
    padding: 4,
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
  optionShadow: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: 999,
    overflow: 'visible',
  },
  optionShadowSelected: {
    shadowColor: 'rgb(60,40,30)',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 7 },
    elevation: 0,
  },
  optionSurface: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  optionSurfaceSelected: {
    backgroundColor: colors.surface,
  },
  optionText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    textAlign: 'center',
  },
  optionTextSelected: {
    color: colors.ink,
  },
  optionTextInactive: {
    color: colors.inkSoft,
  },
});

export default FeedSegmentedControl;
