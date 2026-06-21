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
 * A distinct decorative glyph per kind, mirroring the reference's instant cards.
 * The text label remains the accessible source of truth.
 */
function kindGlyph(kind: DiaperKind) {
  if (kind === 'wet') return '💧';
  if (kind === 'dirty') return '●';
  if (kind === 'both') return '◐';
  return '○';
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
        opacity: disabled ? 0.45 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
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
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: kind === 'wet' ? 29 : 28,
              lineHeight: 32,
              color: accentColor,
              textAlign: 'center',
            }}>
            {kindGlyph(kind)}
          </Text>
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
