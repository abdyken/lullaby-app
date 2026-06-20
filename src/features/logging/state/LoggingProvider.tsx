/**
 * Logging v2 — React provider (plan §1.3 store, §2.3 "hide it behind a single
 * logging feature API", §6 AppState, Phase 4 session engine).
 *
 * The thin React seam that turns the pure logging layers into a live feature:
 *   - owns a device-backed `LoggingRepository` + the system clock,
 *   - holds `LoggingState` and rebuilds it via `hydrateLoggingState` on mount
 *     and `reconcileLoggingState` on every foreground (so timers survive restart
 *     and recompute from timestamps — there is no persisted counter),
 *   - exposes the Feed use-cases (start/switch/finish/cancel breast, save bottle)
 *     as bound actions that run the pure use-case then refresh the store.
 *
 * It is GATED on the `loggingV2` flag: while the flag is off (the production
 * default during migration) the provider does no I/O at all — no hydrate, no
 * AppState subscription — so the existing MVP is completely untouched. Nothing
 * renders v2 data unless a flag-on caller opens a v2 flow.
 *
 * This file is React + AsyncStorage, so it is NOT re-exported from the logging
 * barrel (which stays Node-runnable). Import it directly.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { baby as seedBaby, caregivers as seedCaregivers } from '@/data/mock';
import { useAuth } from '@/state/AuthProvider';

import { isLoggingV2Enabled } from '../config/featureFlags';
import { createDeviceLoggingRepository } from '../data/loggingStorage';
import type { LoggingRepository } from '../data/LoggingRepository';
import type { LoggingError } from '../domain/errors';
import type { BreastFeedEvent, BreastSide, SleepEvent } from '../domain/types';
import { systemClock } from '../timer/clock';
import { subscribeForeground } from '../timer/appStateReconcile';
import {
  cancelBreastFeed,
  cancelSleep as runCancelSleep,
  finishBreastFeed,
  finishSleep as runFinishSleep,
  saveBottleFeed,
  saveCompletedSleep as runSaveCompletedSleep,
  startBreastFeed,
  startSleep as runStartSleep,
  switchBreastSide,
  type LoggingActor,
  type LoggingUseCaseDeps,
  type SaveBottleFeedInput,
  type SaveCompletedSleepInput,
  type StartSleepInput,
} from '../application';
import { hydrateLoggingState, reconcileLoggingState, type LoggingScope } from './loggingHydration';
import {
  clearError as clearErrorTransition,
  createInitialLoggingState,
  withError,
  type LoggingState,
} from './loggingStore';

type LoggingContextValue = {
  /** Whether the v2 logging system is active. When false, all data is inert. */
  enabled: boolean;
  /** True once the launch hydrate has resolved (or immediately when disabled). */
  hydrated: boolean;
  /** True when enabled AND an actor (family/child/caregiver) is resolved. */
  ready: boolean;
  /** The running breastfeeding session, or null. */
  activeBreastFeed: BreastFeedEvent | null;
  /** The running sleep session for the child, or null. */
  activeSleep: SleepEvent | null;
  /** Recover/error state from the last action (plan §6); null when clear. */
  error: LoggingError | null;
  clearError: () => void;

  /** Start (or reopen) a breastfeeding session on the given side. */
  startBreast: (side: BreastSide) => Promise<void>;
  /** Switch the active breastfeeding session to the other side. */
  switchBreast: (side: BreastSide) => Promise<void>;
  /** Finish the active breastfeeding session (→ completed). */
  finishBreast: () => Promise<void>;
  /** Cancel the active breastfeeding session (→ cancelled, never a logged feed). */
  cancelBreast: () => Promise<void>;
  /** Save a completed bottle feed. Returns false when validation rejected it. */
  saveBottle: (input: SaveBottleFeedInput) => Promise<boolean>;

  /** Start (or reopen) the child's sleep session. Accepts a backdated start. */
  startSleep: (input?: StartSleepInput) => Promise<void>;
  /** Finish the active sleep session — "Baby woke up" (→ completed, endedAt = now). */
  finishSleep: () => Promise<void>;
  /** Cancel the active sleep session (→ cancelled, never a logged sleep). */
  cancelSleep: () => Promise<void>;
  /** Log an already-finished sleep. Returns false when validation rejected it. */
  saveCompletedSleep: (input: SaveCompletedSleepInput) => Promise<boolean>;
};

