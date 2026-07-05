/**
 * Haptics — calm, best-effort tactile confirmation for the core night actions.
 *
 * Lullaby is a 3am, one-handed, eyes-half-closed product: a soft tap on save is
 * a quiet "got it" the parent feels without looking at the screen. It is purely
 * additive — it must NEVER block a save, throw, or change any logic.
 *
 * Design:
 *  - Every call is fire-and-forget and wrapped so a rejected promise or a missing
 *    native module can never surface. The night loop works identically with the
 *    haptics motor unavailable (web, simulator, Low Power Mode, Reduce Motion).
 *  - Semantic helpers (not raw enums) keep call sites readable and the "feel"
 *    consistent: a light impact for routine saves, a success notification for the
 *    two affirming moments (mark caught up, invite created), a soft impact for
 *    Undo so it reads as a gentle "taken back".
 *  - expo-haptics already no-ops on web (Web Vibration API), but we still guard so
 *    a pure Node smoke test that never imports this file stays unaffected.
 */
import * as Haptics from 'expo-haptics';

/** Run a haptics promise as fire-and-forget; swallow every failure silently. */
function safe(run: () => Promise<unknown>): void {
  try {
    void run().catch(() => {});
  } catch {
    // native module unavailable / synchronous throw — never let it reach the UI
  }
}

/** Routine save confirmation: Feed / Diaper / Note / Start sleep / Wake baby. */
export function hapticSave(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Gentle "taken back" for Undo — softer than a save. */
export function hapticUndo(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
}

/** Affirming success: Mark caught up, Invite code created, Join baby success. */
export function hapticSuccess(): void {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Light tick when a segmented toggle's selection changes (Breast/Bottle, side). */
export function hapticSelection(): void {
  safe(() => Haptics.selectionAsync());
}
