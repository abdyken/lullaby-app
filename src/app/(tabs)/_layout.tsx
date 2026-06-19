/**
 * The 3-tab shell: Tonight · Log · Reassure.
 *
 * Uses Expo Router's JS Tabs with a fully custom `tabBar` (LullabyTabBar) so we
 * get the floating, rounded, warm pill from the mockup instead of the stock OS
 * tab bar. Screens render their own content above it; the bar floats over the
 * cream background.
 *
 * The bottom tab bar's theme transition is two explicit layers:
 *  - LullabyTabBar (the navigator's tabBar) renders the FROZEN current-theme pill.
 *  - TabBarRevealOverlay is mounted here, ABOVE the navigator, as a full-window
 *    layer that reveals the next-theme pill through the same global circular mask
 *    as the screen content (the only place a mask reliably draws over the real
 *    tab bar on Android).
 *
 * AuthProvider + AuthGate sit above the tab shell. In local-only mode (no
 * Supabase env) the gate is inert and renders the tabs exactly as before.
 */
import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { AppToast } from '@/components/AppToast';
import { AuthGate } from '@/components/auth/AuthGate';
import { LullabyTabBar } from '@/components/LullabyTabBar';
import { TAB_BAR_DEBUG } from '@/components/TabBarPill';
import { TabBarRevealOverlay } from '@/components/TabBarRevealOverlay';
import { AuthProvider } from '@/state/AuthProvider';
import { LocalEventProvider } from '@/state/LocalEventProvider';
import { useTheme } from '@/state/ThemeProvider';
import { surfaces } from '@/theme';

export default function TabsLayout() {
  // Background behind the navigator follows the committed theme (it stays the
  // old theme during a reveal and commits with everything else), so no stray
  // light strip can ever show behind the night surface / home indicator.
  const { mode } = useTheme();
  const background = surfaces[mode].bg;

  // PURPLE = the safe-area / root backdrop behind the navigator (debug only).
  const rootBackground = TAB_BAR_DEBUG ? 'purple' : background;
  // BLUE = the React Navigation tab-bar container (debug only). Normally fully
  // transparent + chrome-free so only the custom pill + reveal overlay are seen.
  const tabBarBackground = TAB_BAR_DEBUG ? 'blue' : 'transparent';

  return (
    <AuthProvider>
      <AuthGate>
        {/* One shared event store for all tabs, so Tonight and Log see the same
            events. Reassure simply ignores it. */}
        <LocalEventProvider>
          {/* flex:1 wrapper so AppToast + the tab-bar reveal overlay can float as
              app-level overlays above the floating tab bar. */}
          <View style={{ flex: 1, backgroundColor: rootBackground }}>
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
                sceneStyle: { backgroundColor: background },
                // Fully transparent + chrome-free: the visible bar is entirely the
                // custom pill (base) + the full-window reveal overlay. No RN
                // container background/border/shadow that could change separately.
                tabBarStyle: {
                  backgroundColor: tabBarBackground,
                  borderTopWidth: 0,
                  borderTopColor: 'transparent',
                  elevation: 0,
                  shadowOpacity: 0,
                },
              }}>
              <Tabs.Screen name="index" options={{ title: 'Tonight' }} />
              <Tabs.Screen name="log" options={{ title: 'Log' }} />
              <Tabs.Screen name="reassure" options={{ title: 'Reassure' }} />
            </Tabs>
            <AppToast />
            {/* Next-theme tab bar, revealed by the shared circle, above everything. */}
            <TabBarRevealOverlay />
          </View>
        </LocalEventProvider>
      </AuthGate>
    </AuthProvider>
  );
}
