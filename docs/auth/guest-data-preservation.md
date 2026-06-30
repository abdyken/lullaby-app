# Guest / Local Data Preservation & Upgrade Safety (Auth Step 08)

> **Scope:** verify (and lock in) that a guest's local baby profile and local logs
> survive every auth transition, and document — but do **not** implement — the
> future local → account migration.
> **Worktree:** `/home/dimash/lullaby-auth-completion-workflow` ·
> **Branch:** `feat/auth-completion-autoworkflow`
> **Contract module:** `src/data/guestData.ts` ·
> **Coverage:** `scripts/check-local-interactions.ts` checks `GP1–GP6`
> (`npm run check:local-interactions`).

Lullaby is local-first: a parent can use the entire app as a **guest**, with no
account, and "Continue locally" must always remain (global guardrail). This note
records the audit proving that guest data is never lost across auth transitions.

---

## 1. What counts as guest data

Three AsyncStorage stores, each owned by its own pure (de)serialization module.
`src/data/guestData.ts` re-exports the key constants and aggregates them into
`GUEST_OWNED_STORAGE_KEYS` (single source of truth — it can't drift from the keys
it protects):

| Store | Key | Owner module |
|---|---|---|
| Local baby + caregiver | `lullaby/local-baby/v1` | `src/data/localBaby.ts` |
| Legacy local night loop | `lullaby/local-events/v1` | `src/data/persistedState.ts` (`STORAGE_KEY`) |
| Logging-v2 snapshot | `lullaby/logging-v2/v1` | `src/features/logging/data/loggingPersistence.ts` |

**Not** guest data (safe to clear; deliberately excluded from the protected set):

- `lullaby/auth/prefers-local/v1` — the sticky "this guest chose to continue
  locally" flag (auth-owned UI preference).
- The chunked Supabase session (secure-store keys via `secureSessionStore.ts`).
- `lullaby/handoff-cursor/<ctx>` — a per-context *reading* cursor ("have I caught
  up?"), already scoped per `<caregiverId>:<babyId>` so it can't bleed across
  accounts. Not log/profile data.

---

## 2. Transition-by-transition audit

The guarantee: **no destructive clear before an explicit, confirmed action.**

| Transition | Code path | Touches guest stores? |
|---|---|---|
| **Opens auth** (guest taps "Create account or sign in") | `goToAccountEntry()` → clears `prefers-local`, `setStatus('signed-out')` | **No** — only the auth-owned flag |
| **Signs in** | `signIn()` → `onAuthStateChange` → `applySession` → `evaluate` → in-memory state only; repository swap is `resolveRepository()` | **No** — no AsyncStorage write/clear |
| **Signs up** | `signUp()` (same `onAuthStateChange` path; pending-confirmation just sets a message) | **No** |
| **Signs out** | `signOut()` → `supabase.auth.signOut()` only (clears the secure session manifest + chunks) | **No** — local-first stores deliberately preserved |
| **Restart app** | Cold launch rehydrates each store from AsyncStorage (`hydrateLocalIdentity`, `LocalEventProvider`, logging hydration) | **No** — read-only rehydrate |

### Every destructive storage op in the codebase (and why it's safe)

Enumerated via `grep -rE "AsyncStorage\.clear|removeItem|multiRemove|clearLocalEventStorage|\.clear\(\)"`:

- `AuthProvider.createLocalBaby()` → `clearLocalEventStorage()` — **onboarding baby
  mint**, not a transition above. Intentionally drops the *seed* night when a real
  local baby is created, so `LocalEventProvider` rehydrates clean.
- `AuthProvider.goToAccountEntry()` → `removeItem(PREFERS_LOCAL_STORAGE_KEY)` —
  auth-owned flag only.
- `LocalEventProvider.resetLocalEvents()` → `repositoryRef.current.clear()` —
  **debug-only**, *early-returns in Supabase mode*, reseeds the demo locally. Not
  reachable from an auth transition.
- `onboardingStorage.resetOnboardingCompleteForDevelopment()` → `multiRemove([...])`
  — **dev-only** (`isDevelopmentRuntime()` guard), for a true first-run reset.
- `handoffCursor.clearHandoffCursor()` — reading-state cursor, not log/profile data.
- `loggingStorage.clear()` / `localRepository.clear()` — port methods with **no
  caller on any auth path** (verified by grep); only the debug reset above and
  in-memory test ports invoke a `clear()`.
- `secureSessionStore.removeItem()` — the Supabase session; *correct* to clear on
  sign-out.

**Conclusion:** all five transitions preserve guest data. No change to runtime
behavior was required for Step 08 — the foundation was already correct (see the
recorded decision "AppState refresh + sign-out needs NO local cache clear"). Step
08 adds the *contract* (`guestData.ts`) and the *regression guard* (`GP1–GP6`).

---

## 3. Regression coverage (`GP1–GP6`)

Because the pure Node/tsx smoke runner can't import `AuthProvider` /
`LocalEventProvider` (React Native), coverage is split:

- **GP1–GP3 — contract, against the real serializers.** Pin
  `GUEST_OWNED_STORAGE_KEYS`; build a guest snapshot with `serializeLocalBaby` /
  `serializeState` / `serializeLoggingSnapshot`, apply an auth-only-key transition,
  and assert `isGuestDataPreserved` + that every store re-parses to its original
  record. GP3 proves the predicate isn't vacuously true (a wipe / corruption fails).
- **GP4–GP6 — transition guards, by source scan.** Assert `AuthProvider` never
  calls `AsyncStorage.clear` / `multiRemove`, calls `clearLocalEventStorage`
  exactly once (the onboarding mint), removes only `PREFERS_LOCAL_STORAGE_KEY`, and
  that `signOut` references only `supabase.auth.signOut()`. Assert
  `LocalEventProvider` has a single `repository.clear()` kept behind the
  supabase-mode early return.

---

## 4. Future migration path (Phase 5) — DOCUMENTED, NOT IMPLEMENTED

Full local → account migration is **out of scope** here (and intentionally not
built): a guest who signs in today keeps their local night on-device but it is not
yet copied into the new Supabase account. `guestData.ts` is the seam that migration
will read. The intended, safe (copy-then-confirm, never destructive) shape:

1. **Trigger** — only after a guest *explicitly* signs in/up AND a linked baby
   exists (`status: 'ready'`). Never automatic; never blocks "Continue locally".
2. **Read** local guest data via the existing pure parsers
   (`parseLocalBaby`, `parsePersistedState`, `parseLoggingSnapshot`).
3. **Re-own + upload** — map local rows to the account: rewrite `babyId` /
   `caregiverId` (or `familyId` / `childId` / `createdByUserId` for logging-v2) from
   the fixed local ids (`local-baby` / `local-caregiver`) to the account's ids, then
   idempotently upsert through the Supabase repository (reuse `clientEventId`
   dedup so a retried migration can't double-write).
4. **Verify, then and only then clear** — confirm the account holds the migrated
   rows (read-back / count), surface a calm "your local logs are now in your
   account" note, and *only after confirmation* clear the local stores. A failed or
   partial upload must leave the local stores intact (no silent data loss).
5. **Idempotent + resumable** — safe to re-run; a `clientEventId`-keyed upsert plus
   a "migration done" marker prevents duplicates.

Suggested home when built: `src/sync/migrateLocalToAccount.ts` (pure mapping +
orchestration over the existing `EventRepository`), invoked from `AuthProvider`
on the guest → `ready` transition. The pure re-owning transform should get its own
`GP`-style smoke checks asserting event count in == count out (only ownership
fields rewritten).
