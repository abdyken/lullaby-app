/**
 * useReassureSupport — the client side of the emotional-support companion.
 *
 * Reached ONLY for a { kind: 'support' } route outcome — i.e. an ask that has
 * already passed the three code gates in route() (infant red-flag, parent-crisis,
 * infant-medical). This hook applies the two REMAINING, non-safety gates —
 * Pro entitlement (canUseAiSupport) and one-time consent — and, only when both
 * pass, calls the reassure-support edge function. The server re-runs the same
 * three safety gates on the raw text before any model call, so a safety redirect
 * (triage / crisis / medical / oos) can still come back and is rendered verbatim.
 *
 * Safety is never gated here: triage / crisis / medical are decided in route()
 * BEFORE this hook is ever invoked, so a crisis ask never reaches the Pro/consent
 * checks below. A non-Pro or not-yet-consented parent gets the local, non-AI
 * support line — never a paywall wall in place of help.
 *
 * PRIVACY: the raw text is sent ONLY to the edge function (minimized in the audit
 * log). It is never sent to analytics — only coarse enums are tracked.
 */
import { useCallback, useRef, useState } from 'react';

import { consentAllowsSupport } from '@/features/reassure/domain/supportConsent';
import type { RouteResult, SupportResponse } from '@/features/reassure/domain/types';
import { canUseAiSupport } from '@/lib/proGates';
import { supabase } from '@/lib/supabase';
import { useAnalytics } from '@/lib/useAnalytics';
import { useAuth } from '@/state/AuthProvider';
import { usePro } from '@/state/ProProvider';

import { useAiSupportConsent } from './useAiSupportConsent';

// Client wait-cap. Exceeds the function's 8s server-side LLM timeout so a
// slow-but-successful reply is never dropped; a cap-hit degrades to the local line.
const FETCH_TIMEOUT_MS = 12_000;

/**
 * The UI phase for the current support interaction:
 *   - 'idle'     — no support ask active.
 *   - 'consent'  — eligible but undecided; the one-time consent card is shown.
 *   - 'loading'  — the companion reply is being written.
 *   - 'reply'    — an AI reply is showing.
 *   - 'fallback' — the local, non-AI support line (declined / not Pro / no reply).
 *   - 'redirect' — the server's safety gates returned a redirect to render instead.
 */
export type SupportPhase = 'idle' | 'consent' | 'loading' | 'reply' | 'fallback' | 'redirect';

export type SupportState = {
  phase: SupportPhase;
  /** the AI reply, for phase 'reply'. */
  reply: string | null;
  /** the server-decided safety redirect, for phase 'redirect'. */
  redirect: RouteResult | null;
};

const IDLE: SupportState = { phase: 'idle', reply: null, redirect: null };

async function fetchSupport(text: string): Promise<SupportResponse> {
  if (!supabase) return { kind: 'support', reply: null, source: 'fallback' };
  try {
    const raced = await Promise.race([
      supabase.functions
        .invoke<SupportResponse>('reassure-support', { body: { text } })
        .then((r) => ({ timedOut: false as const, r })),
      new Promise<{ timedOut: true }>((resolve) => {
        setTimeout(() => resolve({ timedOut: true }), FETCH_TIMEOUT_MS);
      }),
    ]);
    if (raced.timedOut) return { kind: 'support', reply: null, source: 'fallback' };
    if (raced.r.error || !raced.r.data) return { kind: 'support', reply: null, source: 'fallback' };
    return raced.r.data;
  } catch {
    return { kind: 'support', reply: null, source: 'fallback' };
  }
}

/** Map a server safety verdict to the RouteResult the screen renders. */
function redirectFor(kind: 'triage' | 'crisis' | 'medical' | 'oos'): RouteResult {
  switch (kind) {
    case 'triage':
      return { kind: 'triage' };
    case 'crisis':
      return { kind: 'crisis' };
    default:
      // 'medical' has no curated topic → the pediatrician decline; 'oos' stays oos.
      return { kind: 'oos' };
  }
}

export type UseReassureSupport = {
  state: SupportState;
  /** Trigger a support interaction for an ask already routed to { kind:'support' }. */
  request: (text: string) => void;
  /** True while the one-time consent card should be shown. */
  needsConsent: boolean;
  /** Grant consent and, if a request was parked, send it now. */
  grantConsent: () => void;
  /** Decline consent; the local support line stays. */
  declineConsent: () => void;
  /** Clear the interaction (dismiss, or a new non-support ask). */
  reset: () => void;
};

export function useReassureSupport(): UseReassureSupport {
  const { session } = useAuth();
  const { isPro } = usePro();
  const consent = useAiSupportConsent();
  const track = useAnalytics();

  const [state, setState] = useState<SupportState>(IDLE);
  // Monotonic id so a stale in-flight reply can never overwrite a newer ask.
  const reqIdRef = useRef(0);
  // Text parked while the one-time consent card is up, sent on grant.
  const pendingTextRef = useRef<string | null>(null);

  const signedIn = session != null;
  const aiEligible = supabase != null && signedIn && canUseAiSupport(isPro);
  const consentGranted = consentAllowsSupport(consent.status);

  const run = useCallback(
    (text: string) => {
      const id = ++reqIdRef.current;
      setState({ phase: 'loading', reply: null, redirect: null });
      void fetchSupport(text).then((res) => {
        if (reqIdRef.current !== id) return; // superseded by a newer ask
        if (res.kind === 'support') {
          if (res.reply != null && res.reply.trim().length > 0) {
            setState({ phase: 'reply', reply: res.reply, redirect: null });
            track('reassure_support_shown', { source: 'llm' });
          } else {
            setState({ phase: 'fallback', reply: null, redirect: null });
            track('reassure_support_shown', { source: 'fallback' });
          }
          return;
        }
        // The server's own safety gates fired — render the redirect, not a reply.
        setState({ phase: 'redirect', reply: null, redirect: redirectFor(res.kind) });
        if (res.kind === 'crisis') track('reassure_crisis_shown');
        else track('reassure_support_shown', { source: 'redirect' });
      });
    },
    [track],
  );

  const request = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      reqIdRef.current++; // invalidate any in-flight reply
      track('reassure_support_requested');
      if (!aiEligible) {
        // Not signed in / not Pro → the local, non-AI support line. No paywall wall.
        pendingTextRef.current = null;
        setState({ phase: 'fallback', reply: null, redirect: null });
        return;
      }
      if (!consentGranted) {
        // First time: park the text and show the one-time consent card. The edge
        // function is NOT called until consent is explicitly granted.
        pendingTextRef.current = trimmed;
        setState({ phase: 'consent', reply: null, redirect: null });
        return;
      }
      pendingTextRef.current = null;
      run(trimmed);
    },
    [aiEligible, consentGranted, run, track],
  );

  const grantConsent = useCallback(() => {
    consent.grant();
    const pending = pendingTextRef.current;
    pendingTextRef.current = null;
    if (pending != null) run(pending);
  }, [consent, run]);

  const declineConsent = useCallback(() => {
    consent.decline();
    pendingTextRef.current = null;
    setState({ phase: 'fallback', reply: null, redirect: null });
  }, [consent]);

  const reset = useCallback(() => {
    reqIdRef.current++;
    pendingTextRef.current = null;
    setState(IDLE);
  }, []);

  return {
    state,
    request,
    needsConsent: state.phase === 'consent',
    grantConsent,
    declineConsent,
    reset,
  };
}
