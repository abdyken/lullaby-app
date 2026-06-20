/**
 * Logging v2 — foreground reconcile trigger (plan §6 AppState behavior).
 *
 * A thin seam over React Native's `AppState`: it fires `onForeground` whenever
 * the app returns to the foreground, which the logging provider uses to re-read
 * active sessions and recompute durations from timestamps (the work itself lives
 * in `reconcileLoggingState`). Keeping the binding tiny and isolated lets the
 * pure reconcile logic stay unit-tested while the RN wiring is added once.
 *
 * RN-only — imports `react-native`, so it is NOT re-exported from the logging
 * barrel (which stays Node-runnable for the smoke test). Import it directly from
 * the provider, mirroring how `loggingStorage` (AsyncStorage) is consumed.
 */
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Subscribe to app foreground transitions. Calls `onForeground` each time the
 * app goes from background/inactive to `active`. Returns an unsubscribe.
 */
export function subscribeForeground(onForeground: () => void): () => void {
  let previous: AppStateStatus = AppState.currentState;
  const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
    const cameToForeground = previous !== 'active' && next === 'active';
    previous = next;
    if (cameToForeground) onForeground();
  });
  return () => subscription.remove();
}
