/**
 * useAiSupportConsent — React glue over the local AI support-companion consent
 * store. Mirrors useAiNightReadConsent, but for the SEPARATE support decision
 * (the two paths send different data, so their consents must not be shared).
 *
 * Loads the saved decision on mount and exposes `grant` / `decline` that persist
 * and update local state. `ready` distinguishes "still loading" from "loaded, no
 * decision yet" so the consent card can avoid flashing before the stored choice
 * resolves.
 *
 * setState only ever runs inside async callbacks here (never synchronously in an
 * effect body), keeping it clear of the React-Compiler no-setState-in-effect rule.
 */
import { useCallback, useEffect, useState } from 'react';

import type { AiSupportConsent } from '@/features/reassure/domain/supportConsent';
import {
  loadSupportConsent,
  saveSupportConsent,
  subscribeSupportConsent,
} from './supportConsentStore';

export type AiSupportConsentState = {
  /** The decided state, or null when the parent has not yet been asked. */
  status: AiSupportConsent | null;
  /** False until the initial async load resolves. */
  ready: boolean;
  /** Persist a "granted" decision (allows the client to call the companion). */
  grant: () => void;
  /** Persist a "declined" decision (keeps the companion off; local line stays). */
  decline: () => void;
};

export function useAiSupportConsent(): AiSupportConsentState {
  const [status, setStatus] = useState<AiSupportConsent | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadSupportConsent().then((value) => {
      if (cancelled) return;
      setStatus(value);
      setReady(true);
    });
    // Converge on any write from another surface (e.g. the Settings revoke
    // toggle) so an already-mounted consumer never keeps a stale decision. The
    // callback runs on a store event, not synchronously in this effect body, so
    // it stays clear of the React-Compiler no-setState-in-effect rule.
    const unsubscribe = subscribeSupportConsent((value) => {
      if (!cancelled) setStatus(value);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const grant = useCallback(() => {
    setStatus('granted');
    void saveSupportConsent('granted');
  }, []);

  const decline = useCallback(() => {
    setStatus('declined');
    void saveSupportConsent('declined');
  }, []);

  return { status, ready, grant, decline };
}
