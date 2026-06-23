/**
 * TabBarRevealOverlay — the incoming-theme tab bar, revealed by the circle.
 *
 * Mounted in the tabs layout ABOVE the navigator (not inside the navigator's
 * tab-bar slot), so it reliably draws over the real, visible tab bar on Android.
 * It uses the EXACT same mechanism as the screen-content reveal that already
 * works: a full-window absolute layer + the shared global circular mask in
 * WINDOW coordinates (no local container math, no measured origin, no nested
 * MaskedView inside a small navigator-owned view, no elevation).
 *
 * It renders the next-theme pill at the same screen position as the real tab bar
 * (bottom-anchored, same width/padding), clipped by the same circle. Outside the
 * circle the real (frozen) tab bar shows; inside, this next-theme copy shows.
 * `pointerEvents="none"` so it never intercepts touches.
 */
import { usePathname } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { TabName } from '@/components/TabIcon';
import { TabBarPill, useTabBarLayout, type TabBarTab } from '@/components/TabBarPill';
import { ThemeRevealMask } from '@/components/ThemeRevealOverlay';
import { useTheme } from '@/state/ThemeProvider';
import { surfaces, tabbar } from '@/theme';

// The tabs, in navigator order. Kept in sync with app/(tabs)/_layout.tsx.
const TAB_ROUTES: { name: string; label: string; iconName: TabName; isActive: (p: string) => boolean }[] = [
  { name: 'index', label: 'Tonight', iconName: 'tonight', isActive: (p) => p === '/' || p === '' },
  { name: 'insights', label: 'Insights', iconName: 'insights', isActive: (p) => p.startsWith('/insights') },
  { name: 'log', label: 'Log', iconName: 'log', isActive: (p) => p.startsWith('/log') },
  { name: 'reassure', label: 'Reassure', iconName: 'reassure', isActive: (p) => p.startsWith('/reassure') },
];

export function TabBarRevealOverlay() {
  const { width, height } = useWindowDimensions();
  const { reveal, revealProgress } = useTheme();
  const pathname = usePathname();
  // Same geometry source as the real bar — identical, pixel-snapped pill.
  const { pillWidth, paddingBottom } = useTabBarLayout();

  if (!reveal.active) return null;

  let focusedIndex = TAB_ROUTES.findIndex((r) => r.isActive(pathname));
  if (focusedIndex < 0) focusedIndex = 0;

  const tabs: TabBarTab[] = TAB_ROUTES.map((route, index) => ({
    key: route.name,
    label: route.label,
    iconName: route.iconName,
    focused: index === focusedIndex,
  }));

  return (
    // Full-window, above the navigator. Same coordinate space + circle as the
    // screen content reveal. zIndex only (no elevation). Non-interactive.
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]} pointerEvents="none">
      <ThemeRevealMask
        originX={reveal.origin.x}
        originY={reveal.origin.y}
        maxRadius={reveal.maxRadius}
        progress={revealProgress}
        width={width}
        height={height}>
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            paddingBottom,
          }}>
          {/* Pill-sized wrapper with an opaque incoming-theme backdrop behind the
              pill. The pill colours are now opaque (precomposed in tabbarSurfaces),
              so this no longer fixes bleed-through — it's a defensive opaque base
              (the frozen old pill can never show under the new one) and it makes
              the rounded corners blend into the just-revealed screen bg rather than
              the old pill. Backdrop colour = the incoming screen bg the pill floats
              on, identical to what surrounds it inside the circle. */}
          <View style={{ width: pillWidth, height: tabbar.height }}>
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: tabbar.radius,
                backgroundColor: surfaces[reveal.toMode].bg,
              }}
            />
            {/* Overlay pill is ALWAYS the incoming theme (`reveal.toMode`); the
                frozen base bar shows `reveal.fromMode`. No shadow inside the mask. */}
            <TabBarPill
              themeMode={reveal.toMode}
              pillWidth={pillWidth}
              tabs={tabs}
              withShadow={false}
            />
          </View>
        </View>
      </ThemeRevealMask>
    </View>
  );
}

export default TabBarRevealOverlay;
