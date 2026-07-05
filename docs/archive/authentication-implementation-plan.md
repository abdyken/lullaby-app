# Authentication Implementation Plan

> **Status:** Planning / audit only — no code changed by this document.
> **Scope of milestone 1:** complete & harden the auth that already exists; do **not** build the Logging-v2 backend yet.
> **Repo state audited:** branch `plan/auth-implementation-plan` @ `53bc23a` (worktree `/home/dimash/lullaby-auth-plan`).
> **Hard constraints:** do not modify `src/components/onboarding/*` (owned by the `feat/onboarding-personalized-activation`
> worktree); do not break the `ThemeProvider`/circular-reveal system; preserve the local-only fallback.

## Context — why this plan exists

The original request was framed as "add authentication from scratch." The audit found the opposite: a **substantial,
well-architected Supabase auth layer is already implemented and committed**. So this plan is not a greenfield build — it
is a **completion + hardening + productionization** plan that closes the real gaps without rewriting what works, and it
sequences the larger future work (a real backend for the canonical Logging-v2 data model) as an explicitly separate phase.

---

## 1. Executive Summary

Lullaby already ships a working, optional **Supabase** auth stack with a clean local-first fallback. The recommended path
is to **keep Supabase** and finish it, in safe increments, rather than re-pick a provider or rewrite.

The milestone-1 work is: move the session into **secure device storage**, add **password reset**, **account deletion**,
and **Sign in with Apple + Google**, make **guest → account upgrade** real (no silent data loss on sign-in), and stand up
an **auth test suite**. The canonical long-term data model is **Logging-v2 `CareEvent`**; until its backend exists, the
already-synced legacy `LogEvent`/Supabase path is treated as a **temporary compatibility bridge**, and a dedicated later
phase builds the real CareEvent backend (family/household + child ownership, `createdByUserId`, soft-delete, versioning,
migration, conflict handling).

**Primary recommendation: Supabase Auth (ratified — already implemented).**
**First safe step: Phase 1 — secure token storage + session hygiene** (no user-visible behavior change).

### 1.1 Recommended approach at a glance

| Decision | Recommendation |
|---|---|
| Provider | **Supabase** — already implemented; ratified below. Do not switch. |
| Auth methods | Email+password (keep) **+ Sign in with Apple + Google**. No magic link for now. |
| Token storage | Migrate Supabase session from **AsyncStorage → `expo-secure-store`** (chunked adapter). |
| Account model | **Local-first / guest preserved**; account is optional and unlocks sync/invites/family/backup. |
| Data on sign-in | **Migrate & link** local events to the account — never abandon them. |
| Canonical data model | **`CareEvent` (Logging v2)** long-term; legacy `LogEvent` sync is a temporary bridge. |
| v2 backend | A **dedicated later phase** (Phase 6) — not in milestone 1. |

### 1.2 Provider comparison (ratifying Supabase)

The provider decision is already made and built; this table records *why it is the right choice to keep* and why
switching is not recommended. Evaluated against this app's reality (Expo dev-client, RLS-based multi-caregiver sharing,
Postgres event log, optional/offline-first).

| Criterion | **Supabase (current)** | Firebase Auth | Clerk | Custom backend |
|---|---|---|---|---|
| **Pros** | Auth + Postgres + RLS + Realtime in one; already integrated; SQL ownership model fits `babies`/`caregivers`/`events`; open-source, self-hostable | Mature SDKs, generous free tier, easy social/phone, Google ecosystem | Best-in-class prebuilt RN auth UI, orgs/multi-tenant, MFA, sessions handled for you | Total control; no vendor lock-in |
| **Cons** | Must wire RN session refresh + secure storage yourself; Edge Functions needed for admin ops (e.g. delete user) | Auth and data split (Firestore ≠ relational); RLS-style sharing is awkward; a 2nd data plane next to Postgres | Adds a 3rd-party identity store separate from your Postgres rows; cost scales with MAU; another data-ownership boundary | Build/own everything (tokens, refresh, reset, social, security) — slowest, riskiest |
| **Expo / RN fit** | Good — works in dev-client (already used); needs SecureStore adapter + AppState refresh | Good (`@react-native-firebase` or JS SDK) | Good (`@clerk/clerk-expo`) | Manual |
| **Token/session storage** | JS SDK persists session; **you choose** the store → move to SecureStore | SDK-managed (Keychain/Keystore on native modules) | SDK-managed, secure by default | You implement secure storage |
| **Backend/DB impact** | **Already the source of truth** (Postgres + RLS migrations exist) | Would fork data between Firestore and any SQL needs | Identity in Clerk; app data still needs Postgres → two systems to reconcile | You design schema + APIs |
| **MVP speed** | **Fastest here — it's done** | Medium (re-integrate) | Fast for auth UI, slow to re-home existing rows | Slowest |
| **Long-term scale** | Strong (Postgres scales; RLS enforces sharing) | Strong but model-mismatch tax grows | Strong for identity; data still elsewhere | Depends on team |
| **Verdict** | **Keep & finish** | Switch not justified | Switch not justified | Not recommended |

