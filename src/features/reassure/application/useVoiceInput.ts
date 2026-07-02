/**
 * useVoiceInput — the voice orb's state machine.
 *
 *   unavailable ──(module/service missing)── terminal for the session
 *   available_idle → tap → listening → final transcript → available_idle
 *                    ├─ permission_denied (tap now means "type instead")
 *                    └─ error (tap now means "type instead")
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
  onUnavailable?: () => void;
  onError?: () => void;
};

export function useVoiceInput({
  onTranscript,
  onListeningStart,
  onDenied,
  onUnavailable,
  onError,
}: Options): {
  state: VoiceOrbState;
  interim: string | null;
  tapOrb: () => void;
} {
  // Availability is latched once with a lazy initializer (React-Compiler-safe;
  // no setState-in-effect). A device doesn't gain a speech service mid-session.
  const [state, setState] = useState<VoiceOrbState>(() =>
    isSpeechAvailable() ? 'available_idle' : 'unavailable',
  );
  const [interim, setInterim] = useState<string | null>(null);

  const sessionRef = useRef<SpeechSession | null>(null);
  const finalRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const requestingRef = useRef(false);

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
        if (finalTranscript.length > 0) {
          settle('available_idle');
          onTranscript(finalTranscript);
        } else {
          settle('error');
          onError?.();
        }
      },
      onError: () => {
        settle('error');
        onError?.();
      },
    });

    if (session === null) {
      settle('unavailable');
      onUnavailable?.();
      return;
    }
    sessionRef.current = session;
    setState('listening');
    onListeningStart?.();
    timeoutRef.current = setTimeout(() => {
      sessionRef.current?.abort();
      settle('error');
      onError?.();
    }, LISTEN_TIMEOUT_MS);
  }, [onError, onListeningStart, onTranscript, onUnavailable, settle]);

  const tapOrb = useCallback(() => {
    if (state === 'listening') {
      // Tap while listening = "I'm done" — stop() lets the final result land.
      sessionRef.current?.stop();
      return;
    }
    if (state !== 'available_idle' || requestingRef.current) return; // degraded states are handled by the owner

    if (!isSpeechAvailable()) {
      setState('unavailable');
      onUnavailable?.();
      return;
    }

    requestingRef.current = true;
    void requestSpeechPermission().then((permission) => {
      requestingRef.current = false;
      if (!mountedRef.current) return;
      if (permission === 'denied') {
        setState('permission_denied');
        onDenied?.();
        return;
      }
      beginListening();
    });
  }, [beginListening, onDenied, onUnavailable, state]);

  return { state, interim, tapOrb };
}
