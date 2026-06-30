# Supabase setup for local auth testing (via Supabase MCP)

This documents the Supabase-side setup done to test authentication locally, what
was done automatically through the **Supabase MCP server**, and the exact
**manual dashboard steps** that MCP cannot perform.

> Scope: a clean **development/test** project only. Production data is untouched.

## Project

A dedicated dev project was created (the production `lullaby` project holds the
landing-page **waitlist** + an unrelated analytics `events` table, and is **not**
used here — applying the app migrations there would collide with that `events`
table).

| | |
| --- | --- |
| **Project name** | `lullaby-dev` |
| **Project ref** | `xhyziuvgglsrdaakpmui` |
| **Region** | `ap-northeast-1` |
| **API URL** | `https://xhyziuvgglsrdaakpmui.supabase.co` |
| **Cost** | $0 / month (free tier) |

The URL + anon key live in a local, **git-ignored** `.env` (see `.env.example`
for the template). The anon key is a public client identifier; no service-role
secret is stored in the repo.

## What the MCP server did automatically

- **Created** the `lullaby-dev` project (free tier, $0).
- **Applied all 6 repo migrations** in `supabase/migrations/` (in filename
  order), creating `profiles`, `babies`, `baby_caregivers`, `events`,
  `baby_invites`, the `is_baby_caregiver` / `shares_any_baby` RLS helpers, the
  `validate_invite` / `accept_invite` invite RPCs, realtime on `events`, and the
  shared-profile policy. **RLS is enabled on every table.**
- **Read** the project URL + anon/publishable keys used to fill `.env`.

### Verification (all green)

- `list_tables` → `profiles`, `babies`, `baby_caregivers`, `events`,
  `baby_invites`, all with `rls_enabled: true`.
- `GET /auth/v1/settings` (read-only) → `email: true`, `disable_signup: false`
  → **Email provider is enabled**, so email/password signup + login work now.
- `get_advisors (security)` → only `WARN`s for the `SECURITY DEFINER`
  functions, which are **intentional** (they back the RLS policies and the
  invite RPCs, exactly as written in the repo migrations). No action needed.
- Repo checks: `npm run check:local-interactions` (218 ✓), `npm run lint` (✓),
  `npx tsc --noEmit` (✓).

## What MCP CANNOT do — manual dashboard steps

The Supabase MCP server exposes **no tool** to change Auth provider settings,
the email-confirmation toggle, or the redirect-URL allowlist. Do these by hand
in the dashboard for the **`lullaby-dev`** project
(https://supabase.com/dashboard/project/xhyziuvgglsrdaakpmui).

### 1. Email confirmation (recommended for smooth local testing)

Current state: **Confirm email is ON** (`mailer_autoconfirm: false`). Signup
works, but returns no session until the user confirms; the app handles this with
its calm "check your email, then sign in" fallback.

- For the smoothest first run, turn it **OFF**:
  **Authentication → Providers → Email → "Confirm email" = off**.
  Then signup returns a session immediately.

### 2. Redirect URL allowlist (needed for password reset / email-confirm / Google deep link)

- **Authentication → URL Configuration → Redirect URLs → add**
  `lullaby://auth-callback`
  (the exact value built by `getAuthRedirectUrl()` in `src/lib/authLinking.ts`).
- Note: `lullaby://…` deep links resolve in a **dev-client** (`npm run dev`) or a
  store build — **not** in Expo Go. Not required for email/password sign-in.

### 3. Google provider (browser OAuth) — optional

1. **Google Cloud Console → APIs & Services → Credentials → Create OAuth client
   ID → Web application.** Under **Authorized redirect URIs** add the Supabase
   callback: `https://xhyziuvgglsrdaakpmui.supabase.co/auth/v1/callback`.
   Configure the OAuth consent screen (scopes `email`, `profile`).
2. **Supabase → Authentication → Providers → Google → enable** and paste the
   **Web** client ID + client **secret**. (Secret stays server-side in Supabase.)
3. Ensure `lullaby://auth-callback` is in the redirect allowlist (step 2 above).
4. Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (the same Web client ID) in `.env` and
   restart the dev server. Until then the button is hidden and
   `signInWithGoogle` no-ops.

Current state from `/auth/v1/settings`: `google: false` (disabled).

### 4. Apple provider (native iOS) — optional

1. **Apple Developer → Identifiers →** open the App ID for `com.lullaby.app` and
   enable the **Sign In with Apple** capability.
2. **Supabase → Authentication → Providers → Apple → enable** and add the bundle
   id `com.lullaby.app` to **Client IDs**. For native-only iOS, the Services ID
   + signing key are **not** required. (If testing in Expo Go, also add
   `host.exp.Exponent`.)

Current state from `/auth/v1/settings`: `apple: false` (disabled).

## Ready to test now

With `.env` pointing at `lullaby-dev` and the migrations applied, **email +
password sign-up / sign-in works** against the dev project (sign-up needs email
confirmation until step 1 is toggled off). Baby setup, the shared night log,
realtime, and partner invites are all backed by the applied schema. Google /
Apple require the optional dashboard steps above.

See `supabase/README.md` for the full first-run flow and the two-phone demo
script.
