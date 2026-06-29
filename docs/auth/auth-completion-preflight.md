# Auth Completion — Integration Preflight Audit (Step 01)

> **Type:** Read-only audit. No product code changed by this step.
> **Worktree:** `/home/dimash/lullaby-auth-completion-workflow`
> **Branch:** `feat/auth-completion-autoworkflow` (= `main` + merged `feat/auth-autoworkflow`
> + merged `feat/onboarding-personalized-activation`).
> **Source of truth:** `docs/plans/authentication-implementation-plan.md` (background intent).
> **Checks at audit time:** `expo lint` ✓ · `check:local-interactions` ✓ (199/199) ·
> `tsc --noEmit` ✗ (one **pre-existing, auth-unrelated** error — see §6).

This note records the *post-merge* state of the combined onboarding + auth foundation so steps
02–08 start from reality, not from the pre-merge plan (which was audited on a different branch,
`plan/auth-implementation-plan @ 53bc23a`). The headline: **the auth foundation is materially more
complete than the plan's "gaps" list implies** — Phase 1 (secure storage + session lifecycle) is
already done, and onboarding is already wired to the auth layer. The remaining work is the
user-facing surface (reset / social / deletion), guest-in-configured-build, and local→account
migration.

---

## 1. Current auth architecture (what exists today)

