/**
 * useV2QuickLogMeta — React hook that produces QuickLogMeta from the v2 logging store.
 *
 * Reads active sessions and today's events from useLoggingStore(). Ticks every
 * second while any active session is running so elapsed-time labels stay current.
 * After an app restart the store is already hydrated from AsyncStorage, so the
 * strings correctly reflect the recovered sessions.
 *
 * Returns the same QuickLogMeta shape as buildQuickLogMeta so it can be passed
 * to QuickLogRow unchanged.
 */
import { useEffect, useState } from 'react';

import type { QuickLogMeta } from '@/data/currentState';
import { useLoggingStore } from '../state/loggingStore';
import { calcElapsedMs, formatElapsedHuman } from '../timer/sessionMath';
import type {
  BreastFeedEvent,
  BottleFeedEvent,
  DiaperEvent,
  PumpEvent,
  SleepEvent,
} from '../domain/types';

/** "Xm ago" / "Xh Ym ago" — ms is computed by calcElapsedMs so Date.now() stays inside the helper. */
function agoLabel(elapsedMs: number): string {
  const mins = Math.floor(elapsedMs / 60_000);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m ago`;
  }
  return `${mins}m ago`;
}

function sideLabel(side: 'left' | 'right' | null): string {
  if (side === 'left') return 'left';
  if (side === 'right') return 'right';
  return '';
}

export function useV2QuickLogMeta(): QuickLogMeta {
  const store = useLoggingStore();
  const { activeBreastFeed, activeSleep, activePump, todayEvents } = store;

  // Tick every second while any active timer is running so labels update.
  const hasActiveTimer =
    (activeBreastFeed !== null && activeBreastFeed.endedAt === null) ||
    activeSleep !== null ||
    (activePump !== null && activePump.endedAt === null);

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!hasActiveTimer) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasActiveTimer]);

  const visible = todayEvents.filter((e) => e.status !== 'deleted' && e.status !== 'cancelled');

  // ── Feed ────────────────────────────────────────────────────────────────────
  // calcElapsedMs / agoLabel call Date.now() internally — not a direct render call.
  let feed = 'Tap to log';
  if (activeBreastFeed && activeBreastFeed.endedAt === null) {
    const elapsed = calcElapsedMs(activeBreastFeed.startedAt);
    const side = sideLabel(activeBreastFeed.details.activeSide);
    feed = side
      ? `Feeding · ${formatElapsedHuman(elapsed)} · ${side}`
      : `Feeding · ${formatElapsedHuman(elapsed)}`;
  } else {
    const lastFeed = visible
      .filter((e) => e.type === 'feed' && e.status === 'completed')
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0];
    if (lastFeed) {
      const feedEvent = lastFeed as BreastFeedEvent | BottleFeedEvent;
      const sideStr =
        feedEvent.method === 'breast'
          ? ((feedEvent as BreastFeedEvent).details.activeSide === 'left' ? 'left' : 'right')
          : 'Bottle';
      feed = `${sideStr} · ${agoLabel(calcElapsedMs(lastFeed.occurredAt))}`;
    }
  }

  // ── Sleep ───────────────────────────────────────────────────────────────────
  let sleep = 'Tap to start';
  if (activeSleep) {
    const elapsed = calcElapsedMs(activeSleep.startedAt);
    sleep = `Sleeping · ${formatElapsedHuman(elapsed)}`;
  } else {
    const lastSleep = visible
      .filter((e) => e.type === 'sleep' && e.status === 'completed')
      .sort((a, b) => {
        const aTime = new Date((a as SleepEvent).startedAt ?? a.occurredAt).getTime();
        const bTime = new Date((b as SleepEvent).startedAt ?? b.occurredAt).getTime();
        return bTime - aTime;
      })[0] as SleepEvent | undefined;
    if (lastSleep && lastSleep.startedAt && lastSleep.endedAt) {
      const durMs = Math.max(
        0,
        new Date(lastSleep.endedAt).getTime() - new Date(lastSleep.startedAt).getTime(),
      );
      sleep = `Last nap ${formatElapsedHuman(durMs)}`;
    }
  }

  // ── Diaper ──────────────────────────────────────────────────────────────────
  let diaper = 'Tap to log';
  const lastDiaper = visible
    .filter((e) => e.type === 'diaper' && e.status === 'completed')
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0] as
    | DiaperEvent
    | undefined;
  if (lastDiaper) {
    const kindLabel = lastDiaper.details.kind === 'both' ? 'mixed' : lastDiaper.details.kind;
    diaper = `${kindLabel} · ${agoLabel(calcElapsedMs(lastDiaper.occurredAt))}`;
  }

  // ── Pump ────────────────────────────────────────────────────────────────────
  let pump = 'Log pump';
  if (activePump) {
    if (activePump.endedAt === null) {
      const elapsed = calcElapsedMs(activePump.startedAt);
      pump = `Pumping · ${formatElapsedHuman(elapsed)} · ${activePump.details.side}`;
    } else {
      pump = 'Add volume';
    }
  } else {
    const lastPump = visible
      .filter((e) => e.type === 'pump' && e.status === 'completed')
      .sort((a, b) => {
        const aTime = new Date((a as PumpEvent).startedAt ?? a.occurredAt).getTime();
        const bTime = new Date((b as PumpEvent).startedAt ?? b.occurredAt).getTime();
        return bTime - aTime;
      })[0] as PumpEvent | undefined;
    if (lastPump) {
      pump = agoLabel(calcElapsedMs(lastPump.startedAt ?? lastPump.occurredAt));
    }
  }

  return { feed, sleep, diaper, pump };
}
