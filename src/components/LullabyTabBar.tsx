/**
 * LullabyTabBar — the real, interactive floating tab bar (the navigator's
 * `tabBar`). It renders one stable pill from the committed theme.
 */
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { TabBarPill, useTabBarLayout, type TabBarTab } from '@/components/TabBarPill';
import type { TabName } from '@/components/TabIcon';
import { useTheme } from '@/state/ThemeProvider';

type LullabyTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const LABELS: Record<string, string> = {
  index: 'Tonight',
  insights: 'Insights',
  log: 'Log',
  reassure: 'Reassure',
};

const ICONS: Record<string, TabName> = {
  index: 'tonight',
  insights: 'insights',
  log: 'log',
  reassure: 'reassure',
};

export function LullabyTabBar({ state, navigation }: LullabyTabBarProps) {
  const { mode } = useTheme();

  // Shared, pixel-snapped geometry for the floating pill.
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
      <TabBarPill themeMode={mode} pillWidth={pillWidth} tabs={tabs} />
    </View>
  );
}

export default LullabyTabBar;