| Area | File(s) | State |
|---|---|---|
| Auth state machine | `src/state/AuthProvider.tsx` | `status: loading \| local-only \| signed-out \| needs-setup \| ready`. Exposes `signIn` / `signUp` / `signOut`, `completeSetup`, `joinWithInvite`, `createLocalBaby`, plus `session`/`caregiver`/`baby`/`caregivers`/`pendingMessage`/`busy`/`errorMessage`. |
| Route gate | `src/components/auth/AuthGate.tsx` | Switches on `status`; wraps **every** branch in `OnboardingGate`. App children (`LocalEventProvider`) mount only in `local-only` or `ready`. |
| Provider wiring | `src/app/(tabs)/_layout.tsx` | `AuthProvider → AuthGate → LocalEventProvider → LoggingProvider → Tabs`. `ThemeProvider` sits **above** in `src/app/_layout.tsx` and stays independent (splash waits on theme `hydrated`). |
| Auth/setup UI | `src/components/auth/{AuthScreen,AuthShell,BabySetupScreen,AccountSheet,InviteCaregiverSheet,RolePicker,AuthLoading}.tsx` | Email+password sign-in/up; create-baby **or** join-by-invite; account sheet (identity + invite + sign-out); invite-code minting/sharing. |
| Supabase client | `src/lib/supabase.ts` | Built only when **both** `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set; else `null` (local-only). `autoRefreshToken`, `persistSession`, `detectSessionInUrl:false`. |
| Secure session store | `src/lib/secureSessionStore.ts`, `src/lib/chunkedSessionStorage.ts` | **Done.** Chunked (`CHUNK_SIZE=1800` + count manifest) `expo-secure-store` adapter passed as `auth.storage`; AsyncStorage fallback on web/dev; fault-tolerant reads (partial/corrupt → `null`). Covered by smoke checks `SS1–SS7`. |
| Sync layer | `src/sync/{index,session,provisioning,resolveRepository,localRepository,supabaseRepository,invites,schema,eventChanges,types}.ts` | `EventRepository` boundary; Supabase repo does per-event upsert/delete + realtime; `resolveRepository` falls back to local unless `configured + session + linkedBaby`. |
| Backend schema | `supabase/migrations/2026061800000{1..6}_*.sql` | `profiles`, `babies`, `baby_caregivers`, `events`, realtime + shared profiles, `baby_invites`. RLS via `is_baby_caregiver()`; `SECURITY DEFINER` `validate_invite` / `accept_invite`. Provider/runbook in `supabase/README.md`. |

**Routes:** there are **no dedicated auth routes**. The route tree is `src/app/_layout.tsx` →
`(tabs)/_layout.tsx` → `index|insights|log|reassure`. Auth is **provider/gate-driven**, rendered
*inside* the tabs layout, not as separate screens. `AccountSheet` opens from the Tonight header
**only in `syncMode === 'supabase'`** (`src/app/(tabs)/index.tsx:278`).

---

## 2. Onboarding completion flow (confirmed, READ-ONLY)

- `OnboardingGate` (`src/components/onboarding/OnboardingGate.tsx`) reads the completion flag and
  renders `OnboardingScreen` until complete, then renders children. It wraps **all** auth branches,
  so first-run onboarding runs once, globally, before the app/auth surface.
- **Completion flag key is `lullaby.onboarding.v2.complete`** (`onboardingStorage.ts:8`) — value
  `'true'`. Dev override: `EXPO_PUBLIC_FORCE_ONBOARDING` (dev-only, `'true'`/`'1'`).
  ⚠️ **Discrepancy:** the step brief and the auth plan (§2.2) both say `…v1.complete`. The onboarding
  worktree bumped **v1 → v2** (roadmap §11); the old v1 key is orphaned in storage (harmless). The
  guardrail's *intent* (don't change the key / don't break completion) still holds — only the literal
  key string in the brief is stale. **Use `…v2.complete`.**
- The live flow is `beat → baby → focus → nightShift → nightReassurance → creating → done`
  (`OnboardingScreen.tsx`, driven by `useOnboardingFlow`). It is **step-state driven, not scroll-index**.

## 3. Local baby profile flow (confirmed, READ-ONLY)

- `src/data/localBaby.ts` — pure factory `createLocalBaby(input, now)` → `{ baby, caregiver }` with
  fixed ids `local-baby` / `local-caregiver` (distinct from the seed `baby-mia` / `cg-mom`), plus
  `birthDateFromWeeks` / `parseWeeks`. Persisted key `LOCAL_BABY_STORAGE_KEY = 'lullaby/local-baby/v1'`.
- **Onboarding already integrates with the auth layer:** on the `creating` step,
  `OnboardingScreen` calls `useAuth().createLocalBaby(input)` then the gate's `onComplete`
  (`OnboardingScreen.tsx:689,729`), with the §11 ordering *write local baby → clear seed night
  (`lullaby/local-events/v1`) → mark complete → reveal*. Once-guarded; both writes are best-effort.
- `AuthProvider` (local-only branch) seeds Mia/Mom as a fallback, rehydrates the persisted local baby
  on cold launch, and owns `createLocalBaby` (sets state → persists → clears seed night).
  Configured (Supabase) builds resolve identity via `evaluate()` instead.

---

## 4. Delta vs. the plan — already DONE (do not re-do / do not "fix")

The plan (audited pre-merge) lists these as open; in **this** worktree they are resolved:

1. **Secure token storage (plan Phase 1)** — done (`secureSessionStore.ts` wired as `auth.storage`).
   Tokens go to Keychain/Keystore, not AsyncStorage.
2. **AppState session refresh (plan Phase 1)** — done. `AuthProvider` starts/stops
   `auth.startAutoRefresh()` off `AppState`, primed on mount when already foregrounded
   (`AuthProvider.tsx:202–220`). No `setState` in that effect (React-Compiler-safe).
3. **Onboarding ↔ account "ownership overlap" (plan Phase 4 open question)** — partly resolved in the
   local path: onboarding owns the **local** baby via `createLocalBaby`. (The *configured* path still
   double-collects — see §5.4.)
4. **Sign-out data hygiene (plan gap #9)** — **resolved by an explicit, opposite decision**:
   `signOut` deliberately **preserves** `lullaby/local-events/v1`, `lullaby/local-baby/v1`,
   `lullaby/logging-v2/v1` (those only ever hold guest/local data; the signed-in night persists to
   Supabase, never to those keys). `supabase.auth.signOut()` already clears the session + every
   SecureStore chunk (`SS7`). **Do not add a local-cache wipe on sign-out** — it would destroy guest
   data for no hygiene benefit. See the rationale block at `AuthProvider.tsx:365–391`.

---

## 5. Concrete gaps remaining (candidates for steps 02–08)

Evidence-backed against the current tree. Maps to the plan's later phases.

1. **No password reset** — `resetPasswordForEmail` absent everywhere. (`AuthScreen` has no
   "forgot password"; no `ForgotPasswordScreen`.) → plan Phase 3.
2. **Social sign-in — Apple done (Step 06), Google pending.** Apple is now app-side prepared:
   `AuthProvider.signInWithApple()` → `signInWithIdToken({ provider: 'apple' })`, an **iOS-only**
   `AppleSignInButton` on the account-entry surface (null on Android/web), `expo-apple-authentication`
   installed, and `app.json` `ios.usesAppleSignIn` + the config plugin. Manual Apple Developer +
   Supabase provider setup is documented in `supabase/README.md` (no native credentials in repo).
   **Google is still absent** (`expo-auth-session` / Google sign-in not installed). → plan Phase 3.
3. **No account deletion** — no `deleteAccount` in code and **no `supabase/functions/`** (the planned
   `delete-account` Edge Function). App Store requires this once accounts exist. → plan Phase 3.
4. **Guest is walled in configured builds** — `AuthGate` routes `signed-out → AuthScreen` (a sign-in
   wall), not "app-on-local + upgrade affordance". There is **no "Continue locally"** path or sign-in
   entry point for a guest in a configured build (`AccountSheet` only mounts in `ready`). This is the
   direct subject of the "NEVER force account creation" guardrail. → plan Phase 4.
5. **No local→account migration** — `resolveRepository` swaps local→Supabase on sign-in; the guest
   night is **abandoned** (no `migrateLocalToAccount.ts`, no migration hook/flag in `AuthProvider`).
   → plan Phase 5.
6. **No deep-link handler** — `detectSessionInUrl:false`, no `src/lib/authLinking.ts`; the
   email-confirmation path tells the user to "confirm then sign in" manually (no `lullaby://` exchange
   of confirmation/reset/OAuth redirects). Needed if email-confirmation or OAuth is enabled. → plan Phase 2.
