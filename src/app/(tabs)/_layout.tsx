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
import { useReduceMotion } from '@/lib/useReduceMotion';
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

  // Reduce Motion gate for the page transition. useReduceMotion() is null until
  // its first async read resolves — treat null (unknown) as "no motion" so an
  // RM-ON user never catches a flash of the shift before the preference loads.
  // Only a CONFIRMED RM-off plays the calm built-in 'shift'.
  const reduceMotion = useReduceMotion();
  const tabAnimation = reduceMotion === false ? 'shift' : 'none';

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
                    // Keep every screen MOUNTED (lazy:false + detachInactiveScreens
                    // below) so switches never pay a re-mount, but SUSPEND the React
                    // rendering of whichever screens are blurred. Without this, a
                    // blurred screen keeps re-rendering in the background — most
                    // expensively Tonight, whose 1s session clock re-runs the full
                    // timeline recompute every second even while you're on another
                    // tab, stealing JS-thread frames and hitching the next switch.
                    // freezeOnBlur (react-native-screens freeze) defers that
                    // background render until the screen is refocused; it does NOT
                    // unmount, so the switch stays instant. Orthogonal to
                    // detachInactiveScreens (freeze = React render, detach = native
                    // view attach) — the two compose.
                    freezeOnBlur: true,
                    // Calm built-in page transition — the incoming screen slides in
                    // ('shift'), NOT 'fade'. A bottom-tabs fade renders the outgoing
                    // AND incoming screens at once with interpolated opacity, so
                    // full-bleed opaque screens alpha-blend into a muddy dark rectangle
                    // mid-switch (ghosting). A slide sidesteps that: opaque pages don't
                    // blend, they just translate. It stays cheap on top of the perf
                    // fixes (freezeOnBlur + deferToIdle) — screens are already mounted
                    // (lazy:false + detachInactiveScreens below), so 'shift' only
                    // animates position, never a re-mount. Reduce Motion gated
                    // (tabAnimation above): RM ON / not-yet-known → 'none' (instant, no
                    // motion); RM OFF → 'shift'. Calm/settled to match the night-app
                    // spirit — the tab-bar pill keeps its own (separate) Reanimated slide.
                    animation: tabAnimation,
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
