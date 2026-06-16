/**
 * Screen — cream background wrapper, safe-area aware (handles notch + home
 * indicator), and reserves room at the bottom so content never hides behind the
 * floating tab bar. The cream background is sacred (§6) — every screen uses it.
 */
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, tabbar } from '@/theme';

type Props = {
  children: ReactNode;
  /** when true the content scrolls; otherwise it fills the screen */
  scroll?: boolean;
};

export function Screen({ children, scroll = true }: Props) {
  const insets = useSafeAreaInsets();
  // clear the floating bar: its height + bottom margin + safe-area inset
  const bottomGap = tabbar.height + Math.max(insets.bottom, tabbar.marginBottom) + 16;

  const padding = {
    paddingTop: insets.top + 8,
    paddingHorizontal: 18,
    paddingBottom: bottomGap,
  };

  if (scroll) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.cream }}
        contentContainerStyle={padding}
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    );
  }

  return <View style={[{ flex: 1, backgroundColor: colors.cream }, padding]}>{children}</View>;
}

export default Screen;
