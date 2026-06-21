/**
 * Logging v2 — one diaper-kind action row (plan Phase 2 UI, Phase 10 a11y).
 *
 * Unlike the Feed flow's `ChoicePill` (a SELECTION pill you toggle, then Save),
 * a diaper button is an ACTION: a single tap saves immediately, so there is no
 * separate Save step (plan Phase 2 — "Each type button calls saveDiaper(kind)",
 * "Do not show a separate Save button"). That makes a wet diaper two taps:
 * Diaper → Wet.
 *
 * The visible surface lives on an inner `View`, not on the `Pressable`, because
 * on real Android (Expo Go) a `Pressable` with a function style does not reliably
 * paint its own background — the same inner-View idiom the quick-log tiles,
 * `ChoicePill`, and `PrimaryActionButton` already use. The accent shows as a
 * tinted leading glyph badge, never as the only signal: the bold text label
 * ("Wet" / "Dirty" / "Both" / "Dry") and the screen-reader label ("Wet diaper")
 * carry the meaning (plan Phase 10 — do not communicate type by colour only).
 */
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, fonts, radii } from '@/theme';

import type { DiaperKind } from '../domain/types';

type Props = {
  kind: DiaperKind;
  label: string;
  hint: string;
  accentColor: string;
  accentTint: string;
  onPress: () => void;
  disabled?: boolean;
};

/**
 * A small distinct glyph per kind, mirroring the reference's 💧 ● ◐ ○: a droplet
 * for wet, a filled disc for dirty, a half-filled disc for both, an open ring for
 * dry. Decorative only — the text label is the accessible source of truth.
 */
function KindGlyph({ kind, color }: { kind: DiaperKind; color: string }) {
  if (kind === 'wet') {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 3.5c3.3 4 5.5 6.8 5.5 9.6a5.5 5.5 0 0 1-11 0C6.5 10.3 8.7 7.5 12 3.5Z"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  if (kind === 'dirty') {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={6.5} fill={color} />
      </Svg>
    );
  }
  if (kind === 'both') {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={6.5} stroke={color} strokeWidth={2} />
        <Path d="M12 5.5a6.5 6.5 0 0 1 0 13Z" fill={color} />
      </Svg>
    );
  }
  // dry — an open ring
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={6.5} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

export function DiaperTypeButton({
  kind,
  label,
  hint,
  accentColor,
  accentTint,
  onPress,
  disabled = false,
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} diaper`}
      accessibilityHint="Saves immediately"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        opacity: disabled ? 0.45 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}>
      <View
        style={{
          minHeight: 60,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 16,
          borderRadius: radii.medium,
          backgroundColor: colors.surfaceSoft,
          borderWidth: 2,
          borderColor: 'transparent',
        }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accentTint,
          }}>
          <KindGlyph kind={kind} color={accentColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15.5, color: colors.ink }}>
            {label}
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: colors.inkFaint, marginTop: 1 }}>
            {hint}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default DiaperTypeButton;
