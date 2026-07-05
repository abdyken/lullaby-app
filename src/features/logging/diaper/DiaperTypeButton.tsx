/**
 * Logging v2 — one diaper-kind action card (plan Phase 2 UI, Phase 10 a11y).
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
import Svg, { Path } from 'react-native-svg';

import { colors, fonts } from '@/theme';

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
 * A distinct SVG glyph per kind, in the sheet's inline-svg house style (single
 * accent color, rounded forms — the same idiom as `MoonIcon` in `SleepIdle`).
 * Each glyph now conveys the state (droplet = wet, pile = dirty, both together,
 * check = dry) instead of an abstract shape. The bold text label and the
 * screen-reader label stay the accessible source of truth — the glyph never
 * carries meaning by shape or colour alone (plan Phase 10).
 */
function KindGlyph({ kind, color }: { kind: DiaperKind; color: string }) {
  if (kind === 'wet') {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path d="M12 3C12 3 5.5 10.8 5.5 15A6.5 6.5 0 1 0 18.5 15C18.5 10.8 12 3 12 3Z" fill={color} />
      </Svg>
    );
  }
  if (kind === 'dirty') {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path
          d="M4 17.5C3.6 14.6 6 12.8 7.8 13.2C8 10.6 11.4 10 12.8 12C15.2 11.1 18 12.9 17.4 15.1C19.2 15.4 19.3 17.5 17.6 17.5Z"
          fill={color}
        />
      </Svg>
    );
  }
  if (kind === 'both') {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path d="M8.5 3.5C8.5 3.5 4.8 7.8 4.8 10.2A3.7 3.7 0 1 0 12.2 10.2C12.2 7.8 8.5 3.5 8.5 3.5Z" fill={color} />
        <Path
          d="M11.8 19.5C11.5 17.2 13.4 15.9 14.7 16.2C14.9 14.2 17.5 13.8 18.1 15.5C19.6 15.7 19.7 19.5 18.1 19.5Z"
          fill={color}
        />
      </Svg>
    );
  }
  // dry — a clean check ("checked, nothing to change").
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5L10 17.5L19 6.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
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
        width: '100%',
        alignSelf: 'stretch',
        opacity: disabled ? 0.45 : pressed ? 0.86 : 1,
      })}>
      <View
        style={{
          width: '100%',
          minHeight: 104,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 16,
          paddingHorizontal: 12,
          borderRadius: 20,
          backgroundColor: colors.surfaceSoft,
        }}>
        <View
          style={{
            minWidth: 40,
            height: 40,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accentTint,
            marginBottom: 8,
          }}>
          <KindGlyph kind={kind} color={accentColor} />
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 16, color: colors.ink, textAlign: 'center' }}>
            {label}
          </Text>
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 11,
              lineHeight: 14,
              color: colors.inkSoft,
              marginTop: 3,
              textAlign: 'center',
            }}>
            {hint}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default DiaperTypeButton;
