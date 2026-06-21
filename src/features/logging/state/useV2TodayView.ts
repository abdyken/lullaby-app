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
 * Returns `null` when the `loggingV2` flag is off, so the screen falls straight
 * back to the legacy `useLocalEvents` view (the production path is untouched).
 *
 * React + app-type imports, so it is NOT re-exported from the Node-safe barrel;
 * the screen imports it directly (like `LoggingProvider` / `useElapsedTime`).
 */
import { useMemo } from 'react';

import type { CurrentBabyState, PreviewState, QuickLogMeta, TonightStatusItem } from '@/data/currentState';
import { TIMELINE_LIMIT } from '@/data/localInteractions';
import type { TimelineEntry } from '@/data/mock';
import type { Caregiver } from '@/data/models';

import type { CareEvent } from '../domain/types';
import { formatCompactDuration, sessionElapsedMs } from '../timer/sessionMath';
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
  activeTile: PreviewState | null;
  timeline: TimelineEntry[];
  quickLogMeta: QuickLogMeta;
  tonightStatus: TonightStatusItem[];
  /** Hero primary action — toggles the v2 sleep session (start ⇄ "Baby woke up"). */
  onPrimaryAction: () => void;
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
const SLEEP_PROGRESS_FULL_MS = 200 * 60_000;

/**
 * Today view-model from the v2 store, or `null` when the flag is off. `now` is the
 * (possibly frozen, during a theme reveal) reference time; durations are derived
 * from timestamps so this carries no ticking counter.
 */
export function useV2TodayView(params: { now?: number; caregivers: Caregiver[] }): V2TodayView | null {
  const { now: nowParam, caregivers } = params;
  const logging = useLogging();

  return useMemo<V2TodayView | null>(() => {
    if (!logging.enabled) return null;
    const now = resolveNow(nowParam);
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
        timerText: formatCompactDuration(elapsed),
        title: 'Sleep started',
        description: `Started ${clockLabel(activeSleep.startedAt)} · we'll keep the night quiet`,
        actionLabel: 'Baby woke up',
        progress: Math.min(1, elapsed / SLEEP_PROGRESS_FULL_MS),
      };
    } else {
      const feedVal = tonightStatus.find((i) => i.key === 'feed')?.value;
      const diaperVal = tonightStatus.find((i) => i.key === 'diaper')?.value;
      const parts: string[] = [];
      if (feedVal && feedVal !== 'None yet') parts.push(`Last feed ${feedVal}`);
      if (diaperVal && diaperVal !== 'None yet') parts.push(`Last diaper ${diaperVal}`);
      orb = {
        state: 'sleep',
        skyTone: 'day',
        eyebrow: 'All quiet',
        timerText: 'Calm',
        title: 'All caught up',
        description: parts.length > 0 ? parts.join(' · ') : 'Tap a tile to log the next feed, sleep, or change.',
        actionLabel: 'Start sleep',
        progress: 0,
      };
    }

    // Active ring: feed while breastfeeding, otherwise sleep while asleep.
    const activeTile: PreviewState | null = activeBreastFeed ? 'feed' : activeSleep ? 'sleep' : null;

    // Timeline (plan §7.4) — newest first, capped to the Tonight home limit. The
    // formatter is purely descriptive; the row's icon/tint come from `kind`.
    const byId = new Map(caregivers.map((c) => [c.id, c]));
    const timeline: TimelineEntry[] = [...todayEvents]
      .sort((a, b) => ms(b.occurredAt) - ms(a.occurredAt))
      .slice(0, TIMELINE_LIMIT)
      .map((event) => {
        const view = formatTimelineEvent(event, now);
        const cg = byId.get(event.createdByUserId);
        return {
          id: event.id,
          time: timelineTime(event, now),
          kind: view.icon,
          label: view.subtitle ? `${view.title} · ${view.subtitle}` : view.title,
          caregiverName: cg?.displayName ?? null,
          caregiverColor: cg?.colorHex ?? null,
        };
      });

    const onPrimaryAction = () => {
      void (logging.activeSleep ? logging.finishSleep() : logging.startSleep());
    };

    return { orb, activeTile, timeline, quickLogMeta, tonightStatus, onPrimaryAction };
  }, [logging, nowParam, caregivers]);
}
