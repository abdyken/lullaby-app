/**
 * useNightRead — the Phase-2 LLM night read (client side).
 *
 * Contract with the 2am parent: the LOCAL, code-computed read renders first
 * and instantly; this hook may later swap in the Claude-phrased two-sentence
 * read. Never a spinner, never a wait, never an error surface — every failure
 * mode silently keeps the local text (returns null).
 *
 * Runs only when ALL hold: Supabase configured + signed in + a baby linked +
 * the Pro gate open (canUseLlmNightRead) + the parent has EXPLICITLY consented
 * to AI processing (useAiNightReadConsent). Free users — and Pro users who have
 * not consented — always get the local descriptive read: this gates polish, not
 * safety. Without consent the client NEVER calls the edge function; instead the
 * screen shows the one-time consent notice (needsConsent).
 *
 * The server kill-switch (REASSURE_NIGHT_READ_ENABLED) is enforced ON THE SERVER
 * — a disabled function returns the local fallback without ever calling
 * Anthropic. The client cannot see it and does not need to; consent + Pro are
 * the two client-side gates.
 *
 * Flow: AsyncStorage cache (per baby per night) → edge function with a hard
 * 3s abort → cache + show. The edge function re-computes tallies server-side
 * under RLS and runs the triage-first flow; see
 * supabase/functions/reassure-night-read/index.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { consentAllowsAiNightRead } from '@/features/reassure/domain/aiConsent';
import type { ReassureNightRecap } from '@/features/reassure/domain/types';
import { canUseLlmNightRead } from '@/lib/proGates';
import { supabase } from '@/lib/supabase';
import { useAnalytics } from '@/lib/useAnalytics';
import { useAuth } from '@/state/AuthProvider';
import { usePro } from '@/state/ProProvider';

import { NIGHT_READ_CACHE_PREFIX } from './nightReadKeys';
import { useAiNightReadConsent } from './useAiNightReadConsent';

const CACHE_PREFIX = NIGHT_READ_CACHE_PREFIX;
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

/**
 * Coarse, honest status for the UI — never a technical error, never a leak of a
 * blocked-vs-timeout distinction:
 *   - 'idle'        — the client is not attempting an AI read (not Pro/eligible,
 *                     no consent, empty night). Show the local read, nothing else.
 *   - 'loading'     — eligible + consented, the attempt is in flight (≤3s). Still
 *                     just the local read; no spinner, no caption.
 *   - 'ai'          — an AI read is showing; label it clearly as AI-phrased.
 *   - 'unavailable' — we attempted and got no AI read (fallback/blocked/timeout);
 *                     show a calm "AI read isn't available right now" note.
 */
export type NightReadStatus = 'idle' | 'loading' | 'ai' | 'unavailable';

export type NightReadState = {
  /** The AI-phrased read to overlay on the local recap, or null to keep local. */
  read: string | null;
  /** Coarse, honest status the screen uses to label AI vs the local fallback. */
  status: NightReadStatus;
  /**
   * True only when the parent is AI-eligible (Pro/dev + signed in + a baby +
   * this night has data) but has NOT yet decided on consent — the signal that
   * drives the one-time consent notice. False once they grant or decline, and
   * false for anyone who isn't AI-eligible in the first place.
   */
  needsConsent: boolean;
  /** Record consent and allow the client to attempt the AI read. */
  grantConsent: () => void;
  /** Record a decline; the local read stays and the notice does not return. */
  declineConsent: () => void;
};

export function useNightRead(recap: ReassureNightRecap): NightReadState {
  const { session, baby } = useAuth();
  const { isPro } = usePro();
  const consent = useAiNightReadConsent();
  const track = useAnalytics();
  // Keyed by cache key so a read for one night/baby can never leak into
  // another — and so no synchronous setState is needed to "reset" (the return
  // value simply stops matching). All sets below happen in async callbacks.
  //   text: string → an AI read is ready.
  //   text: null   → we attempted (eligible + consented) and there was no AI
  //                  read for us — the UI can honestly say it's unavailable.
  //   whole value null → not resolved yet for this key (still loading).
  const [outcome, setOutcome] = useState<{ key: string; text: string | null } | null>(null);

  const babyId = baby?.id ?? null;
  const signedIn = session != null;
  const nightKey = nightKeyFor(recap.window.startMs);
  const cacheKey = babyId == null ? null : `${CACHE_PREFIX}:${babyId}:${nightKey}`;
  // AI-eligibility EXCLUDING consent — the Pro/dev gate + a night worth reading.
  const aiEligible =
    recap.window.label !== 'today' &&
    supabase != null &&
    signedIn &&
    babyId != null &&
    canUseLlmNightRead(isPro) &&
    !recap.isEmpty;
  // The client may only CALL the edge function once consent is explicitly given.
  const consentGranted = consentAllowsAiNightRead(consent.status);
  const eligible = aiEligible && consentGranted;

  useEffect(() => {
    if (!eligible || babyId == null || cacheKey == null) return;
    let cancelled = false;

    void (async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cancelled) return;
        if (cached != null && cached.length > 0) {
          setOutcome({ key: cacheKey, text: cached });
          track('reassure_night_read_shown', { source: 'cache' });
          return;
        }
        const fetched = await fetchNightRead(babyId, nightKey);
        if (cancelled) return;
        if (fetched == null) {
          // Attempted and came back empty (server fallback / guardrail / timeout).
          // Record the honest "no AI read" so the UI can show a calm note rather
          // than silently pretend nothing was tried. Nothing is cached, so a
          // later open re-attempts once the prompt/kill-switch is fixed.
          setOutcome({ key: cacheKey, text: null });
          return;
        }
        setOutcome({ key: cacheKey, text: fetched });
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

  // Only trust an outcome that belongs to the CURRENT key (a stale one for a
  // different night/baby simply doesn't match). Not eligible → always 'idle'.
  const resolved = eligible && outcome !== null && outcome.key === cacheKey ? outcome : null;
  const status: NightReadStatus = !eligible
    ? 'idle'
    : resolved === null
      ? 'loading'
      : resolved.text !== null
        ? 'ai'
        : 'unavailable';

  return {
    read: resolved !== null ? resolved.text : null,
    status,
    // Ask exactly once: eligible-for-AI, consent loaded, and still undecided.
    needsConsent: aiEligible && consent.ready && consent.status === null,
    grantConsent: consent.grant,
    declineConsent: consent.decline,
  };
}
