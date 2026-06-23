import { Pressable, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

type PumpActionStackProps = {
  primaryLabel: string;
  accentColor: string;
  onPrimaryPress?: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  secondaryDisabled?: boolean;
  marginTop?: number;
};

function PumpPrimaryButton({
  label,
  accentColor,
  onPress,
  disabled = false,
}: {
  label: string;
  accentColor: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const inactive = disabled || !onPress;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => ({
        width: '100%',
        borderRadius: 20,
        opacity: inactive ? 0.58 : pressed ? 0.86 : 1,
      })}>
      <View
        style={{
          width: '100%',
          minHeight: 52,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 20,
          paddingVertical: 16,
          paddingHorizontal: 18,
          backgroundColor: accentColor,
          shadowColor: accentColor,
          shadowOpacity: 0.28,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
          elevation: 5,
        }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.86}
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 15.5,
            lineHeight: 20,
            color: colors.white,
            textAlign: 'center',
            includeFontPadding: false,
          }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function PumpSecondaryAction({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        alignSelf: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        opacity: disabled ? 0.45 : pressed ? 0.58 : 1,
      })}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.inkSoft }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function PumpActionStack({
  primaryLabel,
  accentColor,
  onPrimaryPress,
  primaryDisabled = false,
  secondaryLabel,
  onSecondaryPress,
  secondaryDisabled = false,
  marginTop = 20,
}: PumpActionStackProps) {
  return (
    <View style={{ width: '100%', alignSelf: 'stretch', marginTop }}>
      <PumpPrimaryButton
        label={primaryLabel}
        accentColor={accentColor}
        onPress={onPrimaryPress}
        disabled={primaryDisabled}
      />
      {secondaryLabel ? (
        <View style={{ marginTop: 10, alignItems: 'center' }}>
          <PumpSecondaryAction
            label={secondaryLabel}
            onPress={onSecondaryPress}
            disabled={secondaryDisabled}
          />
        </View>
      ) : null}
    </View>
  );
}

export default PumpActionStack;
