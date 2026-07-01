/**
 * useAnalytics — the React hook that binds `trackEvent` to the signed-in identity
 * (userId / babyId / caregiverId) resolved from AuthProvider.
 *
 * It lives here, NOT in `analytics.ts`, on purpose. `analytics.ts` is a pure leaf
 * service and must not import AuthProvider, because AuthProvider imports
 * `trackEvent` back — together they formed the require cycle
 *   src/lib/analytics.ts → src/state/AuthProvider.tsx → src/lib/analytics.ts
 * This module is the single seam that depends on both, so the leaf stays a leaf.
 * Everything privacy/fire-and-forget still lives in `trackEvent`; this only
 * supplies the current identity.
 */
import { useCallback, useMemo } from 'react';

import {
  trackEvent,
  type AnalyticsEvent,
  type AnalyticsIdentity,
  type AnalyticsProps,
} from '@/lib/analytics';
import { useAuth } from '@/state/AuthProvider';

/**
 * Returns a stable `track(event, props?)` bound to the current auth identity.
 * Safe to call from any screen/provider mounted under AuthProvider.
 */
export function useAnalytics(): (event: AnalyticsEvent, props?: AnalyticsProps) => void {
  const { session, baby, caregiver } = useAuth();
  const identity = useMemo<AnalyticsIdentity>(
    () => ({
      userId: session?.user.id ?? null,
      babyId: baby?.id ?? null,
      caregiverId: caregiver?.id ?? null,
    }),
    [session?.user.id, baby?.id, caregiver?.id],
  );

  return useCallback(
    (event: AnalyticsEvent, props?: AnalyticsProps) => trackEvent(event, identity, props),
    [identity],
  );
}
