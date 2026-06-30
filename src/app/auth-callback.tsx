/**
 * /auth-callback — the Expo Router screen that completes an auth deep link.
 *
 * Supabase sends the caregiver back to `lullaby://auth-callback` after Google
 * OAuth (and after password-reset / email-confirmation emails). The interactive
 * Google flow normally captures that redirect INSIDE its WebBrowser auth session
 * (`startGoogleOAuth`), but on some Android setups the browser fires the redirect
 * as a fresh deep link instead — which Expo Router renders as the built-in
 * "Unmatched Route" screen when no route matches `auth-callback`. This file IS
 * that route: it reads the full incoming URL (query + fragment), completes the
 * Supabase session exchange through the SHARED redirect plumbing
 * (`parseAuthRedirect` → `completeAuthRedirect` — the very helpers the email
 * links use), shows a calm spinner while it works, and routes into the app.
 *
 * It adds NO new auth logic and writes NO local storage: it only drives the
 * existing exchange against the `supabase` singleton, then hands off to AuthGate
 * (inside the (tabs) group) to choose the post-sign-in surface. Local baby/log
 * data is never read or cleared here, so the local-first guarantee is untouched.
 * Email/password sign-in and "Continue locally" are unaffected — those never
 * route through here.
 */
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { AuthLoading } from '@/components/auth/AuthLoading';
import { AuthButton } from '@/components/auth/AuthShell';
import { completeAuthRedirect, parseAuthRedirect } from '@/lib/authLinking';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';

/**
 * Hard ceiling on the whole callback. If the deep link never delivers usable
 * credentials, or the Supabase token exchange stalls (offline, slow network),
 * the screen flips to a recoverable error instead of spinning forever — the
 * core fix for the "endless loading after choosing a Google account" report.
 */
const CALLBACK_TIMEOUT_MS = 15_000;

/** Dev-only diagnostic. Never logs the URL/code/tokens — only a short reason. */
function warnCallback(reason: string): void {
  if (__DEV__) console.warn(`[auth] auth-callback: ${reason}`);
}

export default function AuthCallbackScreen() {
  // The full deep link that opened/resumed the app — includes the fragment, which
  // expo-router strips for routing but any implicit-flow tokens live in.
  const url = Linking.useURL();
  const [phase, setPhase] = useState<'working' | 'error'>('working');
  // Dev-only failure reason, shown under the calm copy in __DEV__ so a tester can
  // see WHY (missing code / provider error / exchange failed) without reading logs.
  // Always null in production builds, so the user only ever sees the calm message.
  const [devReason, setDevReason] = useState<string | null>(null);
  // One-shot outcome guard: whichever path (success / error / timeout) lands
  // first wins, so a racing exchange or a late URL can't double-resolve.
  const settled = useRef(false);

  useEffect(() => {
    let active = true;

    const finish = (ok: boolean, reason?: string) => {
      if (!active || settled.current) return;
      settled.current = true;
      if (ok) {
        router.replace('/');
      } else {
        if (reason) {
          warnCallback(reason);
          if (__DEV__) setDevReason(reason);
        }
        setPhase('error');
      }
    };

    // Safety net: nothing may keep the user on the spinner past the deadline.
    const timer = setTimeout(() => finish(false, 'timed out completing sign-in'), CALLBACK_TIMEOUT_MS);

    void (async () => {
      // Prefer the live link; fall back to the cold-start launch URL.
      const incoming = url ?? (await Linking.getInitialURL().catch(() => null));
      if (!active || settled.current) return;

      const client = supabase;
      // Unconfigured build (no Supabase): there is nothing to exchange — just
      // leave the interstitial and let AuthGate render the local app.
      if (!client) {
        finish(true);
        return;
      }

      // A racing handler — the WebBrowser auth session in startGoogleOAuth, or
      // AuthProvider's link listener — may already have established the session.
      // That is success: go straight into the app.
      const existing = await client.auth.getSession().catch(() => null);
      if (!active || settled.current) return;
      if (existing?.data.session != null) {
        finish(true);
        return;
      }

      const redirect = parseAuthRedirect(incoming);
      if (redirect == null) {
        // The URL hasn't been delivered yet → wait for useURL to provide it (the
        // effect re-runs when `url` changes; the timeout backstops the worst case).
        // A present-but-credential-less URL can't be completed → calm error.
        if (incoming == null) return;
        warnCallback('callback URL had no recognizable auth params (hasCode=false hasAccessToken=false)');
        finish(false, 'Missing code in callback');
        return;
      }
      // Sanitized diagnostic — keys only, never the URL/code/tokens.
      warnCallback(
        `received hasCode=${redirect.code != null} hasAccessToken=${redirect.accessToken != null} error=${redirect.errorCode ?? 'none'}`,
      );
      if (redirect.kind === 'error') {
        finish(false, `OAuth provider returned ${redirect.errorCode ?? 'an error'}`);
        return;
      }

      const result = await completeAuthRedirect(client, redirect);
      if (!active || settled.current) return;

      // The PKCE code is single-use: if a racer exchanged it first, our call
      // returns an error even though sign-in actually succeeded — so trust a
      // now-present session over the exchange result, with a brief grace for an
      // in-flight racer to land the session before we declare failure.
      let after = await client.auth.getSession().catch(() => null);
      if (!result.ok && after?.data.session == null) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (!active || settled.current) return;
        after = await client.auth.getSession().catch(() => null);
      }
      if (!active || settled.current) return;
      if (result.ok || after?.data.session != null) {
        finish(true);
      } else {
        finish(false, `Supabase exchange failed: ${result.error ?? 'unknown'}`);
      }
    })();

    return () => {
      active = false;
      clearTimeout(timer);
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
          That sign-in link could not be completed. Head back and try again — your baby and logs on
          this phone are safe.
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
        <View style={{ alignSelf: 'stretch' }}>
          <AuthButton label="Back to sign in" onPress={() => router.replace('/')} />
        </View>
      </View>
    );
  }

  return <AuthLoading />;
}
