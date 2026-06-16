import { Pressable, Text } from 'react-native';

import { colors, fonts, radii } from '@/theme';

type Props = {
  label: string;
  accentColor: string;
  onPress?: () => void;
};

export function PrimaryActionButton({ label, accentColor, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        backgroundColor: accentColor,
        borderRadius: radii.pill,
        paddingHorizontal: 28,
        paddingVertical: 13,
        shadowColor: accentColor,
        shadowOpacity: 0.34,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 10 },
        elevation: 5,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}>
      <Text
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: 14,
          color: colors.white,
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default PrimaryActionButton;
