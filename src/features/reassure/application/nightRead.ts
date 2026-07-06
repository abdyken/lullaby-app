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
 * Flow: AsyncStorage cache (per baby per night) → edge function (allowed to run
 * to completion under a client wait-cap that EXCEEDS the function's own 8s LLM
 * timeout, so a slow-but-successful read is never dropped) → cache + show. The
 * edge function re-computes tallies server-side under RLS and runs the
 * triage-first flow; see supabase/functions/reassure-night-read/index.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { consentAllowsAiNightRead } from '@/features/reassure/domain/aiConsent';
import {
  classifyNightReadResponse,
  nightReadView,
  type NightReadStatus,
} from '@/features/reassure/domain/nightReadView';
import type { ReassureNightRecap } from '@/features/reassure/domain/types';
import { canUseLlmNightRead } from '@/lib/proGates';
import { supabase } from '@/lib/supabase';
import { useAnalytics } from '@/lib/useAnalytics';
import { useAuth } from '@/state/AuthProvider';
import { usePro } from '@/state/ProProvider';

import { NIGHT_READ_CACHE_PREFIX } from './nightReadKeys';
import { useAiNightReadConsent } from './useAiNightReadConsent';

const CACHE_PREFIX = NIGHT_READ_CACHE_PREFIX;
// Client wait-cap. It must EXCEED the function's own 8s server-side LLM timeout
// (LLM_TIMEOUT_MS in _shared/reassureLlm.ts) — otherwise an uncached call, which
// routinely takes ~5-8s (model + guardrail + audit + cache write; measured 7.2s
// on the first live success), is abandoned before it answers and mislabeled
// "unavailable" while the server is actually succeeding + caching. Hitting this
// cap is treated as 'pending' (unknown), never as a failure.
const FETCH_TIMEOUT_MS = 12_000;

/** The night's key = the local calendar date the window OPENED on. */
export function nightKeyFor(windowStartMs: number): string {
  const d = new Date(windowStartMs);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

type NightReadResponse = { read?: string; source?: string };

/**
 * The three ways an attempt can resolve for the UI:
 *   - 'read'     → the function returned an AI read (fresh or server-cached).
 *   - 'fallback' → the function RESOLVED with no read (guardrail / disabled /
 *                  error) → the honest "unavailable" note.
 *   - 'pending'  → we hit the client wait-cap before the function answered.
 *                  UNKNOWN, not a failure: keep the calm loading state and let
 *                  the next open pick the read up from the fast server cache.
 */
type FetchOutcome = { kind: 'read'; text: string } | { kind: 'fallback' } | { kind: 'pending' };

async function fetchNightRead(babyId: string, nightKey: string): Promise<FetchOutcome> {
  if (!supabase) return { kind: 'fallback' };
  try {
    // The local read is already on screen, so nothing blocks. We let the invoke
    // run to completion (the function bounds itself to 8s server-side) and only
    // cap the wait to avoid hanging forever — a cap-hit is 'pending', never a
    // failure. A short abort here is exactly what showed "unavailable" while a
    // ~7s call was still succeeding and caching the read server-side.
    const raced = await Promise.race([
      supabase.functions
        .invoke<NightReadResponse>('reassure-night-read', {
          body: {
            babyId,
            nightKey,
            tzOffsetMinutes: new Date().getTimezoneOffset(),
          },
        })
        .then((r) => ({ timedOut: false as const, r })),
      new Promise<{ timedOut: true }>((resolve) => {
        setTimeout(() => resolve({ timedOut: true }), FETCH_TIMEOUT_MS);
      }),
    ]);
    if (raced.timedOut) return { kind: 'pending' };
    if (raced.r.error) return { kind: 'fallback' };
    // A server cache hit and a fresh model answer both return { read, source:'llm' }.
    return classifyNightReadResponse(raced.r.data);
  } catch {
    return { kind: 'fallback' };
  }
}

// The coarse UI status lives in the pure domain leaf (domain/nightReadView.ts)
// so the smoke runner can pin the display contract; re-exported here for the
// components that already import it from this hook.
export type { NightReadStatus };

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
        // Cache-FIRST, keyed per (baby, night). A hit short-circuits the entire
        // edge call — no invoke, no server work, no token spend on this device.
        // But this local cache is only a per-DEVICE fast path; it is NOT the
        // re-spend guarantee. The authoritative once-per-night guard is the
        // server-side PK on reassure_night_reads (see the edge function): even a
        // miss here returns the already-stored row without ever calling Haiku.
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cancelled) return;
        if (cached != null && cached.length > 0) {
          setOutcome({ key: cacheKey, text: cached });
          track('reassure_night_read_shown', { source: 'cache' });
          return;
        }
        // Local cache miss → invoke the edge function. This is the ONLY client
        // path that can reach the model, and only after the eligible + consent
        // gate on this effect has already passed. The server still re-checks its
        // own cache PK first, so this actually spends a token only on the very
        // first uncached night for this baby.
        const fetched = await fetchNightRead(babyId, nightKey);
        if (cancelled) return;
        if (fetched.kind === 'read') {
          setOutcome({ key: cacheKey, text: fetched.text });
          track('reassure_night_read_shown', { source: 'llm' });
          // Persist locally so this device never re-invokes for this night;
          // best-effort — a write failure just means the next open re-fetches
          // from the fast server cache (still no re-spend, thanks to the PK).
          void AsyncStorage.setItem(cacheKey, fetched.text).catch(() => {});
          return;
        }
        if (fetched.kind === 'fallback') {
          // The function RESOLVED with no AI read (guardrail / disabled / error).
          // Honest "unavailable": the local read stays and nothing is cached, so a
          // later open re-attempts once the prompt / kill-switch is fixed.
          setOutcome({ key: cacheKey, text: null });
          return;
        }
        // 'pending' — we hit the client wait-cap before the function answered.
        // Leave the outcome UNRESOLVED (calm loading, never the scary note); the
        // next open re-attempts and picks the read up from the fast server cache.
      } catch {
        // silently keep the local read
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [babyId, cacheKey, eligible, nightKey, track]);

  // Only trust an outcome that belongs to the CURRENT key (a stale one for a
  // different night/baby simply doesn't match); nightReadView maps it — together
  // with eligibility — to the read + honest status the screen renders.
  const matched = outcome !== null && outcome.key === cacheKey ? { text: outcome.text } : null;
  const { read, status } = nightReadView(eligible, matched);

  return {
    read,
    status,
    // Ask exactly once: eligible-for-AI, consent loaded, and still undecided.
    needsConsent: aiEligible && consent.ready && consent.status === null,
    grantConsent: consent.grant,
    declineConsent: consent.decline,
  };
}
