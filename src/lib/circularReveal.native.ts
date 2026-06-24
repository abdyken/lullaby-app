type CircularRevealModule = {
  prepareCircularReveal?: (centerX: number, centerY: number) => Promise<string>;
  startCircularReveal?: (durationMs: number) => Promise<string>;
  cancelCircularReveal?: () => Promise<void>;
  triggerTransition?: (centerX: number, centerY: number, durationMs: number) => Promise<string>;
};

const DEFAULT_FALLBACK_REVEAL_DURATION_MS = 600;

let preparedImplementation: 'two-phase' | 'one-shot-fallback' | null = null;

function fallbackRevealDurationMs(): number {
  const raw = process.env.EXPO_PUBLIC_THEME_REVEAL_DURATION_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FALLBACK_REVEAL_DURATION_MS;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function devLog(message: string, details?: Record<string, unknown>): void {
  if (__DEV__) {
    if (details) {
      console.log(`[theme-reveal] ${message}`, details);
    } else {
      console.log(`[theme-reveal] ${message}`);
    }
  }
}

function devWarn(message: string, error?: unknown): void {
  if (__DEV__) {
    if (error) {
      console.warn(`[theme-reveal] ${message}`, error);
    } else {
      console.warn(`[theme-reveal] ${message}`);
    }
  }
}

async function loadCircularRevealModule(): Promise<CircularRevealModule> {
  return (await import('expo-circular-reveal')) as CircularRevealModule;
}

function assertResult<T extends string>(actual: string, expected: T, functionName: string): T {
  if (actual !== expected) {
    throw new Error(`${functionName} returned ${actual}`);
  }

  return expected;
}

export async function prepareCircularReveal(centerX: number, centerY: number): Promise<'ready'> {
  const circularReveal = await loadCircularRevealModule();

  if (typeof circularReveal.prepareCircularReveal === 'function') {
    const result = await circularReveal.prepareCircularReveal(centerX, centerY);
    preparedImplementation = 'two-phase';
    devLog('prepare ready', { implementation: preparedImplementation });
    return assertResult(result, 'ready', 'prepareCircularReveal');
  }

  if (typeof circularReveal.triggerTransition === 'function') {
    const result = await circularReveal.triggerTransition(centerX, centerY, fallbackRevealDurationMs());
    preparedImplementation = 'one-shot-fallback';
    devWarn('two-phase native API unavailable; using one-shot circular reveal fallback');
    devLog('prepare ready', { implementation: preparedImplementation });
    return assertResult(result, 'ready', 'triggerTransition');
  }

  throw new Error('expo-circular-reveal native module is unavailable');
}

export async function startCircularReveal(durationMs: number): Promise<'finished'> {
  const implementation = preparedImplementation;

  if (implementation === 'one-shot-fallback') {
    devLog('start called', { durationMs, implementation });
    await wait(durationMs);
    preparedImplementation = null;
    devLog('animation finished', { implementation });
    return 'finished';
  }

  const circularReveal = await loadCircularRevealModule();

  if (typeof circularReveal.startCircularReveal !== 'function') {
    throw new Error('expo-circular-reveal startCircularReveal native API is unavailable');
  }

  devLog('start called', { durationMs, implementation: implementation ?? 'two-phase' });
  const result = await circularReveal.startCircularReveal(durationMs);
  preparedImplementation = null;
  devLog('animation finished', { implementation: 'two-phase' });
  return assertResult(result, 'finished', 'startCircularReveal');
}

export async function cancelCircularReveal(): Promise<void> {
  const circularReveal = await loadCircularRevealModule();
  preparedImplementation = null;

  if (typeof circularReveal.cancelCircularReveal === 'function') {
    await circularReveal.cancelCircularReveal();
  }
}

export async function triggerCircularRevealTransition(
  centerX: number,
  centerY: number,
  durationMs: number,
): Promise<boolean> {
  try {
    const { triggerTransition } = await loadCircularRevealModule();
    if (typeof triggerTransition !== 'function') return false;

    const result = await triggerTransition(centerX, centerY, durationMs);
    return result === 'ready';
  } catch (error) {
    devWarn('one-shot circular reveal unavailable', error);
    return false;
  }
}
