/**
 * /auth-callback — the Expo Router screen that completes an auth deep link.
 *
 * Supabase sends the caregiver back to `lullaby://auth-callback` after Google
 * OAuth (and after password-reset / email-confirmation emails). The interactive
 * Google flow normally captures that redirect INSIDE its WebBrowser auth session
 * (`startGoogleOAuth`), but on some Android setups the browser fires the redirect
 * as a fresh deep link instead — which Expo Router renders as the built-in
 * "Unmatched Route" screen when no route matches `auth-callback`. This file IS
 * that route.
 *
 * Design contract (the fix for the false "Could not finish signing in" flash):
 *   - Success is detected by the SESSION appearing — from THIS route's exchange,
 *     from the in-browser `startGoogleOAuth` exchange, or from any onAuthStateChange
 *     emit — never by a single exchange call's return value. Whichever exchanger
 *     wins the single-use PKCE code, we route into the app.
 *   - An EMPTY / credential-less callback is NOT a failure. Android routinely
 *     delivers a stale or bare `lullaby://auth-callback` (the original launch URL,
 *     a duplicate redirect) before — or instead of — the real `?code=…` one. On an
 *     empty callback the screen keeps the calm "Finishing sign-in…" state and waits
 *     for the real URL / the session, rather than declaring "Missing code".
 *   - Only a real provider `?error=…`, or the hard timeout with a confirmed
 *     no-session, lands on the recoverable error surface. A later SIGNED_IN always
 *     wins over an earlier empty callback because empty never settles the screen.
 *
 * It adds NO new auth logic and writes NO local storage: it only drives the
 * shared, idempotent exchange against the `supabase` singleton, then hands off to
 * AuthGate (inside the (tabs) group) to choose the post-sign-in surface. Local
 * baby/log data is never read or cleared here, so the local-first guarantee is
 * untouched. Email/password sign-in and "Continue locally" are unaffected — those
 * never route through here.
 */
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { AuthButton, AuthLink } from '@/components/auth/AuthShell';
import { AuthTransition } from '@/components/auth/AuthTransition';
import { exchangeAuthCallback, parseAuthCallbackUrl } from '@/lib/authLinking';
import { authDebug, authError } from '@/lib/authLogger';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';

/**
 * Hard ceiling on the whole callback. If the deep link never delivers usable
 * credentials AND no session ever lands (offline, a genuinely failed sign-in),
 * the screen flips to a recoverable error instead of spinning forever. This is
 * the ONLY path to the error surface for an empty callback — an empty URL alone
 * is never treated as fatal.
 */
const CALLBACK_TIMEOUT_MS = 15_000;

/** How long to keep polling getSession after firing an exchange (10 × 300ms = 3s). */
const SESSION_POLL_ATTEMPTS = 10;
const SESSION_POLL_INTERVAL_MS = 300;