7. **Configured-build setup double-collects baby details** — a signed-up user passes through
   onboarding (age/name → local baby) **and** `BabySetupScreen` (name/role/baby name/weeks again).
   Reconcile *without editing onboarding files*. → plan Phase 4.
8. **No auth test infra** — only the pure `check:local-interactions` smoke runner (no Jest, no
   component/integration/navigation/persistence tests). → plan Phase 7.
9. **No `typecheck` script** — `package.json` has `lint` + `check:local-interactions` only; `tsc` is
   manual and ungated (see §6). → plan Phase 1 leftover.

Out of scope for this milestone (do **not** start): CareEvent/Logging-v2 backend & cloud sync
(plan Phase 6), caregiver invitations backend beyond what exists, family/household schema.

---

## 6. Checks run (Step 01)

| Check | Command | Result |
|---|---|---|
| Status | `git status --short` | clean (before this note) |
| Lint | `npm run lint` (`expo lint`) | ✓ pass |
| Typecheck | `npx tsc --noEmit` | ✗ **1 error — pre-existing, auth-unrelated** |
| Smoke | `npm run check:local-interactions` | ✓ 199/199 |

**The single `tsc` error:**
`src/components/boot/BrandSplashGate.tsx:17:42 — TS2339: Property 'context' does not exist on type
'NodeRequire'.` Cause: the file uses Metro's `require.context(...)` but the repo ships only
`nativewind-env.d.ts` and **no `expo-env.d.ts`**, so TS doesn't know that global. It reproduces on
`HEAD` with no local changes, is unrelated to auth, and `tsc` is not CI-gated. **Left as-is** (Step 01
forbids product changes). Fix when Phase 1 adds the `typecheck` script (generate/commit
`expo-env.d.ts`, or add a minimal `require.context` declaration) so `tsc` can become a real gate.

---

## 7. Manual provider / dashboard setup still required (not code)

Documented (not fabricated) per guardrails — none of this is done in the repo:

- **Supabase project (Email):** create project, apply `supabase/migrations/*` in filename order,
  enable the **Email** auth provider, choose **Confirm email on/off**, set `EXPO_PUBLIC_SUPABASE_URL`
  + `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env`. (See `supabase/README.md`.) Email-confirmation = on
  ⟹ a deep-link confirmation handler is required (gap #6).
- **Apple Sign in (app-side done — Step 06; dashboards still required):** enable the **Sign In with
  Apple** capability on the `com.lullaby.app` App ID, and enable the Apple provider in Supabase with
  `com.lullaby.app` in Client IDs. Native-only iOS needs **no** Services ID / signing key. Full
  runbook + build/runtime notes in `supabase/README.md`. (`usesAppleSignIn` + plugin already in
  `app.json`; `AuthProvider.signInWithApple` already wired.)
- **Google Sign in (future Phase 3):** Google Cloud OAuth client(s), enable Google provider in
  Supabase, dev-client build (native module — not Expo Go), redirect `lullaby://`.
- **Account deletion (future Phase 3):** a Supabase **Edge Function** with the service-role key
  (`auth.admin.deleteUser` + cascade). Never ship the service-role key in the client.

---

## 8. Guardrails to carry into steps 02–08

- Preserve local-first/guest. **"Continue locally" must remain** — never force account creation.
- **Do not edit `src/components/onboarding/*`**; integrate only at `AuthProvider`/`AuthGate`. Do not
  change onboarding storage keys or the completion flag (now **`lullaby.onboarding.v2.complete`**).
- Keep `ThemeProvider` above `AuthProvider`; preserve circular-reveal ordering and splash timing.
- TS strict; React Compiler ON — no synchronous `setState` in `useEffect` (latch with a lazy
  `useState` initializer; async-callback `setState` is fine).
- Gate Apple sign-in to iOS; don't break Android/web. No Supabase migrations unless a safe, already
  established pattern exists; never run production migrations. Do not push.
