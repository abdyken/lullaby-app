/**
 * Logging v2 — Today screen view-model (plan §7.1, §7.4, Phase 6.5).
 *
 * The single seam that lets the existing Today screen render from the v2 store
 * WITHOUT touching the presentational components (`OrbHero`, `QuickLogRow`,
 * `TimelineCard`, `TonightStatus`). It consumes `useLogging()` and returns exactly
 * the legacy display shapes the screen already passes down:
 *   - `orb`           — the sleep Hero (`CurrentBabyState`): the v2 sleep session or
 *                       a calm "last feed · last diaper" line. This is the single
 *                       source of truth for Sleep (plan Phase 6.5) — `onPrimaryAction`
 *                       starts/finishes the SAME v2 session the card + sheet drive.
 *   - `activeTile`    — which quick-log card shows the active ring.
 *   - `timeline`      — `TimelineEntry[]` built via `formatTimelineEvent` (plan §7.4).
 *   - `quickLogMeta`  — the four card subtitles (plan §7.1).
 *   - `tonightStatus` — the "time since last…" strip, v2 source.
 *
 * Returns `null` until logging hydration completes, so the tab shell can keep
 * the startup loading surface instead of flashing an empty Today view.
 *
 * React + app-type imports, so it is NOT re-exported from the Node-safe barrel;
 * the screen imports it directly (like `LoggingProvider` / `useElapsedTime`).
 */
import { useMemo } from 'react';

import type { CurrentBabyState, QuickLogMeta, TonightStatusItem } from '@/data/currentState';
import { TIMELINE_LIMIT } from '@/data/localInteractions';
import type { TimelineEntry } from '@/data/mock';
import type { Caregiver } from '@/data/models';
import type { QuickLogKind } from '@/components/QuickLogButton';

import type { CareEvent } from '../domain/types';
import { formatClock, sessionElapsedMs } from '../timer/sessionMath';
import { useElapsedTime } from '../timer/useElapsedTime';
import { useLogging } from './LoggingProvider';
import {
  buildV2QuickLogSubtitles,
  buildV2TonightStatus,
  formatTimelineEvent,
} from './timelineSelectors';

/** The legacy display shapes the Today screen consumes, rebuilt from the v2 store. */
export interface V2TodayView {
  orb: CurrentBabyState;
  /** Quick-log card that reads as active (feed when breastfeeding, sleep when asleep). */
  activeTile: QuickLogKind | null;
  timeline: TimelineEntry[];
  quickLogMeta: QuickLogMeta;
  tonightStatus: TonightStatusItem[];
  /** Hero primary action — toggles the v2 sleep session (start ⇄ "Baby woke up"). */
  onPrimaryAction: () => void;
}

export function shouldRenderV2TodayView(input: { enabled: boolean; hydrated: boolean }): boolean {
  return input.enabled && input.hydrated;
}

const ms = (iso: string): number => Date.parse(iso);

/**
 * Resolve the reference time off the hook's render path. The live clock is read in
 * this plain helper (not inside the hook body) so it mirrors the legacy
 * `getOrbView(..., now = Date.now())` precedent and stays clear of the
 * render-purity rule; a frozen `now` (during a theme reveal) is passed straight
 * through. Durations are still derived from timestamps — no counter is stored.
 */
function resolveNow(now: number | undefined): number {
  return now ?? Date.now();
}

/** "14:10" wall-clock label in local time, for "Started 14:10". */
function clockLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/** Show a running session / a just-logged event as "Now", else its wall-clock time. */
function timelineTime(event: CareEvent, now: number): string {
  if (event.status === 'active') return 'Now';
  if (now - ms(event.occurredAt) < 120_000) return 'Now';
  return clockLabel(event.occurredAt);
}

/** Full-scale minutes for the sleep progress ring (matches the legacy orb). */
const WAKE_WINDOW_MS = 2 * 60 * 60_000;

