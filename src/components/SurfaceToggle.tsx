/**
 * SurfaceToggle — a small, low-emphasis Auto / Night / Day segmented pill for
 * Tonight (P0.5). Lets a demo/QA force the night surface regardless of the
 * clock; default is Auto (resolves against local time). Local state only — no
 * persistence needed for the demo.
 *
 * Night-aware via `surfaceMode` so the control itself stays readable on the
 * low-glare night surface. Calm and quiet — it never competes with the orb.
 */
import { Pressable, Text, View } from 'react-native';

import { colors, fonts, radii, type SurfaceMode, type SurfacePreference } from '@/theme';

type Props = {
  value: SurfacePreference;
  onChange: (next: SurfacePreference) => void;
  /** the resolved surface, for styling the control to match its background */
  surfaceMode?: SurfaceMode;
};

const OPTIONS: { key: SurfacePreference; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'night', label: 'Night' },
  { key: 'day', label: 'Day' },
];

export function SurfaceToggle({ value, onChange, surfaceMode = 'day' }: Props) {
  const isNight = surfaceMode === 'night';
  const trackBg = isNight ? 'rgba(255,255,255,0.06)' : 'rgba(46,42,64,0.05)';
  const activeBg = isNight ? 'rgba(255,255,255,0.14)' : colors.surface;
  const activeText = isNight ? colors.white : colors.ink;
  const idleText = isNight ? 'rgba(240,236,251,0.6)' : colors.inkFaint;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        backgroundColor: trackBg,
        borderRadius: radii.pill,
        padding: 3,
        gap: 2,
      }}>
      {OPTIONS.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${option.label} appearance`}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => ({
              paddingVertical: 5,
              paddingHorizontal: 12,
              borderRadius: radii.pill,
              backgroundColor: active ? activeBg : 'transparent',
              opacity: pressed ? 0.7 : 1,
            })}>
            <Text
              style={{
                fontFamily: fonts.bodyBold,
                fontSize: 11,
                letterSpacing: 0.3,
                color: active ? activeText : idleText,
              }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default SurfaceToggle;
