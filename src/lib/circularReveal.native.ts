export async function triggerCircularRevealTransition(
  centerX: number,
  centerY: number,
  durationMs: number,
): Promise<boolean> {
  try {
    const { triggerTransition } = await import('expo-circular-reveal');
    const result = await triggerTransition(centerX, centerY, durationMs);
    return result === 'ready';
  } catch {
    return false;
  }
}
