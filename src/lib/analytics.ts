/**
 * Analytics — a tiny, dependency-light event tracker for the TestFlight retention
 * test. Writes one row per event to the Supabase `analytics_events` table.
 *
 * Deliberately a no-op unless the build is Supabase-configured AND a user is
 * signed in: the local-only demo / dev build has no client and no auth user, so
 * `trackEvent` just logs in __DEV__ and returns. That keeps the demo untouched
 * and means real analytics only flow from the configured "retention" build —
 * exactly where they are useful. Fire-and-forget; an insert failure never throws
 * and never blocks the UI.
 *
 * Leaf module: this file must NOT import AuthProvider. AuthProvider imports
 * `trackEvent` from here, so importing it back formed the require cycle
 *   src/lib/analytics.ts → src/state/AuthProvider.tsx → src/lib/analytics.ts
 * The React hook that binds events to the signed-in identity lives in
 * `useAnalytics.ts` (the seam that depends on both); callers pass identity to
 * `trackEvent` explicitly, so this stays a pure, dependency-light service.
 */
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/** The closed set of events instrumented for the activation/retention funnel. */
export type AnalyticsEvent =
  | 'onboarding_completed'
  | 'baby_profile_created'
  | 'first_log_created'
  | 'sleep_log_created'
  | 'feed_log_created'
  | 'caregiver_invited'
  | 'caregiver_invite_accepted'
  | 'handoff_has_new_on_open'
  | 'insights_opened'
  | 'reached_4_data_days'
  | 'insights_recap_available'
  | 'upgrade_card_tapped'
  | 'export_tapped'
  // Pro Phase 2 — paywall entry points (no purchase/restore events yet; those
  // land with RevenueCat in a later phase). Props stay coarse: source / surface /
  // gate / mode only — never names, notes, volumes, or store/RevenueCat ids.
  | 'paywall_opened'
  | 'pro_gate_seen';

/** Small, serializable property bag stored in the row's `props` jsonb column. */
export type AnalyticsProps = Record<string, string | number | boolean | null>;

/** Who the event belongs to. Resolved from the auth state at the call site. */
export type AnalyticsIdentity = {
  userId: string | null;
  babyId: string | null;
  caregiverId: string | null;
};

/**
 * Record one analytics event. No-op (with a dev log) when there is no Supabase
 * client or no signed-in user, so the local demo and unit/dev runs never write.
 */
export function trackEvent(
  event: AnalyticsEvent,
  identity: AnalyticsIdentity,
  props: AnalyticsProps = {},
): void {
  if (!supabase || !identity.userId) {
    if (__DEV__) console.log('[analytics]', event, props);
    return;
  }

  void supabase
    .from('analytics_events')
    .insert({
      event,
      user_id: identity.userId,
      baby_id: identity.babyId,
      caregiver_id: identity.caregiverId,
      props,
      platform: Platform.OS,
    })
    .then(
      ({ error }) => {
        if (error && __DEV__) console.log('[analytics] insert failed', event, error.message);
      },
      () => {
        // Network/transport rejection — swallow; analytics is best-effort.
      },
    );
}
