import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { colors, radii, shadows } from '@/theme';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, style }: Props) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radii.medium,
          padding: 16,
          ...shadows.card,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export default Card;
