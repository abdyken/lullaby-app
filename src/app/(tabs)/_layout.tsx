/**
 * The 3-tab shell: Tonight · Log · Reassure.
 *
 * Uses Expo Router's JS Tabs with a fully custom `tabBar` (LullabyTabBar) so we
 * get the floating, rounded, warm pill from the mockup instead of the stock OS
 * tab bar. Screens render their own content above it; the bar floats over the
 * cream background.
 *
 * AuthProvider + AuthGate sit above the tab shell. In local-only mode (no
 * Supabase env) the gate is inert and renders the tabs exactly as before. In a
 * configured build it shows sign-in / baby setup until there's a real session +
 * linked baby — only then does LocalEventProvider mount and resolve Supabase.
 */
import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { AppToast } from '@/components/AppToast';
import { AuthGate } from '@/components/auth/AuthGate';
import { LullabyTabBar } from '@/components/LullabyTabBar';
import { AuthProvider } from '@/state/AuthProvider';
import { LocalEventProvider } from '@/state/LocalEventProvider';
import { colors } from '@/theme';

export default function TabsLayout() {
  return (
    <AuthProvider>
      <AuthGate>
        {/* One shared event store for all tabs, so Tonight and Log see the same
            events. Reassure simply ignores it. */}
        <LocalEventProvider>
          {/* flex:1 wrapper so AppToast can float as an app-level overlay above
              the floating tab bar, on whichever tab the save happened. */}
          <View style={{ flex: 1, backgroundColor: colors.cream }}>
            <Tabs
              tabBar={(props) => <LullabyTabBar {...props} />}
              detachInactiveScreens={false}
              screenOptions={{
                headerShown: false,
                lazy: false,
                animation: 'fade',
                transitionSpec: {
                  animation: 'timing',
                  config: { duration: 180 },
                },
                sceneStyle: { backgroundColor: colors.cream },
                tabBarStyle: { backgroundColor: colors.cream },
              }}>
              <Tabs.Screen name="index" options={{ title: 'Tonight' }} />
              <Tabs.Screen name="log" options={{ title: 'Log' }} />
              <Tabs.Screen name="reassure" options={{ title: 'Reassure' }} />
            </Tabs>
            <AppToast />
          </View>
        </LocalEventProvider>
      </AuthGate>
    </AuthProvider>
  );
}
