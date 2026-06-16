/**
 * Root layout — loads fonts, sets up safe-area + status bar, and hosts the
 * navigation stack. Tailwind's global stylesheet is imported here so NativeWind
 * `className` utilities work everywhere.
 *
 * Fonts: Fredoka for display/headings, Nunito for body — loaded via expo-font
 * through the @expo-google-fonts packages. We hold the splash screen until they
 * resolve so text never flashes in a fallback face.
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

import { colors } from '@/theme';
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

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.cream },
        }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SafeAreaProvider>
  );
}
