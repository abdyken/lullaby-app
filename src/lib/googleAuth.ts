/**
 * Google sign-in configuration gate.
 *
 * Unlike Apple — whose *native* sign-in needs no app-side client ID, so it gates
 * on iOS + a configured Supabase client alone — Google's availability depends
 * entirely on operator dashboard setup the app cannot detect at runtime: the
 * Google provider must be enabled in Supabase with an OAuth client, and Google
 * Cloud must allow the Supabase callback. So the affordance is gated on a
 * build-time signal: the presence of the project's Google **web** OAuth client ID
 * in the env.
 *
 * `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is read via static `process.env` dot-notation
 * so Expo can inline it at build time
 * (https://docs.expo.dev/guides/environment-variables/). It is a PUBLIC OAuth
 * client identifier — never a secret. In the browser-OAuth flow this app uses, the
 * value itself is NOT transmitted by the client (Supabase holds the real client
 * id + secret server-side); its only roles here are (1) a presence gate that
 * hides the button + no-ops `signInWithGoogle()` when absent — never a dead button
 * — and (2) forward-compatibility with a future native `signInWithIdToken`
 * upgrade, which would consume this same web client ID.
 */
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

/** True only when a Google OAuth client ID is configured for this build. */
export const isGoogleSignInConfigured =
  typeof GOOGLE_WEB_CLIENT_ID === 'string' && GOOGLE_WEB_CLIENT_ID.length > 0;
