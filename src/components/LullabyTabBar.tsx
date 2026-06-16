/**
 * LullabyTabBar — the floating, rounded, warm bottom tab bar.
 *
 * Translated from `.lb-tabbar` in the mockup: a pill container floating above
 * the cream background with a soft warm shadow and a subtle light border. The
 * active tab gets an accent-tinted chip + accent color; inactive tabs are muted
 * ink-faint. Deliberately NOT the stock React Native / OS tab bar.
 *
 * Accent follows the active state. For this foundation the accent is derived
 * from the focused tab (Tonight → sleep). Once the Tonight screen drives live
 * state, the active accent can be lifted to follow the baby's real status.
 */
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
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

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        // center the pill horizontally and keep equal 16px side margins
        alignItems: 'center',
        paddingHorizontal: tabbar.marginX,
        // float clear of the home indicator / Android gesture bar, but never
        // flush against it and never too high on devices without an inset
        paddingBottom: Math.max(insets.bottom, tabbar.marginBottom),
      }}>
      <View
        style={{
          width: '100%',
          maxWidth: tabbar.maxWidth,
          alignSelf: 'center',
          height: tabbar.height,
          flexDirection: 'row',
          alignItems: 'stretch',
          backgroundColor: tabbar.surface,
          borderRadius: tabbar.radius,
          borderWidth: 1,
          borderColor: tabbar.border,
          padding: tabbar.padding,
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
            // Plain flex:1 wrapper guarantees each tab takes an equal third of
            // the pill — a row of flex:1 Views always distributes evenly, with
            // no dependency on the Pressable resolving its own flex. The chip +
            // press-scale live on the Pressable, which fills the wrapper, so the
            // active accent-tint pill stays inside the tab and never shifts layout.
            <View key={route.key} style={{ flex: 1 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={label}
                onPress={onPress}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  borderRadius: tabbar.itemRadius,
                  backgroundColor: focused ? accent.tint : 'transparent',
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}>
                <TabIcon name={iconName} color={tint} />
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: fonts.bodyBold,
                    fontSize: 10.5,
                    letterSpacing: 0.1,
                    color: tint,
                  }}>
                  {label}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default LullabyTabBar;
