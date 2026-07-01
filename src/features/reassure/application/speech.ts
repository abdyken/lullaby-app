/**
 * speech.ts — the ONLY module that touches expo-speech-recognition.
 *
 * The native module requires a dev-client rebuild; on a client built before it
 * existed, importing the package throws at requireNativeModule(). This seam
 * lazy-requires inside try/catch so every failure mode collapses into
 * "voice unavailable" — the orb degrades to focus-the-text-input, never a
 * crash. Nothing under domain/ or content/ may import this (smoke-scanned).
 *
 * Transcription runs through the platform speech service (iOS Speech
 * framework / Android SpeechRecognizer), pinned to en-US to match the
 * English-only router vocabulary.
 */

type PermissionResponse = { granted: boolean };

type SpeechEventSubscription = { remove(): void };

type SpeechResultEvent = {
  isFinal?: boolean;
  results?: { transcript?: string }[];
};

type SpeechErrorEvent = { error?: string; message?: string };

type SpeechNativeModule = {
  start(options: {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
  }): void;
  stop(): void;
  abort(): void;
  requestPermissionsAsync(): Promise<PermissionResponse>;
  isRecognitionAvailable(): boolean;
  addListener(event: 'result', handler: (ev: SpeechResultEvent) => void): SpeechEventSubscription;
  addListener(event: 'end', handler: () => void): SpeechEventSubscription;
  addListener(event: 'error', handler: (ev: SpeechErrorEvent) => void): SpeechEventSubscription;
};

let cached: SpeechNativeModule | null | undefined;

/** Lazy, cached handle to the native module — null when absent/broken. */
export function getSpeechModule(): SpeechNativeModule | null {
  if (cached !== undefined) return cached;
  try {
    // Metro resolves the package at bundle time (it is a real dependency); the
    // runtime throw on a pre-rebuild dev client is what we're catching here.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-speech-recognition') as {
      ExpoSpeechRecognitionModule?: SpeechNativeModule;
    };
    cached = mod?.ExpoSpeechRecognitionModule ?? null;
  } catch {
    cached = null;
  }
  return cached;
}

/** True when the device has a usable speech service right now. */
export function isSpeechAvailable(): boolean {
  const mod = getSpeechModule();
  if (!mod) return false;
  try {
    return mod.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export async function requestSpeechPermission(): Promise<'granted' | 'denied'> {
  const mod = getSpeechModule();
  if (!mod) return 'denied';
  try {
    const response = await mod.requestPermissionsAsync();
    return response.granted ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export type SpeechSessionCallbacks = {
  onInterim: (transcript: string) => void;
  onFinal: (transcript: string) => void;
  onEnd: () => void;
  onError: (code: string) => void;
};

export type SpeechSession = { abort(): void; stop(): void };

/**
 * Start a single (non-continuous) en-US listen. Returns null when the module
 * is unavailable. The caller owns timeouts and state.
 */
export function startListening(callbacks: SpeechSessionCallbacks): SpeechSession | null {
  const mod = getSpeechModule();
  if (!mod) return null;

  let subscriptions: SpeechEventSubscription[] = [];
  const cleanup = () => {
    for (const sub of subscriptions) {
      try {
        sub.remove();
      } catch {
        // already removed
      }
    }
    subscriptions = [];
  };

  try {
    subscriptions.push(
      mod.addListener('result', (ev: SpeechResultEvent) => {
        const transcript = ev.results?.[0]?.transcript ?? '';
        if (transcript.length === 0) return;
        if (ev.isFinal) callbacks.onFinal(transcript);
        else callbacks.onInterim(transcript);
      }),
      mod.addListener('end', () => {
        cleanup();
        callbacks.onEnd();
      }),
      mod.addListener('error', (ev: SpeechErrorEvent) => {
        cleanup();
        callbacks.onError(ev.error ?? 'unknown');
      }),
    );
    mod.start({ lang: 'en-US', interimResults: true, continuous: false });
  } catch {
    cleanup();
    return null;
  }

  return {
    abort() {
      cleanup();
      try {
        mod.abort();
      } catch {
        // native side already stopped
      }
    },
    stop() {
      try {
        mod.stop();
      } catch {
        cleanup();
      }
    },
  };
}