const LoggingContext = createContext<LoggingContextValue | null>(null);

/**
 * Resolve the current actor (family/child/caregiver). Local-only mode uses the
 * seed baby + first caregiver (the demo's Mia / Mom), matching the existing MVP;
 * Supabase mode uses the real linked baby + signed-in caregiver once ready.
 * Returns null while a configured session is still resolving / not linked, so
 * the provider simply waits. `familyId` mirrors the child scope for now (audit §13).
 */
function useLoggingActor(): LoggingActor | null {
  const { status, baby, caregiver } = useAuth();
  return useMemo<LoggingActor | null>(() => {
    if (status === 'local-only') {
      const childId = seedBaby.id;
      const userId = seedCaregivers[0]?.id ?? 'local-caregiver';
      return { familyId: childId, childId, userId };
    }
    if (status === 'ready' && baby && caregiver) {
      return { familyId: baby.id, childId: baby.id, userId: caregiver.id };
    }
    return null;
  }, [status, baby, caregiver]);
}

export function LoggingProvider({ children }: { children: ReactNode }) {
  const enabled = isLoggingV2Enabled();
  const actor = useLoggingActor();

  // Device-backed repository, stable for the provider's lifetime. It is a thin,
  // stateless wrapper over AsyncStorage, so even if the memo were ever discarded
  // and recreated it would be harmless; useMemo just keeps effect deps steady.
  const repo = useMemo<LoggingRepository>(() => createDeviceLoggingRepository(systemClock), []);
  const clock = systemClock;

  const [state, setState] = useState<LoggingState>(() => createInitialLoggingState());
  // Mirror state in a ref so action callbacks read the latest without depending
  // on `state` (mirrors the LocalEventProvider pattern).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Serialize mutations + block double-taps during the short write phase (plan §10).
  const mutatingRef = useRef(false);

  const scope: LoggingScope | null = useMemo(
    () => (actor ? { familyId: actor.familyId, childId: actor.childId, userId: actor.userId } : null),
    [actor],
  );

  // Launch hydrate + foreground reconcile — only when enabled and an actor is
  // resolved. Disabled or no actor → no I/O at all (the MVP path is untouched).
  useEffect(() => {
    if (!enabled || !scope) return;
    let cancelled = false;

    (async () => {
      const next = await hydrateLoggingState(repo, scope, clock);
      if (!cancelled) setState(next);
    })();

    const unsubscribe = subscribeForeground(() => {
      void (async () => {
        const next = await reconcileLoggingState(repo, scope, clock, stateRef.current);
        if (!cancelled) setState(next);
      })();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, scope, repo, clock]);

  // Re-read events + active sessions after a mutation, preserving UI-only state.
  const refresh = useCallback(async () => {
    if (!scope) return;
    const next = await reconcileLoggingState(repo, scope, clock, stateRef.current);
    setState(next);
  }, [repo, scope, clock]);

  /** Run an action exclusively (drops re-entrant taps during the write phase). */
  const runExclusive = useCallback(async (fn: () => Promise<void>) => {
    if (mutatingRef.current) return;
    mutatingRef.current = true;
    try {
      await fn();
    } finally {
      mutatingRef.current = false;
    }
  }, []);

  const deps = useMemo<LoggingUseCaseDeps | null>(
    () => (actor ? { repo, clock, actor } : null),
    [repo, clock, actor],
  );

  // A use-case validates BEFORE it writes, so a failure changed nothing — set the
  // error and skip refresh (which would re-read and clear it). A success refreshes
  // from the repo, which also clears any stale error.
  const startBreast = useCallback(
    async (side: BreastSide) => {
      if (!deps) return;
      await runExclusive(async () => {
        const result = await startBreastFeed(deps, { side });
        if (result.ok) await refresh();
        else setState((prev) => withError(prev, result.error));
      });
    },
    [deps, refresh, runExclusive],
  );

  const switchBreast = useCallback(
    async (side: BreastSide) => {
      const event = stateRef.current.activeBreastFeed;
      if (!deps || !event) return;
      await runExclusive(async () => {
        const result = await switchBreastSide(deps, { event, side });
        if (result.ok) await refresh();
        else setState((prev) => withError(prev, result.error));
      });
    },
    [deps, refresh, runExclusive],
  );

  const finishBreast = useCallback(async () => {
    const event = stateRef.current.activeBreastFeed;
    if (!deps || !event) return;
    await runExclusive(async () => {
      const result = await finishBreastFeed(deps, { event });
      if (result.ok) await refresh();
      else setState((prev) => withError(prev, result.error));
    });
  }, [deps, refresh, runExclusive]);

  const cancelBreast = useCallback(async () => {
    const event = stateRef.current.activeBreastFeed;
    if (!deps || !event) return;
    await runExclusive(async () => {
      await cancelBreastFeed(deps, { event });
      await refresh();
    });
  }, [deps, refresh, runExclusive]);

  const saveBottle = useCallback(
    async (input: SaveBottleFeedInput) => {
      if (!deps) return false;
      let ok = false;
      await runExclusive(async () => {
        const result = await saveBottleFeed(deps, input);
        if (result.ok) {
          ok = true;
          await refresh();
        } else {
          setState((prev) => withError(prev, result.error));
        }
      });
      return ok;
    },
    [deps, refresh, runExclusive],
  );

  // Sleep — same pattern as the breast actions: validate-then-write use-cases,
  // refresh on success, set the recover/error state on failure. A second start
  // reopens the existing session (the use-case guards one active sleep per child).
  const startSleep = useCallback(
    async (input: StartSleepInput = {}) => {
      if (!deps) return;
      await runExclusive(async () => {
        const result = await runStartSleep(deps, input);
        if (result.ok) await refresh();
        else setState((prev) => withError(prev, result.error));
      });
    },
    [deps, refresh, runExclusive],
  );

  const finishSleep = useCallback(async () => {
    const event = stateRef.current.activeSleep;
    if (!deps || !event) return;
    await runExclusive(async () => {
      const result = await runFinishSleep(deps, { event });
      if (result.ok) await refresh();
      else setState((prev) => withError(prev, result.error));
    });
  }, [deps, refresh, runExclusive]);

  const cancelSleep = useCallback(async () => {
    const event = stateRef.current.activeSleep;
    if (!deps || !event) return;
    await runExclusive(async () => {
      await runCancelSleep(deps, { event });
      await refresh();
    });
  }, [deps, refresh, runExclusive]);

  const saveCompletedSleep = useCallback(
    async (input: SaveCompletedSleepInput) => {
      if (!deps) return false;
      let ok = false;
      await runExclusive(async () => {
        const result = await runSaveCompletedSleep(deps, input);
        if (result.ok) {
          ok = true;
          await refresh();
        } else {
          setState((prev) => withError(prev, result.error));
        }
      });
      return ok;
    },
    [deps, refresh, runExclusive],
  );

  const clearError = useCallback(() => setState((prev) => clearErrorTransition(prev)), []);

  const value = useMemo<LoggingContextValue>(
    () => ({
      enabled,
      hydrated: enabled ? state.hydrated : true,
      ready: enabled && actor !== null,
      activeBreastFeed: state.activeBreastFeed,
      activeSleep: state.activeSleep,
      error: state.error,
      clearError,
      startBreast,
      switchBreast,
      finishBreast,
      cancelBreast,
      saveBottle,
      startSleep,
      finishSleep,
      cancelSleep,
      saveCompletedSleep,
    }),
    [
      enabled,
      actor,
      state.hydrated,
      state.activeBreastFeed,
      state.activeSleep,
      state.error,
      clearError,
      startBreast,
      switchBreast,
      finishBreast,
      cancelBreast,
      saveBottle,
      startSleep,
      finishSleep,
      cancelSleep,
      saveCompletedSleep,
    ],
  );

  return <LoggingContext.Provider value={value}>{children}</LoggingContext.Provider>;
}

/** Access the logging v2 feature API. Must be used under a LoggingProvider. */
export function useLogging(): LoggingContextValue {
  const ctx = useContext(LoggingContext);
  if (!ctx) {
    throw new Error('useLogging must be used within a LoggingProvider');
  }
  return ctx;
}
