import { requireOptionalNativeModule } from "expo-modules-core";

type CircularRevealModule = {
  triggerTransition(
    centerX: number,
    centerY: number,
    durationMs: number,
  ): Promise<string>;
  prepareCircularReveal(centerX: number, centerY: number): Promise<string>;
  startCircularReveal(durationMs: number): Promise<string>;
  cancelCircularReveal(): Promise<void>;
};

const NativeModule = requireOptionalNativeModule(
  "CircularReveal",
) as CircularRevealModule | null;

function getNativeModule(): CircularRevealModule {
  if (NativeModule) {
    return NativeModule;
  }

  throw new Error(
    "expo-circular-reveal native module is unavailable. Use a development build or standalone app that includes the module.",
  );
}

/**
 * Captures the full window, adds a native overlay, resolves when overlay
 * is visible (caller should swap theme), then animates a circular reveal.
 *
 * @param centerX - tap X in logical points
 * @param centerY - tap Y in logical points
 * @param durationMs - animation duration in milliseconds
 * @returns "ready" when overlay is visible and theme can be swapped
 */
export async function triggerTransition(
  centerX: number,
  centerY: number,
  durationMs: number,
): Promise<string> {
  return getNativeModule().triggerTransition(centerX, centerY, durationMs);
}

/**
 * Captures the current full window and installs an opaque screenshot overlay.
 * Resolve means the old-theme overlay is attached and JS can commit the new theme.
 */
export async function prepareCircularReveal(
  centerX: number,
  centerY: number,
): Promise<"ready"> {
  const result = await getNativeModule().prepareCircularReveal(centerX, centerY);
  if (result !== "ready") {
    throw new Error(`Unexpected prepareCircularReveal result: ${result}`);
  }
  return "ready";
}

/**
 * Starts the prepared circular reveal and removes the overlay after animation.
 */
export async function startCircularReveal(
  durationMs: number,
): Promise<"finished"> {
  const result = await getNativeModule().startCircularReveal(durationMs);
  if (result !== "finished") {
    throw new Error(`Unexpected startCircularReveal result: ${result}`);
  }
  return "finished";
}

/**
 * Removes any prepared or running reveal overlay.
 */
export async function cancelCircularReveal(): Promise<void> {
  await getNativeModule().cancelCircularReveal();
}
