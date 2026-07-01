/**
 * The 4-tab shell: Tonight · Insights · History · Reassure.
 *
 * Uses Expo Router's JS Tabs with a fully custom `tabBar` (LullabyTabBar) so we
 * get the floating, rounded, warm pill from the mockup instead of the stock OS
 * tab bar. Screens render their own content above it; the bar floats over the
 * cream background.
 *
 * AuthGate sits at the top of the tab shell and picks the surface by auth status;
 * AuthProvider itself is hoisted to the ROOT layout (src/app/_layout.tsx) so it is
 * shared with the auth-callback route and never remounts on the OAuth round-trip.
 * In local-only mode (no Supabase env) onboarding runs once, then the seeded demo
 * tabs render.
 */
import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { AppToast } from '@/components/AppToast';
import { AuthGate } from '@/components/auth/AuthGate';
import { LullabyTabBar } from '@/components/LullabyTabBar';
import { LoggingProvider } from '@/features/logging/state/LoggingProvider';
import { LoggingToast } from '@/features/logging/ui/LoggingToast';
import { LocalEventProvider } from '@/state/LocalEventProvider';
import { useTheme } from '@/state/ThemeProvider';
import { surfaces } from '@/theme';

export default function TabsLayout() {
  // Background behind the navigator follows the committed theme so no stray light
  // strip can show behind the night surface / home indicator.
  const { mode } = useTheme();
  const background = surfaces[mode].bg;

  return (
    <AuthGate>
      {/* One shared event store for all tabs, so Tonight and Log see the same
          events. Reassure simply ignores it. */}
      <LocalEventProvider>
        {/* Logging v2 feature API (Feed/Sleep/Diaper/Pump). Inert while the
            loggingV2 flag is off — no I/O, no behavior change to the MVP. */}
        <LoggingProvider>
          {/* flex:1 wrapper so app-level toasts can float above the floating tab bar. */}
          <View style={{ flex: 1, backgroundColor: background }}>
            <Tabs
              tabBar={(props) => <LullabyTabBar {...props} />}
              detachInactiveScreens={false}
              screenOptions={{
                headerShown: false,
                lazy: false,
                // Instant page switch — NO cross-fade. A bottom-tabs
                // `animation: 'fade'` renders the outgoing AND incoming screens at
                // the same time with interpolated opacity, so full-bleed screen
                // content visibly overlaps (ghosting) and the two semi-transparent
                // opaque screens composite into a muddy dark rectangle mid-switch.
                // 'none' (the navigator default) + `lazy: false` +
                // `detachInactiveScreens={false}` keeps all screens mounted
                // and just toggles which is visible, so pages switch cleanly with
                // no flash, ghosting, fallback frame, or first-open dependency.
                // The tab-bar pill keeps its own (separate) Reanimated slide.
                animation: 'none',
                sceneStyle: { backgroundColor: background },
                // Fully transparent + chrome-free ON PURPOSE: the visible bar is
                // entirely the custom pill.
                // Keep this transparent with no border/elevation/shadow so the RN
                // tab-bar container can never paint chrome that changes separately
                // from (or draws over) the custom pill.
                tabBarStyle: {
                  backgroundColor: 'transparent',
                  borderTopWidth: 0,
                  borderTopColor: 'transparent',
                  elevation: 0,
                  shadowOpacity: 0,
                },
              }}>
              <Tabs.Screen name="index" options={{ title: 'Tonight' }} />
              <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
              <Tabs.Screen name="log" options={{ title: 'History' }} />
              <Tabs.Screen name="reassure" options={{ title: 'Reassure' }} />
            </Tabs>
            <AppToast />
            {/* Logging v2 "saved · Undo" toast — inert unless the flag is on and a
                v2 mutation just landed; never collides with the legacy AppToast. */}
            <LoggingToast />
          </View>
        </LoggingProvider>
      </LocalEventProvider>
    </AuthGate>
  );
}
