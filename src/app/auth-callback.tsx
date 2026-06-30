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

export default function AuthCallbackScreen() {
  // The full deep link that opened/resumed the app — includes the fragment, which
  // expo-router strips for routing but the implicit-flow tokens live in.
  const url = Linking.useURL();
  const [phase, setPhase] = useState<'working' | 'error'>('working');
  // One-shot guard: a single-use PKCE code must never be exchanged twice across
  // effect re-runs (useURL settling from null → the real URL).
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    let active = true;
    void (async () => {
      // Prefer the live link; fall back to the cold-start launch URL.
      const incoming = url ?? (await Linking.getInitialURL().catch(() => null));
      if (!active) return;

      const client = supabase;
      // Unconfigured build (no Supabase): there is nothing to exchange — just
      // leave the interstitial and let AuthGate render the local app.
      if (!client) {
        handled.current = true;
        router.replace('/');
        return;
      }

      // A racing handler — the WebBrowser auth session in startGoogleOAuth, or
      // AuthProvider's link listener — may already have established the session.
      // That is success: go straight into the app.
      const existing = await client.auth.getSession().catch(() => null);
      if (!active) return;
      if (existing?.data.session != null) {
        handled.current = true;
        router.replace('/');
        return;
      }

      const redirect = parseAuthRedirect(incoming);
      if (redirect == null) {
        // The URL hasn't been delivered yet → wait for useURL to provide it (the
        // effect re-runs when `url` changes). A present-but-credential-less URL
        // can't be completed here, so surface the calm error.
        if (incoming == null) return;
        if (active) setPhase('error');
        return;
      }

      handled.current = true;
      const result = await completeAuthRedirect(client, redirect);
      if (!active) return;

      // The PKCE code is single-use: if a racer exchanged it first, our call
      // returns an error even though sign-in actually succeeded — so trust a
      // now-present session over the exchange result.
      const after = await client.auth.getSession().catch(() => null);
      if (!active) return;
      if (result.ok || after?.data.session != null) {
        router.replace('/');
      } else {
        setPhase('error');
      }
    })();
    return () => {
      active = false;
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
        <View style={{ alignSelf: 'stretch' }}>
          <AuthButton label="Back to sign in" onPress={() => router.replace('/')} />
        </View>
      </View>
    );
  }

  return <AuthLoading />;
}
