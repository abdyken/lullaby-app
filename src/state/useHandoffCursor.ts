/**
 * useHandoffCursor — React seam over the device-local handoff cursor.
 *
 * Loads the "last caught up" timestamp for a context (reloading if the context
 * changes, e.g. a different caregiver/baby), and exposes `markCaughtUp()` which
 * stamps now + persists. `ready` lets the UI avoid a flash of stale summary
 * before the stored cursor has loaded.
 */
import { useCallback, useEffect, useState } from 'react';

import { loadHandoffCursor, saveHandoffCursor } from '@/data/handoffCursor';

export type HandoffCursor = {
  /** epoch ms of the last "caught up", or null if never */
  cursor: number | null;
  /** true once the stored cursor has loaded for the current context */
  ready: boolean;
  /** mark everything up to now as seen */
  markCaughtUp: () => void;
};

export function useHandoffCursor(context: string): HandoffCursor {
  // Track which context the loaded value belongs to, so `ready` can be DERIVED
  // (no synchronous setState in the effect): a context change re-gates readiness
  // until its async load lands.
  const [loaded, setLoaded] = useState<{ context: string; cursor: number | null } | null>(null);

  useEffect(() => {
    let active = true;
    void loadHandoffCursor(context).then((value) => {
      if (active) setLoaded({ context, cursor: value });
    });
    return () => {
      active = false;
    };
  }, [context]);

  const markCaughtUp = useCallback(() => {
    const now = Date.now();
    setLoaded({ context, cursor: now });
    void saveHandoffCursor(context, now);
  }, [context]);

  const ready = loaded?.context === context;
  const cursor = ready ? (loaded?.cursor ?? null) : null;

  return { cursor, ready, markCaughtUp };
}
