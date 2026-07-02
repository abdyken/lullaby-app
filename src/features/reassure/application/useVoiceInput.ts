/**
 * useVoiceInput — the voice orb's state machine.
 *
 *   unavailable ──(module/service missing)── terminal for the session
 *   available_idle → tap → listening → final transcript → available_idle
 *                    ├─ no_match / error (retryable: tap or "Try again")
 *                    └─ permission_denied (settings / type instead)
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
  onNoMatch?: () => void;
  onError?: () => void;
};

export function resolveVoiceTranscript(
  finalTranscript: string | null | undefined,
  interimTranscript: string | null | undefined,
): string | null {
  const finalText = finalTranscript?.trim() ?? '';
  if (finalText.length > 0) return finalText;
  const interimText = interimTranscript?.trim() ?? '';
  return interimText.length > 0 ? interimText : null;
}

export function classifyVoiceRecognitionError(code: string): 'no_match' | 'error' {
  const normalized = code.toLowerCase().replace(/[\s-]+/g, '_');
  if (
    normalized.includes('no_speech') ||
    normalized.includes('no_match') ||
    normalized.includes('nomatch') ||
    normalized.includes('speech_timeout')
  ) {
    return 'no_match';
  }
  return 'error';
}

export function useVoiceInput({
  onTranscript,
  onListeningStart,
  onDenied,
  onUnavailable,
  onNoMatch,
  onError,
}: Options): {
  state: VoiceOrbState;
  interim: string | null;
  tapOrb: () => void;
  retry: () => void;
} {
  // Availability is latched once with a lazy initializer (React-Compiler-safe;
  // no setState-in-effect). A device doesn't gain a speech service mid-session.
  const [state, setState] = useState<VoiceOrbState>(() =>
    isSpeechAvailable() ? 'available_idle' : 'unavailable',
  );
  const [interim, setInterim] = useState<string | null>(null);

  const sessionRef = useRef<SpeechSession | null>(null);
  const finalRef = useRef<string | null>(null);
  const interimRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const requestingRef = useRef(false);

  const clearListenTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const cleanupActiveSession = useCallback(() => {
    clearListenTimeout();
    sessionRef.current?.abort();
    sessionRef.current = null;
  }, [clearListenTimeout]);

  const settle = useCallback(
    (next: VoiceOrbState) => {
      clearListenTimeout();
      sessionRef.current = null;
      requestingRef.current = false;
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
      cleanupActiveSession();
    };
  }, [cleanupActiveSession]);

  const beginListening = useCallback(() => {
    cleanupActiveSession();
    finalRef.current = null;
    interimRef.current = null;
    if (mountedRef.current) setInterim(null);
    const session = startListening({
      onInterim: (transcript) => {
        interimRef.current = transcript;
        if (mountedRef.current) setInterim(transcript);
      },
      onFinal: (transcript) => {
        finalRef.current = transcript;
        if (mountedRef.current) setInterim(transcript);
      },
      onEnd: () => {
        const transcript = resolveVoiceTranscript(finalRef.current, interimRef.current);
        if (transcript !== null) {
          settle('available_idle');
          onTranscript(transcript);
        } else {
          settle('no_match');
          onNoMatch?.();
        }
      },
      onError: (code) => {
        const next = classifyVoiceRecognitionError(code);
        settle(next);
        if (next === 'no_match') onNoMatch?.();
        else onError?.();
      },
    });

    if (session === null) {
      settle('unavailable');
      onUnavailable?.();
      return;
    }
    sessionRef.current = session;
    if (mountedRef.current) setInterim(null);
    setState('listening');
    onListeningStart?.();
    timeoutRef.current = setTimeout(() => {
      sessionRef.current?.abort();
      settle('no_match');
      onNoMatch?.();
    }, LISTEN_TIMEOUT_MS);
  }, [cleanupActiveSession, onError, onListeningStart, onNoMatch, onTranscript, onUnavailable, settle]);

  const startAttempt = useCallback(() => {
    if (requestingRef.current) return;
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
  }, [beginListening, onDenied, onUnavailable]);

  const tapOrb = useCallback(() => {
    if (state === 'listening') {
      // Tap while listening = "I'm done" — stop() lets the final result land.
      sessionRef.current?.stop();
      return;
    }
    if (state === 'unavailable' || state === 'permission_denied') return; // handled by the owner
    startAttempt();
  }, [startAttempt, state]);

  const retry = useCallback(() => {
    startAttempt();
  }, [startAttempt]);

  return { state, interim, tapOrb, retry };
}
