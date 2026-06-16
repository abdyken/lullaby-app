/**
 * The 3-tab shell: Tonight · Log · Reassure.
 *
 * Uses Expo Router's JS Tabs with a fully custom `tabBar` (LullabyTabBar) so we
 * get the floating, rounded, warm pill from the mockup instead of the stock OS
 * tab bar. Screens render their own content above it; the bar floats over the
 * cream background.
 */
import { Tabs } from 'expo-router';

import { LullabyTabBar } from '@/components/LullabyTabBar';
import { LocalEventProvider } from '@/state/LocalEventProvider';

export default function TabsLayout() {
  return (
    // One shared local event store for all tabs, so Tonight and Log see the
    // same events. Reassure simply ignores it.
    <LocalEventProvider>
      <Tabs
        tabBar={(props) => <LullabyTabBar {...props} />}
        screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" options={{ title: 'Tonight' }} />
        <Tabs.Screen name="log" options={{ title: 'Log' }} />
        <Tabs.Screen name="reassure" options={{ title: 'Reassure' }} />
      </Tabs>
    </LocalEventProvider>
  );
}
