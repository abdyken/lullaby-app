/**
 * Screen — cream background wrapper, safe-area aware (handles notch + home
 * indicator), and reserves room at the bottom so content never hides behind the
 * floating tab bar. The cream background is sacred (§6) — every screen uses it.
 */
import type { ReactNode } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { surfaces, tabbar, type SurfaceMode } from '@/theme';

type Props = {
  children: ReactNode;
  /** when true the content scrolls; otherwise it fills the screen */
  scroll?: boolean;
  /** surface palette — 'day' (cream, default) or 'night' (low-glare navy) */
  surfaceMode?: SurfaceMode;
  /** scroll position reporting — lets a theme-reveal overlay stay aligned */
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** freeze scrolling while a theme transition plays so layers stay in sync */
  scrollEnabled?: boolean;
  /** initial scroll offset — used by the reveal overlay to mirror the base screen */
  contentOffset?: { x: number; y: number };
};

export function Screen({
  children,
  scroll = true,
  surfaceMode = 'day',
  onScroll,
  scrollEnabled = true,
  contentOffset,
}: Props) {
  const insets = useSafeAreaInsets();
  const background = surfaces[surfaceMode].bg;
  // Reserve space for the floating tab bar. Mirror its real footprint exactly:
  // the bar floats at paddingBottom = max(insets.bottom + 8, marginBottom) and
  // is `height` tall (see LullabyTabBar). Add a comfortable clearance so the
  // last card (e.g. TimelineCard) is never tucked under the pill.
  const barFootprint = tabbar.height + Math.max(insets.bottom + 8, tabbar.marginBottom);
  const bottomGap = barFootprint + 24;

  const padding = {
    paddingTop: insets.top + 8,
    paddingHorizontal: 18,
    paddingBottom: bottomGap,
  };

  if (scroll) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: background }}
        contentContainerStyle={padding}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        scrollEnabled={scrollEnabled}
        contentOffset={contentOffset}>
        {children}
      </ScrollView>
    );
  }

  return <View style={[{ flex: 1, backgroundColor: background }, padding]}>{children}</View>;
}

export default Screen;