export default function AuthCallbackScreen() {
  // The full deep link that opened/resumed the app — includes the fragment, which
  // expo-router strips for routing but any implicit-flow tokens live in. Re-runs
  // the effect when it changes, so a real `?code=…` arriving AFTER a stale empty
  // launch URL is picked up.
  const url = Linking.useURL();
  const [phase, setPhase] = useState<'working' | 'error'>('working');
  // Dev-only failure reason, shown under the calm copy in __DEV__ so a tester can
  // see WHY (provider error / exchange failed / timeout) without reading logs.
  // Always null in production builds, so the user only ever sees the calm message.
  const [devReason, setDevReason] = useState<string | null>(null);
  // One-shot TERMINAL guard. Only a success, a real provider error, or the timeout
  // settles it — an empty callback deliberately does NOT, so a later SIGNED_IN can
  // still win. Whichever terminal path lands first wins; the rest are no-ops.
  const settled = useRef(false);

  useEffect(() => {
    let active = true;

    const succeed = () => {
      if (!active || settled.current) return;
      settled.current = true;
      // Normal, expected breadcrumb (silent by default; never a LogBox warning).
      authDebug('auth-callback: session resolved → routing home');
      // Hand off to AuthGate, which routes by status — straight to baby setup
      // (signed-in, no baby) or Tonight (signed-in + baby), never the intro.
      router.replace('/');
    };

    const fail = (reason: string) => {
      if (!active || settled.current) return;
      settled.current = true;
      // A terminal failure that blocks the user (provider error, exchange failed
      // with no session, or the hard timeout) — a real error, so it surfaces.
      authError(`auth-callback: ${reason}`);
      if (__DEV__) setDevReason(reason);
      setPhase('error');
    };

    const client = supabase;

    // Treat a session landing from ANY exchanger as success — this route's own
    // exchange OR the in-browser startGoogleOAuth path OR a refresh. The watcher
    // stays armed for the whole callback (it is only torn down on unmount / a new
    // URL), so a session that lands AFTER an empty callback still routes us in.
    const authSub = client
      ? client.auth.onAuthStateChange((_event, session) => {
          if (session != null) succeed();
        }).data.subscription
      : null;

    // Safety net: nothing may keep the user on the spinner past the deadline. On
    // expiry we re-check the session one last time before declaring failure.
    const timer = setTimeout(() => {
      void (async () => {
        const after = await client?.auth.getSession().catch(() => null);
        if (after?.data.session != null) succeed();
        else fail('timed out completing sign-in');
      })();
    }, CALLBACK_TIMEOUT_MS);

    void (async () => {
      // Prefer the live link; fall back to the cold-start launch URL.
      const incoming = url ?? (await Linking.getInitialURL().catch(() => null));
      if (!active || settled.current) return;

      // Unconfigured build (no Supabase): there is nothing to exchange — just
      // leave the interstitial and let AuthGate render the local app.
      if (!client) {
        succeed();
        return;
      }

      // Already signed in (session present at mount) → straight in.
      const existing = await client.auth.getSession().catch(() => null);
      if (!active || settled.current) return;
      if (existing?.data.session != null) {
        succeed();
        return;
      }

      const cb = parseAuthCallbackUrl(incoming);
      // Normal, expected breadcrumb — type only, never the URL/code/tokens. Silent
      // unless EXPO_PUBLIC_AUTH_DEBUG=1; never a LogBox warning.
      authDebug(`auth-callback: received type=${cb.type}`);

      if (cb.type === 'oauth_error') {
        // A real provider error (?error=access_denied, …) is the one genuinely
        // fatal callback — surface the calm retry immediately.
        fail(`OAuth provider returned ${cb.error}`);
        return;
      }

      if (cb.type === 'empty') {
        // NOT a failure. A bare / stale / duplicate callback with no credentials:
        // keep "Finishing sign-in…" and wait for the real URL (this effect re-runs
        // when `url` changes), the in-browser exchange's session (the watcher
        // above), or — worst case — the timeout. Never "Missing code" here. A
        // normal, expected state → authDebug (silent by default, never a LogBox warning).
        authDebug('auth-callback: empty callback — awaiting the real redirect / session');
        return;
      }

      // code | tokens → drive the shared, idempotent exchange. Do NOT decide on its
      // return value alone: the onAuthStateChange watcher and the poll below catch a
      // session that lands slightly later (or via the racing in-browser exchanger),
      // so success is detected by the SESSION appearing.
      const result = await exchangeAuthCallback(client, cb);
      if (!active || settled.current) return;

      // Poll for the session within the grace window before declaring failure.
      for (let i = 0; i < SESSION_POLL_ATTEMPTS && active && !settled.current; i += 1) {
        const after = await client.auth.getSession().catch(() => null);
        if (!active || settled.current) return;
        if (after?.data.session != null) {
          succeed();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, SESSION_POLL_INTERVAL_MS));
      }

      // No session after the grace window. Don't settle yet if the exchange itself
      // succeeded — a slow onAuthStateChange may still deliver the session before
      // the hard timeout; only a confirmed exchange FAILURE is terminal here.
      if (!result.ok) {
        fail(`Supabase exchange failed: ${result.error ?? 'unknown'}`);
      } else {
        // Expected transient state — the session may still arrive via
        // onAuthStateChange before the timeout. Not a problem → authDebug.
        authDebug('auth-callback: exchange ok but no session yet — awaiting onAuthStateChange / timeout');
      }
    })();

    return () => {
      active = false;
      clearTimeout(timer);
      authSub?.unsubscribe();
    };
  }, [url]);

  if (phase === 'error') {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.cream,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
          gap: 18,
        }}>
        <Text
          style={{ fontFamily: fonts.display, fontSize: 22, color: colors.ink, textAlign: 'center' }}>
          Could not finish signing in
        </Text>
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: 14,
            lineHeight: 20,
            color: colors.inkSoft,
            textAlign: 'center',
          }}>
          That sign-in did not complete. You can try again — your baby and logs on this phone are
          safe either way.
        </Text>
        {/* Dev-only: the exact reason, so a tester can act without reading logs.
            Never rendered in production (devReason stays null there). */}
        {__DEV__ && devReason != null && (
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 12,
              lineHeight: 16,
              color: colors.inkFaint,
              textAlign: 'center',
            }}>
            {`dev: ${devReason}`}
          </Text>
        )}
        <View style={{ alignSelf: 'stretch', gap: 10 }}>
          {/* Both land on the account-entry surface, which offers the Google retry
              AND the "Continue locally" escape hatch — never a dead end. */}
          <AuthButton label="Try again" onPress={() => router.replace('/')} />
          <AuthLink
            label="Continue without an account"
            tone="quiet"
            onPress={() => router.replace('/')}
          />
        </View>
      </View>
    );
  }

  // Working: the shared branded transition (logo + quiet spinner) with an explicit
  // "Finishing sign-in…" label, so the OAuth round-trip reads as calm progress and
  // is visually identical to AuthGate's post-auth transition — no jump between the
  // callback screen and the app resolving the session.
  return <AuthTransition message="Finishing sign-in…" />;
}
