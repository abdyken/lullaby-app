/**
 * LullabyTabBar — the real, interactive floating tab bar (the navigator's
 * `tabBar`). It renders ONLY the base pill.
 *
 * Theme behaviour during a reveal:
 *  - This base pill is FROZEN to the theme the reveal started from
 *    (`reveal.fromMode`, the explicit committed mode captured at reveal start) —
 *    NOT the live committed `mode`, and NOT derived as `opposite(reveal.mode)`
 *    (which can read stale after commit). So it never repaints mid-transition or
 *    on commit. It returns to the live `mode` only when `reveal.active` flips
 *    false (the same frame the overlay is torn down), so there's no snap.
 *  - The incoming-theme pill is drawn by a SEPARATE full-window overlay
 *    (TabBarRevealOverlay, mounted in the tabs layout ABOVE the navigator) and
 *    revealed by the same global circular mask as the screen content. The reveal
 *    is NOT done here, because a mask local to this small navigator-owned
 *    container doesn't reliably draw over the real bar on Android.
 */
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { TabBarPill, TAB_BAR_DEBUG, useTabBarLayout, type TabBarTab } from '@/components/TabBarPill';
import type { TabName } from '@/components/TabIcon';
import { useTheme } from '@/state/ThemeProvider';
import { type SurfaceMode } from '@/theme';

type LullabyTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const LABELS: Record<string, string> = {
  index: 'Tonight',
  log: 'Log',
  reassure: 'Reassure',
};

const ICONS: Record<string, TabName> = {
  index: 'tonight',
  log: 'log',
  reassure: 'reassure',
};

export function LullabyTabBar({ state, navigation }: LullabyTabBarProps) {
  const { mode, reveal } = useTheme();

  // Frozen during a reveal: the base pill shows the explicit theme the reveal
  // started FROM (captured once at reveal start), never the live committed mode
  // and never `opposite(reveal.mode)` (so no mid-transition repaint, no commit
  // snap, no stale-target read). Returns to the live mode once the reveal ends.
  const baseTabTheme: SurfaceMode = reveal.active ? reveal.fromMode : mode;

  // Shared geometry — identical (and pixel-snapped) to the reveal overlay's pill.
  const { pillWidth, paddingBottom } = useTabBarLayout();

  const tabs: TabBarTab[] = state.routes.map((route, index) => ({
    key: route.key,
    label: LABELS[route.name] ?? route.name,
    iconName: ICONS[route.name] ?? 'tonight',
    focused: state.index === index,
    onPress: () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (state.index !== index && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    },
  }));

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        // float clear of the Android gesture bar / home indicator
        paddingBottom,
      }}>
      <TabBarPill
        themeMode={baseTabTheme}
        pillWidth={pillWidth}
        tabs={tabs}
        debugBorder={TAB_BAR_DEBUG ? 'red' : undefined}
      />
    </View>
  );
}

export default LullabyTabBar;