**Recommendation:** ratify Supabase. The relational ownership model (a baby shared across caregivers via
`baby_caregivers` + RLS) is exactly what Lullaby needs, and re-homing identity into Firebase/Clerk would split the data
plane for no benefit. Invest the saved time in hardening (secure storage, account deletion via Edge Function, tests).

---

## 2. Current App Audit

**Stack:** Expo SDK `~56`, React Native `0.85.3`, React `19.2.3`, Expo Router `~56` (typed routes + React Compiler on),
TypeScript strict, NativeWind. Path alias `@/* → src/*`. Scheme **`lullaby://`**; iOS bundle id `com.bizhanash.lullaby`, Android package `com.lullaby.app`.

### 2.1 What already exists (auth)

| Area | File(s) | Notes |
|---|---|---|
| Auth state machine | `src/state/AuthProvider.tsx` | `status: loading \| local-only \| signed-out \| needs-setup \| ready`; `signIn/signUp/signOut`, `completeSetup`, `joinWithInvite`, `createLocalBaby`. |
| Route gate | `src/components/auth/AuthGate.tsx` | Switches on `status`, wraps everything in `OnboardingGate`. |
| Auth UI | `src/components/auth/{AuthScreen,AuthShell,BabySetupScreen,AccountSheet,InviteCaregiverSheet,RolePicker,AuthLoading}.tsx` | Email+password; create-baby or join-by-invite; sign-out sheet. |
| Provider wiring | `src/app/(tabs)/_layout.tsx` | `AuthProvider → AuthGate → LocalEventProvider → LoggingProvider → Tabs`. |
| Supabase client | `src/lib/supabase.ts` | Built only when both `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` set; **session in AsyncStorage**, `autoRefreshToken`, `detectSessionInUrl:false`. |
| Sync layer | `src/sync/{types,resolveRepository,localRepository,supabaseRepository,session,provisioning,invites,schema,eventChanges}.ts` | `EventRepository` boundary; Supabase repo does granular upserts/deletes + **realtime** (`postgres_changes`). |
| Backend schema | `supabase/migrations/2026061800000{1..6}_*.sql` | `profiles`, `babies`, `baby_caregivers`, `events`, realtime+shared profiles, `baby_invites`; **RLS** via `is_baby_caregiver(baby_id)`; idempotent `SECURITY DEFINER` setup. |
| Bootstrap/theme | `src/app/_layout.tsx`, `src/state/ThemeProvider.tsx` | Fonts + theme hydrate before splash hides; **ThemeProvider sits above AuthProvider** and must stay independent. |

### 2.2 Onboarding seam (do not modify these files)

- `src/components/onboarding/{OnboardingGate,OnboardingScreen,onboardingStorage,onboardingFlow,useOnboardingFlow,OnboardingStepLayout,onboardingContent}.tsx/.ts`
- Completion flag: AsyncStorage key **`lullaby.onboarding.v1.complete`**; dev override `EXPO_PUBLIC_FORCE_ONBOARDING`.
- `OnboardingGate` wraps app children inside every auth branch, so onboarding runs **before** the app/auth surface.
- **Auth must integrate at `AuthProvider`/`AuthGate`, never inside onboarding files.**

### 2.3 Data layer (two models — important)

