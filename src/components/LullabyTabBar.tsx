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
import { Animated, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';

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

function AnimatedTabItem({
  focused,
  label,
  iconName,
  onPress,
}: {
  focused: boolean;
  label: string;
  iconName: TabName;
  onPress: () => void;
}) {
  const [progress] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: focused ? 1 : 0,
      duration: 190,
      useNativeDriver: false,
    }).start();
  }, [focused, progress]);

  const tint = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [tabbar.inactiveColor, accent.color],
  });
  const chipBackground = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(233,235,251,0)', accent.tint],
  });
  const chipScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });
  const inactiveIconOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const activeIconOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
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
        <Animated.View
          style={{
            minWidth: tabbar.chipMinWidth,
            height: tabbar.chipHeight,
            alignItems: 'center',
            justifyContent: 'center',
            gap: tabbar.chipGap,
            borderRadius: tabbar.chipRadius,
            backgroundColor: chipBackground,
            transform: [{ scale: chipScale }],
          }}>
          <Animated.View
            style={{
              width: tabbar.iconSize,
              height: tabbar.iconSize,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Animated.View style={{ opacity: inactiveIconOpacity }}>
              <TabIcon name={iconName} color={tabbar.inactiveColor} size={tabbar.iconSize} />
            </Animated.View>
            <Animated.View style={{ position: 'absolute', opacity: activeIconOpacity }}>
              <TabIcon name={iconName} color={accent.color} size={tabbar.iconSize} />
            </Animated.View>
          </Animated.View>
          <Animated.Text
            numberOfLines={1}
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: tabbar.labelSize,
              letterSpacing: 0.1,
              color: tint,
            }}>
            {label}
          </Animated.Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

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
            <AnimatedTabItem
              key={route.key}
              focused={focused}
              label={label}
              iconName={iconName}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

export default LullabyTabBar;
