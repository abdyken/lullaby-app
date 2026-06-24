export async function prepareCircularReveal(
  _centerX: number,
  _centerY: number,
): Promise<'ready'> {
  throw new Error('Circular reveal is unavailable on web');
}

export async function startCircularReveal(_durationMs: number): Promise<'finished'> {
  return 'finished';
}

export async function cancelCircularReveal(): Promise<void> {
  /* no-op */
}

export async function triggerCircularRevealTransition(
  _centerX: number,
  _centerY: number,
  _durationMs: number,
): Promise<boolean> {
  return false;
}