- **Legacy MVP** — `src/data/*`, `LocalEventProvider`, `TonightState`/`LogEvent` (`type + start/end + meta` JSONB).
  AsyncStorage key `lullaby/local-events/v1`. **This is the model the Supabase `events` table + sync + realtime cover.**
- **Logging v2 (canonical)** — `src/features/logging/*`, `LoggingProvider`, `CareEvent` discriminated union
  (breastfeeding segments, `clientEventId`, `familyId`, `childId`, `createdByUserId`, `occurredAt/startedAt/endedAt`,
  `syncStatus`, `version`, soft-delete). AsyncStorage key `lullaby/logging-v2/v1`. Behind `EXPO_PUBLIC_LOGGING_V2`.
  **It has no backend:** `enqueueSync(eventId)` appends to a persisted `syncQueue: string[]` that **drains nowhere**
  (`src/features/logging/data/LoggingRepositoryImpl.ts`); migrations contain none of its columns.
- Active baby/caregiver identity lives on `AuthProvider` (local key `lullaby/local-baby/v1`), seeded to Mia/Mom.
- Active sessions (sleep/feed/pump) persist **timestamps only** and recompute elapsed from `now` — restart-safe.

### 2.4 Verification infrastructure (today)

- **No Jest/Vitest.** One pure-function smoke runner: `npm run check:local-interactions` (`tsx scripts/check-local-interactions.ts`).
- `npm run lint` = `expo lint` (flat config, `eslint-config-expo`). **No `typecheck` script** (`npx tsc --noEmit` manual).
- React Compiler is enabled → `expo lint` errors on **synchronous `setState` inside `useEffect`**; latch derived state
  with a lazy `useState` initializer (setState inside async callbacks is fine). New auth effects must follow this.

### 2.5 Confirmed gaps (evidence-backed)

1. Session token in **AsyncStorage** (plaintext) — `expo-secure-store` not installed.
2. **No password reset** (`resetPasswordForEmail` absent).
3. **No account deletion** — absent in code *and* SQL (an App Store requirement once accounts exist).
4. **No social/OTP** — only `signInWithPassword`/`signUp`.
5. **Model split** — canonical `CareEvent` has no backend; only legacy `LogEvent` syncs.
6. **No local→account migration** — `resolveRepository` swaps local→Supabase on sign-in and the local night is abandoned.
7. **No auth tests** — smoke script covers pure logic only; no component/integration/navigation/persistence tests.
8. **RN session refresh not fully wired** — relies on `autoRefreshToken` without the recommended `AppState`
   start/stop-auto-refresh; no deep-link handler for confirmation/reset/OAuth redirects (`detectSessionInUrl:false`).
9. **Sign-out data hygiene** — `signOut` doesn't clear the local cache, so a second account on the same device could see
   the prior session's cached night.

---

## 3. Product Decisions Needed (and the ones already made)

**Locked for this milestone:**
- **Provider:** Supabase (ratified).
- **Methods:** email+password **+ Sign in with Apple + Google** (Apple is mandatory because a social provider is offered).
- **Account model:** local-first/guest preserved; account optional; required only for multi-device sync, caregiver
  invites, family sharing, cloud backup, account-owned data. **No mandatory account on first launch.**
- **Local data:** on sign-in/sign-up from guest, **migrate & link** local events — no silent loss.
- **Canonical model:** `CareEvent` (Logging v2) long-term; legacy `LogEvent` sync is a temporary bridge; v2 backend is a
  separate later phase.

**Still open (tracked in §10):**
- Email confirmation **on or off** at launch (drives whether a deep-link confirmation handler is required for v1).
- Onboarding ↔ account ordering and **where the baby profile is owned** (onboarding currently creates a *local* baby;
  account setup also creates a baby) — must be reconciled *with* the onboarding worktree, not by editing it here.
- Family/household as a first-class entity now vs. derived from `baby_caregivers` until Phase 6.
- During the bridge period, whether v2-logged data write-throughs to the legacy synced model or stays local until Phase 6.

---

## 4. Recommended Auth Architecture

Keep the existing shape; harden the pieces.

