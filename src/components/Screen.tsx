/**
 * Screen — cream background wrapper, safe-area aware (handles notch + home
 * indicator), and reserves room at the bottom so content never hides behind the
 * floating tab bar. The cream background is sacred (§6) — every screen uses it.
 */
import type { ReactNode, RefObject } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  type ScrollViewProps,
  StatusBar,
  View,
} from 'react-native';
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
  /** optional handle to the inner ScrollView (e.g. Reassure scrolls its answer into view) */
  scrollRef?: RefObject<ScrollView | null>;
  /** extra clearance for keyboard-heavy screens; most tabs use the default tabbar gap */
  bottomGapExtra?: number;
  /** opt-in keyboard behavior for screens with inline text inputs */
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  keyboardDismissMode?: ScrollViewProps['keyboardDismissMode'];
};

export function Screen({
  children,
  scroll = true,
  surfaceMode = 'day',
  onScroll,
  scrollEnabled = true,
  contentOffset,
  scrollRef,
  bottomGapExtra = 0,
  keyboardShouldPersistTaps,
  keyboardDismissMode,
}: Props) {
  const insets = useSafeAreaInsets();
  const background = surfaces[surfaceMode].bg;
  const statusBarInset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const topInset = Math.max(insets.top, statusBarInset);
  // Reserve space for the floating tab bar. Mirror its real footprint exactly:
  // the bar floats at paddingBottom = max(insets.bottom + 8, marginBottom) and
  // is `height` tall (see LullabyTabBar). Add a comfortable clearance so the
  // last card (e.g. TimelineCard) is never tucked under the pill.
  const barFootprint = tabbar.height + Math.max(insets.bottom + 8, tabbar.marginBottom);
  const bottomGap = barFootprint + 24 + bottomGapExtra;

  const padding = {
    paddingTop: topInset + 10,
    paddingHorizontal: 18,
    paddingBottom: bottomGap,
  };

  if (scroll) {
    return (
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: background }}
        contentContainerStyle={padding}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        scrollEnabled={scrollEnabled}
        contentOffset={contentOffset}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}>
        {children}
      </ScrollView>
    );
  }

  return <View style={[{ flex: 1, backgroundColor: background }, padding]}>{children}</View>;
}

export default Screen;
