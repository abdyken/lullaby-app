/**
 * useAiNightReadConsent — React glue over the local AI night-read consent store.
 *
 * Loads the saved decision on mount and exposes `grant` / `decline` that persist
 * and update local state. `ready` distinguishes "still loading" from "loaded, no
 * decision yet" so the consent card can avoid flashing before the stored choice
 * resolves.
 *
 * setState only ever runs inside async callbacks here (never synchronously in an
 * effect body), which keeps it clear of the React-Compiler no-setState-in-effect
 * rule — same pattern as usePediatricianPhone.
 */
import { useCallback, useEffect, useState } from 'react';

import type { AiNightReadConsent } from '@/features/reassure/domain/aiConsent';
import { loadAiNightReadConsent, saveAiNightReadConsent } from './aiConsentStore';

export type AiNightReadConsentState = {
  /** The decided state, or null when the parent has not yet been asked. */
  status: AiNightReadConsent | null;
  /** False until the initial async load resolves. */
  ready: boolean;
  /** Persist a "granted" decision (allows the client to attempt the AI read). */
  grant: () => void;
  /** Persist a "declined" decision (keeps AI off; local read stays visible). */
  decline: () => void;
};

export function useAiNightReadConsent(): AiNightReadConsentState {
  const [status, setStatus] = useState<AiNightReadConsent | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadAiNightReadConsent().then((value) => {
      if (cancelled) return;
      setStatus(value);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const grant = useCallback(() => {
    setStatus('granted');
    void saveAiNightReadConsent('granted');
  }, []);

  const decline = useCallback(() => {
    setStatus('declined');
    void saveAiNightReadConsent('declined');
  }, []);

  return { status, ready, grant, decline };
}
