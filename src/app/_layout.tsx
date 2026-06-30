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
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BrandSplashGate } from '@/components/boot/BrandSplashGate';
import { ThemeProvider, useTheme } from '@/state/ThemeProvider';
import { surfaces } from '@/theme';
import '../global.css';

SplashScreen.preventAutoHideAsync().catch(() => {
  /* no-op: safe if the splash is already hidden */
});

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
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  const isNight = mode === 'night';

  return (
    <>
      <StatusBar style={isNight ? 'light' : 'dark'} />
      <BrandSplashGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: surfaces[mode].bg },
          }}>
          <Stack.Screen name="(tabs)" />
          {/* OAuth / email auth deep-link landing (lullaby://auth-callback). A
              real route here is what stops Expo Router rendering "Unmatched
              Route" for the Supabase redirect; it fades in as a calm interstitial
              while the session exchange completes. */}
          <Stack.Screen name="auth-callback" options={{ animation: 'fade' }} />
        </Stack>
      </BrandSplashGate>
    </>
  );
}
