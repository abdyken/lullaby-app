/**
 * usePediatricianPhone — React glue over the local pediatrician-number store.
 *
 * Loads the saved number on mount and exposes a `save` that normalizes + persists
 * and updates local state. `ready` distinguishes "still loading" from "loaded, no
 * number" so the triage card can avoid flashing the wrong action.
 *
 * setState only ever runs inside async callbacks here (never synchronously in an
 * effect body), which keeps it clear of the React-Compiler no-setState-in-effect
 * rule.
 */
import { useCallback, useEffect, useState } from 'react';

import { loadPediatricianPhone, savePediatricianPhone } from './pediatricianStore';

export type PediatricianPhone = {
  /** The dialable saved number, or null when none is stored. */
  phone: string | null;
  /** False until the initial async load resolves. */
  ready: boolean;
  /** Normalize + persist; resolves to the saved value (or null if not dialable). */
  save: (raw: string) => Promise<string | null>;
};

export function usePediatricianPhone(): PediatricianPhone {
  const [phone, setPhone] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadPediatricianPhone().then((value) => {
      if (cancelled) return;
      setPhone(value);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (raw: string) => {
    const saved = await savePediatricianPhone(raw);
    setPhone(saved);
    return saved;
  }, []);

  return { phone, ready, save };
}