/** Reference hero format: "42m" below an hour, "1:24" once hours are present. */
function heroDuration(msValue: number): string {
  const totalMinutes = Math.max(0, Math.floor(msValue / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}` : `${totalMinutes}m`;
}

/** Latest completed sleep end is the beginning of the current awake window. */
function latestCompletedSleepEndedAt(events: CareEvent[]): string | null {
  let latest: string | null = null;
  for (const event of events) {
    if (event.type !== 'sleep' || event.status !== 'completed' || event.endedAt === null) continue;
    if (latest === null || ms(event.endedAt) > ms(latest)) latest = event.endedAt;
  }
  return latest;
}

function nextNapLabel(wakeStartedAt: string | null, now: number): string {
  if (wakeStartedAt === null) return 'Log a sleep to start the rhythm.';
  const target = ms(wakeStartedAt) + WAKE_WINDOW_MS;
  if (target <= now) return 'Nap window is open now';
  return `Next nap around ${clockLabel(new Date(target).toISOString())}`;
}

/**
 * Today view-model from the canonical store, or `null` until hydration is ready.
 * `now` is the (possibly frozen, during a theme reveal) reference time; durations
 * are derived from timestamps so this carries no ticking counter.
 */
export function useV2TodayView(params: { now?: number; caregivers: Caregiver[] }): V2TodayView | null {
  const { now: nowParam, caregivers } = params;
  const logging = useLogging();
  const wakeStartedAt = useMemo(
    () => latestCompletedSleepEndedAt(logging.todayEvents),
    [logging.todayEvents],
  );
  const runningPumpStartedAt =
    logging.activePump && logging.activePump.endedAt === null ? logging.activePump.startedAt : null;
  const tickStartedAt =
    logging.activeSleep?.startedAt ??
    logging.activeBreastFeed?.startedAt ??
    runningPumpStartedAt ??
    wakeStartedAt;
  const tickElapsed = useElapsedTime(tickStartedAt, logging.enabled && nowParam === undefined);
  const tickStartMs = tickStartedAt === null ? NaN : Date.parse(tickStartedAt);
  const tickNow = Number.isFinite(tickStartMs) ? tickStartMs + tickElapsed : undefined;

  return useMemo<V2TodayView | null>(() => {
    if (!shouldRenderV2TodayView(logging)) return null;
    const now = nowParam ?? tickNow ?? resolveNow(undefined);
    const { todayEvents, activeBreastFeed, activeSleep, activePump, pumpVolumeDraft } = logging;

    // Quick-log subtitles + status strip (plan §7.1).
    const quickLogMeta = buildV2QuickLogSubtitles(
      { todayEvents, activeBreastFeed, activeSleep, activePump, pumpVolumeDraft },
      now,
    );
    const tonightStatus = buildV2TonightStatus({ todayEvents, activeSleep }, now);

    // Sleep Hero (single source of truth, plan Phase 6.5): the running v2 sleep, or
    // a calm "last feed · last diaper" line derived from the status strip values.
    let orb: CurrentBabyState;
    if (activeSleep && activeSleep.startedAt) {
      const elapsed = sessionElapsedMs(activeSleep, now);
      orb = {
        state: 'sleep',
        skyTone: 'night',
        eyebrow: 'Asleep',
        timerText: formatClock(elapsed),
        title: 'Sleep started',
        description: `Started ${clockLabel(activeSleep.startedAt)} · still asleep`,
        actionLabel: 'Baby woke up',
        progress: Math.min(1, elapsed / WAKE_WINDOW_MS),
        stateIcon: 'moon',
      };
    } else {
      const awakeElapsed = wakeStartedAt === null ? 0 : Math.max(0, now - ms(wakeStartedAt));
      orb = {
        state: 'feed',
        skyTone: 'day',
        eyebrow: 'Awake',
        timerText: wakeStartedAt === null ? 'Ready' : heroDuration(awakeElapsed),
        title: 'Awake',
        description: nextNapLabel(wakeStartedAt, now),
        actionLabel: 'Start sleep',
        progress: Math.min(1, awakeElapsed / WAKE_WINDOW_MS),
        stateIcon: 'clock',
      };
    }

    // Active ring: feed while breastfeeding, sleep while asleep, pump while
    // running or waiting for volume. Diaper stays instant-only in the preview.
    const activeTile: QuickLogKind | null = activeBreastFeed
      ? 'feed'
      : activeSleep
        ? 'sleep'
        : activePump || pumpVolumeDraft
          ? 'pump'
          : null;

    // Timeline (plan §7.4) — newest first, capped to the Tonight home limit. The
    // formatter is purely descriptive; the row's icon/tint come from `kind`.
    const byId = new Map(caregivers.map((c) => [c.id, c]));
    const timeline: TimelineEntry[] = [...todayEvents]
      .sort((a, b) => ms(b.occurredAt) - ms(a.occurredAt))
      .slice(0, TIMELINE_LIMIT)
      .map((event) => {
        const view = formatTimelineEvent(event, now);
        const cg = byId.get(event.createdByUserId);
        const splitPumpDetail = event.type === 'pump' && event.status === 'completed';
        return {
          id: event.id,
          time: timelineTime(event, now),
          kind: view.icon,
          label: splitPumpDetail ? view.title : view.subtitle ? `${view.title} · ${view.subtitle}` : view.title,
          detail: splitPumpDetail ? view.subtitle : undefined,
          caregiverName: cg?.displayName ?? null,
          caregiverColor: cg?.colorHex ?? null,
        };
      });

    const onPrimaryAction = () => {
      void (logging.activeSleep ? logging.finishSleep() : logging.startSleep());
    };

    return { orb, activeTile, timeline, quickLogMeta, tonightStatus, onPrimaryAction };
  }, [logging, nowParam, tickNow, caregivers, wakeStartedAt]);
}
