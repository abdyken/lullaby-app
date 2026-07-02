/**
 * useVoiceInput — the voice orb's state machine.
 *
 *   unavailable ──(module/service missing)── terminal for the session
 *   idle → tap → requesting → listening → (final|end|error) → idle
 *                    └─ denied (permission refused; tap now means "type instead")
 *
 * The final transcript flows to `onTranscript`, which the screen feeds into the
 * SAME route() every other input path uses — voice gets no special routing.
 * A hard 10s cap aborts a hung listen: a 2am parent never waits on a spinner.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  isSpeechAvailable,
  requestSpeechPermission,
  startListening,
  type SpeechSession,
} from '@/features/reassure/application/speech';
import type { VoiceOrbState } from '@/features/reassure/components/VoiceOrb';

const LISTEN_TIMEOUT_MS = 10_000;

type Options = {
  onTranscript: (text: string) => void;
  onListeningStart?: () => void;
  onDenied?: () => void;
};

export function useVoiceInput({ onTranscript, onListeningStart, onDenied }: Options): {
  state: VoiceOrbState;
  interim: string | null;
  tapOrb: () => void;
} {
  // Availability is latched once with a lazy initializer (React-Compiler-safe;
  // no setState-in-effect). A device doesn't gain a speech service mid-session.
  const [state, setState] = useState<VoiceOrbState>(() =>
    isSpeechAvailable() ? 'idle' : 'unavailable',
  );
  const [interim, setInterim] = useState<string | null>(null);

  const sessionRef = useRef<SpeechSession | null>(null);
  const finalRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearListenTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const settle = useCallback(
    (next: VoiceOrbState) => {
      clearListenTimeout();
      sessionRef.current = null;
      if (!mountedRef.current) return;
      setInterim(null);
      setState(next);
    },
    [clearListenTimeout],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearListenTimeout();
      sessionRef.current?.abort();
      sessionRef.current = null;
    };
  }, [clearListenTimeout]);

  const beginListening = useCallback(() => {
    finalRef.current = null;
    const session = startListening({
      onInterim: (transcript) => {
        if (mountedRef.current) setInterim(transcript);
      },
      onFinal: (transcript) => {
        finalRef.current = transcript;
        if (mountedRef.current) setInterim(transcript);
      },
      onEnd: () => {
        const finalTranscript = finalRef.current?.trim() ?? '';
        settle('idle');
        if (finalTranscript.length > 0) onTranscript(finalTranscript);
      },
      onError: () => {
        settle('idle');
      },
    });

    if (session === null) {
      settle('unavailable');
      return;
    }
    sessionRef.current = session;
    setState('listening');
    onListeningStart?.();
    timeoutRef.current = setTimeout(() => {
      sessionRef.current?.abort();
      settle('idle');
    }, LISTEN_TIMEOUT_MS);
  }, [onListeningStart, onTranscript, settle]);

  const tapOrb = useCallback(() => {
    if (state === 'listening') {
      // Tap while listening = "I'm done" — stop() lets the final result land.
      sessionRef.current?.stop();
      return;
    }
    if (state !== 'idle') return; // degraded states are handled by the owner

    setState('requesting');
    void requestSpeechPermission().then((permission) => {
      if (!mountedRef.current) return;
      if (permission === 'denied') {
        setState('denied');
        onDenied?.();
        return;
      }
      beginListening();
    });
  }, [beginListening, onDenied, state]);

  return { state, interim, tapOrb };
}
