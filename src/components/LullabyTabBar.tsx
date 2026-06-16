/**
 * LullabyTabBar — the floating, rounded, warm bottom tab bar.
 *
 * Translated from `.lb-tabbar` in the mockup: a pill container floating above
 * the cream background with a soft warm shadow and a subtle light border. The
 * active tab gets an accent-tinted chip + accent color; inactive tabs are muted
 * ink-faint. Deliberately NOT the stock React Native / OS tab bar.
 *
 * Accent follows the active state. For this foundation the accent is derived
 * from the focused tab (Tonight -> sleep). Once the Tonight screen drives live
 * state, the active accent can be lifted to follow the baby's real status.
 */
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabIcon, type TabName } from '@/components/TabIcon';
import { fonts, getAccentForState, tabbar } from '@/theme';

// Derive the tabBar render props straight from expo-router's Tabs so the type
// always matches what the navigator passes (the standalone @react-navigation
// type can drift from expo-router's vendored copy).
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

// The tab bar keeps a calm sleep accent for the shell. The Tonight screen owns
// real live state later; the bar can read from it then.
const accent = getAccentForState('sleep');

export function LullabyTabBar({ state, navigation }: LullabyTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Compact, clearly-floating pill: capped at 304 (320 read too wide on real
  // hardware), never below 268, with ~72px of side breathing room on small phones.
  const pillWidth = Math.max(
    tabbar.minWidth,
    Math.min(width - tabbar.sideAllowance, tabbar.maxWidth),
  );

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        // float clear of the Android gesture bar / home indicator, but stay put
        // (never flush, never too high) on devices without a bottom inset
        paddingBottom: Math.max(insets.bottom + 8, 18),
      }}>
      <View
        style={{
          width: pillWidth,
          alignSelf: 'center',
          height: tabbar.height,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: tabbar.surface,
          borderRadius: tabbar.radius,
          borderWidth: 1,
          borderColor: tabbar.border,
          paddingHorizontal: tabbar.paddingX,
          paddingVertical: tabbar.paddingY,
          gap: tabbar.gap,
          shadowColor: tabbar.shadowColor,
          shadowOpacity: tabbar.shadowOpacity,
          shadowRadius: tabbar.shadowRadius,
          shadowOffset: tabbar.shadowOffset,
          elevation: tabbar.elevation,
        }}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const label = LABELS[route.name] ?? route.name;
          const iconName = ICONS[route.name] ?? 'tonight';
          const tint = focused ? accent.color : tabbar.inactiveColor;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            // Equal wrapper → each tab owns exactly one third of the pill.
            <View key={route.key} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              {/* Pressable fills the third (full tap target), stays transparent. */}
              <Pressable
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={label}
                onPress={onPress}
                style={({ pressed }) => ({
                  width: '100%',
                  height: tabbar.tabHeight,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: tabbar.tabRadius,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}>
                {/* Small centered content group — THIS carries the active tint,
                    so the chip hugs the icon+label instead of filling the tab. */}
                <View
                  style={{
                    minWidth: tabbar.chipMinWidth,
                    height: tabbar.chipHeight,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: tabbar.chipGap,
                    borderRadius: tabbar.chipRadius,
                    backgroundColor: focused ? accent.tint : 'transparent',
                  }}>
                  <TabIcon name={iconName} color={tint} size={tabbar.iconSize} />
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: fonts.bodyBold,
                      fontSize: tabbar.labelSize,
                      letterSpacing: 0.1,
                      color: tint,
                    }}>
                    {label}
                  </Text>
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default LullabyTabBar;
