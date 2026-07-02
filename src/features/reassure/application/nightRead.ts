/**
 * useNightRead — the Phase-2 LLM night read (client side).
 *
 * Contract with the 2am parent: the LOCAL, code-computed read renders first
 * and instantly; this hook may later swap in the Claude-phrased two-sentence
 * read. Never a spinner, never a wait, never an error surface — every failure
 * mode silently keeps the local text (returns null).
 *
 * Runs only when ALL hold: Supabase configured + signed in + a baby linked +
 * the Pro gate open (canUseLlmNightRead). Free users always get the local
 * descriptive read — this gates polish, not safety.
 *
 * Flow: AsyncStorage cache (per baby per night) → edge function with a hard
 * 3s abort → cache + show. The edge function re-computes tallies server-side
 * under RLS and runs the triage-first flow; see
 * supabase/functions/reassure-night-read/index.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import type { ReassureNightRecap } from '@/features/reassure/domain/types';
import { canUseLlmNightRead } from '@/lib/proGates';
import { supabase } from '@/lib/supabase';
import { useAnalytics } from '@/lib/useAnalytics';
import { useAuth } from '@/state/AuthProvider';
import { usePro } from '@/state/ProProvider';

const CACHE_PREFIX = 'lullaby/reassure/night-read/v1';
const FETCH_TIMEOUT_MS = 3_000;

/** The night's key = the local calendar date the window OPENED on. */
export function nightKeyFor(windowStartMs: number): string {
  const d = new Date(windowStartMs);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

type NightReadResponse = { read?: string; source?: string };

async function fetchNightRead(babyId: string, nightKey: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    // Hard 3s ceiling: the local read is already on screen, so a slow function
    // simply loses the race and the parent never notices.
    const result = await Promise.race([
      supabase.functions.invoke<NightReadResponse>('reassure-night-read', {
        body: {
          babyId,
          nightKey,
          tzOffsetMinutes: new Date().getTimezoneOffset(),
        },
      }),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), FETCH_TIMEOUT_MS);
      }),
    ]);
    if (result == null || result.error || !result.data?.read) return null;
    return result.data.read;
  } catch {
    return null;
  }
}

export function useNightRead(recap: ReassureNightRecap): string | null {
  const { session, baby } = useAuth();
  const { isPro } = usePro();
  const track = useAnalytics();
  // Keyed by cache key so a read for one night/baby can never leak into
  // another — and so no synchronous setState is needed to "reset" (the return
  // value simply stops matching). All sets below happen in async callbacks.
  const [read, setRead] = useState<{ key: string; text: string } | null>(null);

  const babyId = baby?.id ?? null;
  const signedIn = session != null;
  const nightKey = nightKeyFor(recap.window.startMs);
  const cacheKey = babyId == null ? null : `${CACHE_PREFIX}:${babyId}:${nightKey}`;
  const eligible =
    recap.window.label !== 'today' &&
    supabase != null &&
    signedIn &&
    babyId != null &&
    canUseLlmNightRead(isPro) &&
    !recap.isEmpty;

  useEffect(() => {
    if (!eligible || babyId == null || cacheKey == null) return;
    let cancelled = false;

    void (async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cancelled) return;
        if (cached != null && cached.length > 0) {
          setRead({ key: cacheKey, text: cached });
          track('reassure_night_read_shown', { source: 'cache' });
          return;
        }
        const fetched = await fetchNightRead(babyId, nightKey);
        if (cancelled || fetched == null) return;
        setRead({ key: cacheKey, text: fetched });
        track('reassure_night_read_shown', { source: 'llm' });
        void AsyncStorage.setItem(cacheKey, fetched).catch(() => {});
      } catch {
        // silently keep the local read
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [babyId, cacheKey, eligible, nightKey, track]);

  return eligible && read !== null && read.key === cacheKey ? read.text : null;
}
