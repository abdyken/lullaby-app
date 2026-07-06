/**
 * deferToIdle — run non-urgent focus-time work (analytics + storage reads) a
 * beat AFTER the current frame, so a tab switch can commit/paint first and the
 * work never lands in the transition frames.
 *
 * This is the non-deprecated replacement for
 * `InteractionManager.runAfterInteractions` (RN 0.85 deprecates
 * InteractionManager and points to requestIdleCallback). We prefer
 * `requestIdleCallback` (present on the RN Hermes runtime), and fall back to
 * `requestAnimationFrame`, then a 0 ms `setTimeout`, on any runtime where idle
 * callbacks aren't available (web / test / older engines).
 *
 * Returns a `cancel` function for the caller's cleanup (e.g. a useFocusEffect
 * return): calling it before the deferred work runs guarantees the work is
 * dropped, so there's no setState-after-blur. Callers should still keep their
 * own `cancelled`/request-token guard for the async tail that resolves later.
 */
type Cancel = () => void;

type IdleGlobals = {
  requestIdleCallback?: (cb: () => void) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function deferToIdle(run: () => void): Cancel {
  const g = globalThis as IdleGlobals;

  if (typeof g.requestIdleCallback === 'function') {
    const handle = g.requestIdleCallback(run);
    return () => g.cancelIdleCallback?.(handle);
  }

  if (typeof requestAnimationFrame === 'function') {
    const handle = requestAnimationFrame(() => run());
    return () => cancelAnimationFrame(handle);
  }

  const handle = setTimeout(run, 0);
  return () => clearTimeout(handle);
}