- **AuthProvider / AuthContext** (`src/state/AuthProvider.tsx`): remains the single source of truth. Extend the surface
  with `resetPassword(email)`, `signInWithApple()`, `signInWithGoogle()`, `deleteAccount()`, and a `migrateLocalData()`
  hook fired on the guest→authenticated transition. Keep the local-only branch inert when unconfigured.
- **Session loading state:** keep `status: 'loading'` → `AuthLoading` while the session resolves; theme/splash stay
  independent (ThemeProvider above AuthProvider). Add the **expired/refresh-failure** path → `signed-out` (or guest).
- **User object model:** `session: Session` (Supabase) → `caregiver: Caregiver` (`profiles` row) → `baby`/`caregivers`
  (via `baby_caregivers`). Long-term the canonical event owner is `CareEvent.createdByUserId` + `familyId` + `childId`.
- **Secure token/session persistence:** add `src/lib/secureSessionStore.ts` — a `{getItem,setItem,removeItem}` adapter
  over `expo-secure-store` with **chunking** (SecureStore's ~2 KB/value limit < a Supabase session), passed as
  `auth.storage` in `src/lib/supabase.ts`. Add an `AppState` listener to `startAutoRefresh`/`stopAutoRefresh`.
- **Route protection:** keep `AuthGate`. **Change for guest mode:** in a *configured* build, `signed-out` must no longer
  force `AuthScreen` — it should render the app on the local repository with an **upgrade-to-account** entry point, so a
  user can log nights as a guest and sign in later. Sign-in is reachable from `AccountSheet`/header, not a wall.
- **Logout behavior:** `supabase.auth.signOut()` **+** clear local cached night/baby for the signed-in scope (reuse
  `clearLocalEventStorage()` / repository `clear()`), then return to guest/local. Never delete shared remote data on
  sign-out (the Supabase repo's `clear()` already no-ops remotely — keep that).
- **Account deletion:** client cannot delete an auth user with the anon key. Add a Supabase **Edge Function**
  `delete-account` (service role) that calls `auth.admin.deleteUser` + cascades (events, `baby_caregivers`, orphaned
  babies), invoked via `supabase.functions.invoke('delete-account')` from `AccountSheet`. Mirrors the existing
  `SECURITY DEFINER` RPC pattern.
- **Offline / local-first:** unchanged as the default. Supabase remains additive; all reads/writes degrade to local when
  unconfigured, signed-out (guest), or offline (sync status already models `offline`).

---

## 5. Navigation Flow

Bootstrap order (unchanged): `RootLayout` (fonts+theme) → `AuthProvider` → `AuthGate` → `OnboardingGate` → app/auth surface.

```
First launch (guest, local-first)
  fonts+theme hydrate → splash hides → OnboardingGate (carousel) → app on LOCAL repo (seed/local baby)
  → user can log nights with no account. "Create account" is optional (AccountSheet/header).

New user sign-up (from guest)
  AccountSheet → AuthScreen(sign-up) → email confirm? (if on: deep-link lullaby:// → setSession)
  → status 'needs-setup' → BabySetupScreen (create baby OR join invite)
  → MIGRATE local events → account → status 'ready' (Supabase repo + realtime)

Returning user, valid session
  getSession() → evaluate() → linked baby → 'ready' → straight into the app (no auth surface)

Returning user, expired session
  refresh attempt → success → 'ready'; failure → fall back to GUEST (local) with an upgrade prompt (never a hard logout wall)

Logged-out / guest in a configured build
  app renders on LOCAL repo; sign-in is an opt-in entry point, not a gate

Completed onboarding but not authenticated
  onboarding flag already 'true' → onboarding NOT shown again → app on local repo as guest

Authenticated before completing onboarding
  OnboardingGate still gates first-run UX globally; after onboarding, 'needs-setup' → BabySetupScreen → migrate → 'ready'
```

Apple/Google: button → native credential → `supabase.auth.signInWithIdToken({provider, token})` → `onAuthStateChange` →
`evaluate()` → same `needs-setup`/`ready` path (+ migration on first link).

---

## 6. Data Model / Ownership Plan

**Ownership hierarchy (target, canonical v2):**
`auth.users` (1:1) `profile/caregiver` → member of a **family/household** → family has **children (babies)** →
**events** owned by `(familyId, childId, createdByUserId)`, with `clientEventId` (idempotency), `version` (optimistic
concurrency), and soft-delete (`status`/`deletedAt`). Pump events carry `subjectUserId` (the caregiver), not a child.

**Today (legacy bridge):** the effective chain is `auth user → profiles → baby_caregivers → babies → events(baby_id,
caregiver_id, meta jsonb)`. Family/household is *implicit* (shared `baby_caregivers` membership). This is sufficient for
the bridge; Phase 6 introduces explicit `families`/`households` + child ownership to match `CareEvent`.

**Associating local data with a user (milestone-1 migration):**
1. On the guest→authenticated transition (after `ensureCaregiverSetup`/invite yields a `babyId`), read local stores:
   `lullaby/local-events/v1` (legacy) and, if `EXPO_PUBLIC_LOGGING_V2` was used, `lullaby/logging-v2/v1` (CareEvent).
2. Re-stamp each event's owner to the authenticated `caregiverId` (`auth.uid()`) + the linked `baby_id`.
3. Push via the existing `EventRepository.applyChanges({upserts})` (idempotent **by id/`clientEventId`** → safe to retry,
   never duplicates; satisfies RLS `caregiver_id = auth.uid()`).
4. Only after a confirmed remote write, mark a **migration-complete flag** (e.g. `lullaby/migrated/v1`) so it runs once;
   keep the local copy until then (no destructive clear before confirmation).
5. v2-only fidelity (segments, version, soft-delete) is **lossy through the legacy bridge** — documented as a known
   limitation until Phase 6, which migrates legacy→v2 with full fidelity.

**Future sync (Phase 6):** per-event upsert by `id`/`clientEventId`, soft-delete via status, conflict via `version`
(last-writer-wins per field or merge), realtime per `familyId`/`childId`, and a legacy→CareEvent backfill.

**No-loss guarantees:** migration is idempotent and confirmation-gated; sign-out clears only *cached* local copies, never
remote; account deletion is explicit and cascaded.

---

## 7. Implementation Phases

Each phase is independently shippable, lint+typecheck+smoke green, and preserves local-only behavior.

### Phase 0 — Decisions & provider config (mostly done)
- **Goal:** lock decisions (done) and configure the Supabase project for the chosen methods.
- **Files:** `.env.example` (add provider notes), `supabase/README.md`, Supabase dashboard (Apple/Google providers,
  email-confirmation choice, redirect URLs `lullaby://`).
- **Tasks:** enable Apple+Google providers; decide email confirmation on/off; register redirect scheme; document env.
- **Acceptance:** a configured dev build can reach Supabase; providers enabled; env documented.
- **Risks:** Apple/Google console setup (Service IDs, OAuth client) is fiddly; capture steps in `supabase/README.md`.

### Phase 1 — Auth foundation hardening (**first implementation step**)
- **Goal:** secure the session and session lifecycle with zero user-visible change.
- **Files:** `package.json` (+`expo-secure-store`), new `src/lib/secureSessionStore.ts`, `src/lib/supabase.ts`,
  `src/state/AuthProvider.tsx` (AppState refresh; sign-out cache clear), `package.json` scripts (+`typecheck`).
- **Tasks:** chunked SecureStore adapter → `auth.storage`; `AppState` start/stop auto-refresh; clear local cache on
  sign-out; add `"typecheck": "tsc --noEmit"`.
- **Acceptance:** tokens live in Keychain/Keystore (not AsyncStorage); session survives cold restart; sign-out leaves no
  cached night for the next user; `npm run typecheck` + `npm run lint` + `npm run check:local-interactions` green.
- **Risks:** SecureStore size limit (mitigated by chunking); a one-time migration of any existing AsyncStorage session.

### Phase 2 — Bootstrap & guard hardening + deep links
- **Goal:** robust loading/expiry handling and a deep-link foundation; theme/splash untouched.
- **Files:** `src/components/auth/AuthGate.tsx`, `src/state/AuthProvider.tsx`, new `src/lib/authLinking.ts`,
  `app.json` (linking), read-only check of `src/app/_layout.tsx`.
- **Tasks:** expired/refresh-failure → guest-with-upgrade (not a wall); centralize `AuthLoading`; add a `lullaby://`
  handler to exchange confirmation/reset/OAuth redirects (`exchangeCodeForSession`/`setSession`).
- **Acceptance:** expired session degrades gracefully; deep links resolve a session; theme reveal + splash timing unchanged.
- **Risks:** must not reorder providers above `ThemeProvider`; verify no setState-in-effect lint regressions.

### Phase 3 — Auth UI: reset, social, deletion
- **Goal:** complete the user-facing auth surface.
- **Files:** `src/components/auth/AuthScreen.tsx`, new `ForgotPasswordScreen`/inline reset, `AccountSheet.tsx`
  (+ delete-account), new social handlers in `AuthProvider.tsx`; `package.json` (+`expo-apple-authentication`,
  +`expo-auth-session` or `@react-native-google-signin/google-signin`); `app.json` (Apple `usesAppleSignIn`, plugins,
  Google config); new Supabase Edge Function `supabase/functions/delete-account`.
- **Tasks:** `resetPasswordForEmail` + reset landing; Apple/Google buttons → `signInWithIdToken`; in-app account deletion
  via Edge Function with cascade + confirmation; map raw Supabase errors to calm copy.
- **Acceptance:** all methods sign in to the same account model; reset works end-to-end; deleting an account removes
  auth user + owned rows and returns to guest; Apple review criteria (Apple sign-in present, deletion present) satisfied.
- **Risks:** Google native module needs a dev-client build (already used, not Expo Go); Apple entitlement/provisioning.

### Phase 4 — Guest ↔ onboarding integration (no onboarding-file edits)
- **Goal:** make guest usable in production builds and add the upgrade path, coordinating with onboarding externally.
- **Files:** `src/components/auth/AuthGate.tsx`, `src/state/AuthProvider.tsx`, `AccountSheet.tsx`/header entry point.
  **Not touched:** `src/components/onboarding/*`.
- **Tasks:** configured-build `signed-out` renders the app on local repo + upgrade affordance; keep `OnboardingGate`
  ordering intact; reconcile the baby-ownership overlap *by agreement* with the onboarding worktree (documented, not coded here).
- **Acceptance:** a guest can complete onboarding and log nights with no account; "Create account" is discoverable;
  onboarding files unchanged; `EXPO_PUBLIC_FORCE_ONBOARDING` still honored in dev.
- **Risks:** baby created in onboarding vs. `BabySetupScreen` duplication — resolve cross-worktree before shipping.

### Phase 5 — Local → account migration / linking
- **Goal:** preserve and link guest data on first sign-in (no silent loss).
- **Files:** new `src/sync/migrateLocalToAccount.ts`, `src/state/AuthProvider.tsx` (invoke on guest→ready), reuse
  `src/sync/provisioning.ts`, `src/data/localStorage.ts`, `src/data/localBaby.ts`.
- **Tasks:** read local stores → re-stamp owner → `applyChanges` upserts (idempotent by id/`clientEventId`) →
  confirmation-gated migration flag → retain local until confirmed.
- **Acceptance:** a guest with N local events signs up → exactly N events appear under their baby in Supabase; re-running
  is a no-op (no duplicates); interrupted migration is resumable; no data lost.
- **Risks:** legacy-bridge fidelity loss for v2-only fields (documented); large local histories → batch the upserts.

### Phase 6 — CareEvent (Logging-v2) backend & cloud sync (dedicated later milestone)
- **Goal:** make the **canonical** `CareEvent` model the synced source of truth.
- **Files:** new `supabase/migrations/*` (families/households, children, `events_v2` with `family_id`/`child_id`/
  `created_by_user_id`/`version`/soft-delete/segments, RLS); new `src/features/logging/data/SupabaseLoggingRepository.ts`
  implementing `LoggingRepository`; `syncQueue` drain; realtime; legacy→v2 backfill.
- **Tasks:** schema + RLS; sync engine draining `enqueueSync`; conflict handling (`version`); one-time legacy→CareEvent migration.
- **Acceptance:** v2 events round-trip with full fidelity across devices/caregivers; conflicts resolve deterministically;
  legacy data migrated; bridge retired.
- **Risks:** largest phase; schema design must match `src/features/logging/domain/types.ts` exactly; plan a reversible migration.

### Phase 7 — QA, tests & hardening
- **Goal:** automated + manual confidence and a security pass.
- **Files:** `package.json` (+`jest-expo`, `@testing-library/react-native`), `jest.config.js`, `src/**/__tests__/*`,
  keep `scripts/check-local-interactions.ts`, optional CI.
- **Tasks:** unit (provider/sync/migration), integration (sign-in→setup→migrate→ready), navigation (gate routing),
  session-persistence, logout, data-preservation tests; manual QA matrix; RLS + token-storage + deletion security review.
- **Acceptance:** suites pass on iOS+Android; manual checklist signed off; no plaintext tokens; RLS verified.
- **Risks:** RN testing setup friction on SDK 56 / React 19 — pin `jest-expo` to the SDK.

---

## 8. Detailed File-Level Plan

**Create**
- `src/lib/secureSessionStore.ts` — chunked `expo-secure-store` adapter (Supabase `auth.storage`).
- `src/lib/authLinking.ts` — `lullaby://` handler for confirmation/reset/OAuth redirects.
- `src/components/auth/ForgotPasswordScreen.tsx` (or inline reset in `AuthScreen`).
- `src/sync/migrateLocalToAccount.ts` — idempotent guest→account migration.
- `supabase/functions/delete-account/` — Edge Function (service role) for account deletion + cascade.
- Phase 6: `supabase/migrations/*` (v2 schema) + `src/features/logging/data/SupabaseLoggingRepository.ts`.
- Tests: `jest.config.js`, `src/**/__tests__/*`.

**Modify**
- `src/lib/supabase.ts` — use SecureStore adapter; keep optional/local-only fallback.
- `src/state/AuthProvider.tsx` — `resetPassword`, `signInWithApple`, `signInWithGoogle`, `deleteAccount`,
  migration trigger, AppState refresh, sign-out cache clear, guest-on-`signed-out` semantics.
- `src/components/auth/AuthScreen.tsx` — reset entry + Apple/Google buttons + calm error mapping.
- `src/components/auth/AccountSheet.tsx` — delete-account action.
- `src/components/auth/AuthGate.tsx` — configured-build `signed-out` → app-on-local + upgrade affordance.
- `app.json` — Apple sign-in entitlement/plugin, Google config, linking.
- `package.json` — deps (`expo-secure-store`, `expo-apple-authentication`, Google/auth-session) + `typecheck`/test scripts.

**Do NOT modify**
- `src/components/onboarding/*` (other worktree). `src/state/ThemeProvider.tsx` + circular-reveal (keep above auth).
- Existing `src/sync/*` legacy contract beyond what migration needs (bridge stays until Phase 6).

---

## 9. Testing Plan

- **Unit:** SecureStore adapter (chunk round-trip); `AuthProvider` reducer transitions; `migrateLocalToAccount`
  idempotency; error-message mapping. (Keep `check:local-interactions` for pure logic.)
- **Integration:** sign-up → confirm → `needs-setup` → setup → **migrate** → `ready`; invite-join path; Apple/Google
  via mocked `signInWithIdToken`; account deletion (mock Edge Function) → guest.
- **Navigation:** `AuthGate` renders correct surface per `status`; guest-in-configured-build renders app, not a wall;
  `OnboardingGate` ordering preserved.
- **Session persistence:** cold-restart restores session from SecureStore; expired→refresh→`ready`; refresh-fail→guest.
- **Logout:** remote sign-out + local cache cleared; no prior-user data leaks to next account.
- **Data preservation:** N local events → exactly N synced, idempotent re-run, resumable interruption, zero loss.
- **Manual QA (iOS + Android dev-client):** guest logging → upgrade → data intact; Apple (iOS) + Google (both); reset
  email; delete account; airplane-mode offline → reconnect sync; theme reveal unaffected by auth.
- **Platform notes:** Apple sign-in iOS-only (hide on Android/web); Google native needs dev-client; web uses redirect +
  `detectSessionInUrl` (out of scope unless web is targeted); SecureStore is native-only (web falls back).
- **Security review:** RLS on every table; tokens only in SecureStore; deletion cascade complete; no service-role key in client.

---

## 10. Risks and Open Questions

- **Model split is the central architectural risk.** The app logs via canonical **v2** (flag on) but syncs **legacy** —
  during the bridge, signed-in sync fidelity is legacy-level and v2-only fields don't round-trip until Phase 6. Decide
  whether v2 write-throughs to legacy during the bridge or stays local.
- **Onboarding ownership overlap.** Onboarding creates a *local* baby; `BabySetupScreen` also creates a baby. Reconcile
  *with* the onboarding worktree (agreement, not edits here) to avoid double-collection/duplicate babies.
- **Email confirmation on/off** changes whether a confirmation deep-link handler is required for v1.
- **Account deletion** requires server-side (Edge Function + service role) — provision securely; never ship the service key.
- **Apple/Google setup friction** (Service IDs, entitlements, OAuth clients) — document in `supabase/README.md`.
- **Guest-in-configured-build** is a real behavior change to `AuthGate` — verify it doesn't regress the
  `LocalEventProvider`-only-mounts-when-safe invariant or flash the seed behind auth.
- **React Compiler lint** — no synchronous setState in new effects; latch with lazy `useState` initializer.
- **RN test tooling** on SDK 56 / React 19 — pin `jest-expo` to the SDK; expect setup friction.
- **Family/household** as explicit entity now vs. Phase 6 — recommended Phase 6 to avoid premature schema churn.

---

## 11. Recommended First Implementation Prompt (Phase 1 only)

> **Copy-paste for the next implementation agent.**
>
> You are implementing **Phase 1 (Auth Foundation Hardening) only** of
> `docs/plans/authentication-implementation-plan.md` in the Lullaby Expo/React Native app
> (`/home/dimash/lullaby-auth-plan`, branch `plan/auth-implementation-plan`).
>
> **Goal:** move the Supabase session from AsyncStorage into secure device storage and harden the session lifecycle,
> with **zero user-visible behavior change** and the local-only fallback fully preserved.
>
> **Do:**
> 1. Add `expo-secure-store` (Expo SDK 56-compatible). Create `src/lib/secureSessionStore.ts`: a
>    `{ getItem, setItem, removeItem }` adapter over SecureStore that **chunks** values (SecureStore ~2 KB/value;
>    Supabase sessions exceed it) and reassembles them; tolerate missing/partial chunks by returning null.
> 2. In `src/lib/supabase.ts`, pass the adapter as `auth.storage` (keep `autoRefreshToken`, `persistSession`,
>    `detectSessionInUrl:false`, and the unconfigured→`null` client behavior unchanged). One-time: if an old session
>    exists in AsyncStorage, migrate it into SecureStore then remove it.
> 3. In `src/state/AuthProvider.tsx`, add an `AppState` listener that calls `supabase.auth.startAutoRefresh()` on
>    foreground and `stopAutoRefresh()` on background; on `signOut`, clear the local cached night/baby for the
>    signed-in scope (reuse `clearLocalEventStorage()` / repository `clear()`), then return to guest/local.
> 4. Add `"typecheck": "tsc --noEmit"` to `package.json` scripts.
>
> **Do NOT:** modify `src/components/onboarding/*`; change `src/state/ThemeProvider.tsx` or the provider order above
> AuthProvider; add new auth methods/UI (later phases); build any v2 backend; commit or push.
>
> **Constraints:** TypeScript strict; React Compiler is on — **no synchronous `setState` inside `useEffect`** (latch with
> a lazy `useState` initializer; async-callback setState is fine).
>
> **Verify before done:** `npm run typecheck`, `npm run lint`, `npm run check:local-interactions` all green; manually
> confirm on a configured dev-client build that sign-in persists across a cold restart and that no session token remains
> in AsyncStorage; confirm the unconfigured (local-only) build is unchanged.

---

## 12. Summary

- **Recommendation:** keep & finish **Supabase**; harden it (secure storage, password reset, account deletion,
  Apple + Google), preserve guest/local-first with a no-loss upgrade migration, treat legacy sync as a temporary bridge,
  and build the canonical CareEvent backend as a dedicated later phase.
- **Provider:** Supabase (ratified).
- **First safe phase:** Phase 1 — secure token storage + session hygiene.
- **Guardrails:** no source/package/onboarding/theme changes implied by this document; nothing committed.
