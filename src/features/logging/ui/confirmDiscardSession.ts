/**
 * Logging v2 — confirm a destructive session cancel (plan §10: "Use confirmation
 * for destructive cancel/delete when meaningful data loss is possible").
 *
 * Cancelling an in-progress Feed / Sleep / Pump session discards the elapsed time
 * and — unlike Finish — records NO Undo (cancel is a deliberate discard, never a
 * logged event), so an accidental tap is unrecoverable. This wraps the platform
 * `Alert` in one place so every session sheet confirms before discarding, with
 * consistent copy and a destructive-styled confirm button.
 *
 * RN-only (imports `Alert`), so it is NOT re-exported from the Node-safe barrel;
 * the sheets import it directly, like the other `ui/` pieces.
 */
import { Alert } from 'react-native';

/**
 * Ask the caregiver to confirm discarding an in-progress session, then run
 * `onDiscard` only if they confirm. `label` is the lowercase session noun used in
 * the prompt ("sleep", "feeding session", "pump session").
 */
export function confirmDiscardSession(label: string, onDiscard: () => void): void {
  Alert.alert(
    `Discard this ${label}?`,
    'This in-progress session will be discarded and won’t be saved.',
    [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onDiscard },
    ],
    { cancelable: true },
  );
}

export default confirmDiscardSession;
