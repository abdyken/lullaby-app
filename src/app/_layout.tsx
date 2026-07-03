/**
 * Root layout — loads fonts, sets up safe-area + status bar, and hosts the
 * navigation stack. Tailwind's global stylesheet is imported here so NativeWind
 * `className` utilities work everywhere.
 *
 * Fonts: Fredoka for display/headings, Nunito for body — loaded via expo-font
 * through the @expo-google-fonts packages. We hold the splash screen until they
 * resolve so text never flashes in a fallback face.
 *
 * Theme: ThemeProvider owns the global, persisted surface mode. The splash also
 * waits on it (`hydrated`) so a saved night theme never flashes a day frame on
 * a cold start. The status bar + stack background follow the committed mode.
 */
import {
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  useFonts as useFredoka,
} from '@expo-google-fonts/fredoka';
import { Nunito_600SemiBold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BrandSplashGate } from '@/components/boot/BrandSplashGate';
import { logStartupStep } from '@/lib/startupDiagnostics';
import { AuthProvider } from '@/state/AuthProvider';
import { ThemeProvider, useTheme } from '@/state/ThemeProvider';
import { surfaces } from '@/theme';
import '../global.css';

SplashScreen.preventAutoHideAsync().catch(() => {
  /* no-op: safe if the splash is already hidden */
});

// Let Expo WebBrowser finalize any auth session the OS may deliver back to the JS
// runtime (the documented top-level companion to openAuthSessionAsync). Native
// deep-link delivery to /auth-callback is unaffected; this only ensures a returning
// browser tab is dismissed cleanly instead of lingering as a blank page.
WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  const [loaded, error] = useFredoka({
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Nunito_600SemiBold,
    Nunito_800ExtraBold,
  });

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootShell fontsReady={loaded || !!error} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootShell({ fontsReady }: { fontsReady: boolean }) {
  const { mode, hydrated } = useTheme();
  const ready = fontsReady && hydrated;

  useEffect(() => {
    if (fontsReady) logStartupStep('fonts ready');
  }, [fontsReady]);

  useEffect(() => {
    if (hydrated) logStartupStep('theme ready', { mode });
  }, [hydrated, mode]);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync()
        .then(() => logStartupStep('native splash hidden'))
        .catch(() => {});
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  const isNight = mode === 'night';

  return (
    <>
      <StatusBar style={isNight ? 'light' : 'dark'} />
      {/* AuthProvider sits ABOVE the navigator so both (tabs) and the auth-callback
          route share ONE provider instance. Previously it lived inside (tabs), so a
          deep-link into auth-callback + the router.replace('/') back caused (tabs)
          — and the whole auth state machine — to remount, flashing a second loading
          screen. Hoisting it keeps the session/status stable across that hop. */}
      <AuthProvider>
        <BrandSplashGate>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: surfaces[mode].bg },
            }}>
            <Stack.Screen name="(tabs)" />
            {/* Dedicated account/settings screen, pushed over the tab shell from
                the Tonight header's account button (no fifth tab). */}
            <Stack.Screen name="settings" />
            {/* OAuth / email auth deep-link landing (lullaby://auth-callback). A
                real route here is what stops Expo Router rendering "Unmatched
                Route" for the Supabase redirect; it fades in as a calm interstitial
                while the session exchange completes. */}
            <Stack.Screen name="auth-callback" options={{ animation: 'fade' }} />
          </Stack>
        </BrandSplashGate>
      </AuthProvider>
    </>
  );
}
