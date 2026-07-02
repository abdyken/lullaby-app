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
 * ProProvider sits under AuthGate (so usePro/useAuth resolve), with a single
 * ProPaywallHost for the shared paywall. In local-only mode (no Supabase env)
 * onboarding runs once, then the seeded demo tabs render.
 */
import { Tabs } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';

import { AppToast } from '@/components/AppToast';
import { AuthGate } from '@/components/auth/AuthGate';
import { AuthTransition } from '@/components/auth/AuthTransition';
import { LullabyTabBar } from '@/components/LullabyTabBar';
import { ProPaywallHost } from '@/components/pro/ProPaywallHost';
import { LoggingProvider, useLogging } from '@/features/logging/state/LoggingProvider';
import { LoggingToast } from '@/features/logging/ui/LoggingToast';
import { logStartupStep } from '@/lib/startupDiagnostics';
import { useAuth } from '@/state/AuthProvider';
import { LocalEventProvider, useLocalEvents } from '@/state/LocalEventProvider';
import { ProProvider } from '@/state/ProProvider';
import { useTheme } from '@/state/ThemeProvider';
import { surfaces } from '@/theme';

function AppShellStartupGate({ children }: { children: ReactNode }) {
  const { status, baby } = useAuth();
  const { isHydrated: eventsHydrated, syncMode } = useLocalEvents();
  const { enabled, hydrated: loggingHydrated } = useLogging();
  const identityReady = status === 'local-only' || status === 'ready';
  const loggingReady = !enabled || loggingHydrated;
  const ready = identityReady && eventsHydrated && loggingReady;

  useEffect(() => {
    if (ready) {
      logStartupStep('app shell ready', {
        reason: 'startup-hydration-complete',
        authStatus: status,
        babyLoaded: baby != null,
        eventsHydrated,
        eventsMode: syncMode,
        canonicalLogging: enabled,
        loggingHydrated,
      });
    }
  }, [ready, status, baby, eventsHydrated, syncMode, enabled, loggingHydrated]);

  if (!ready) {
    return <AuthTransition />;
  }

  return <>{children}</>;
}

export default function TabsLayout() {
  // Background behind the navigator follows the committed theme so no stray light
  // strip can show behind the night surface / home indicator.
  const { mode } = useTheme();
  const background = surfaces[mode].bg;

  return (
    <AuthGate>
      {/* Pro entitlement seam — usePro defaults to free; no RevenueCat/purchases
          until configured. Mounted under AuthGate so it can read the signed-in
          caregiver / baby for baby-scoped entitlement. No layout of its own. */}
      <ProProvider>
        {/* Legacy/local event store stays mounted for compatibility reads. */}
        <LocalEventProvider>
          {/* Canonical logging API (Feed/Sleep/Diaper/Pump/Notes). */}
          <LoggingProvider>
            <AppShellStartupGate>
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
                {/* Canonical logging "saved · Undo" toast. Legacy AppToast remains
                    mounted for compatibility-only local events. */}
                <LoggingToast />
              </View>
            </AppShellStartupGate>
          </LoggingProvider>
        </LocalEventProvider>
        {/* Single shared paywall any Pro surface opens via usePro().openPaywall().
            A modal that renders nothing until requested; no layout of its own. */}
        <ProPaywallHost />
      </ProProvider>
    </AuthGate>
  );
}
