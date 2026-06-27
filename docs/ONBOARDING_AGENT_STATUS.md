# Lullaby Onboarding Agent Status

AUTOPILOT_STATUS: READY
EXPECTED_BRANCH_PATTERN: feat/onboarding-*
RECOMMENDED_IMPLEMENTATION_BRANCH: feat/onboarding-personalized-activation
CURRENT_SLICE_ID: phase-1a-setup-foundation
CURRENT_SLICE_NAME: Phase 1A - Setup foundation (shared Orb/role/date + flow reducer/layout)
NEXT_SLICE_ID: phase-1a-live-flow
PHASE_1B_ENABLED: false

## Source Of Truth

- Roadmap: `docs/onboarding-roadmap.md`
- Current implementation must follow roadmap Section 12 and Section 16.
- Old logging automation is not active for onboarding:
  - `scripts/claude-autopilot.sh`
  - `.claude/prompts/lullaby-autopilot-step.md`
  - `docs/LULLABY_LOGGING_AGENT_STATUS.md`
  - `CLAUDE.md`

## Current Branch Expected

- Required pattern for the runner: `feat/onboarding-*`
- Roadmap-recommended implementation branch: `feat/onboarding-personalized-activation`
- The setup branch `feat/onboarding-automode-phase-1a` also matches the safe
  onboarding pattern.
- The runner may be overridden with `--allow-branch` only for intentional local
  testing. Do not use that override overnight.

## Current Slice

### phase-1a-setup-foundation - Setup flow foundation

Goal: the enabling extractions + pure flow/layout scaffolding for Phase 1A, with
no user-visible flow change yet. Extract a shared `<Orb>` from `OrbHero` (body +
breathe + ring, one `useOrbBreathe` driver) and the private `RolePicker` +
`birthDateFromWeeks` + `parseWeeks` out of `BabySetupScreen` into a shared module;
build `OnboardingStepLayout` on top of `AuthShell` (orb/header slot + pinned CTA);
add `useOnboardingFlow` as a pure step reducer (`beat → baby → creating → done`).

Roadmap basis:

- Section 12 (Phase 1A "Extract first"): shared `<Orb>`, shared role/date helpers,
  `OnboardingStepLayout` on `AuthShell`, pure `useOnboardingFlow` reducer.
- Section 13: component architecture map — extractions land before flow work.

Expected implementation scope:

- A shared `<Orb>` extracted from `src/components/OrbHero.tsx` (no Tonight change).
- A shared module for `RolePicker` + `birthDateFromWeeks` + `parseWeeks` (extracted
  from `src/components/auth/BabySetupScreen.tsx`; fix the `RolePicker` contrast).
  Reconcile with `src/data/localBaby.ts`'s `birthDateFromWeeks` (single source).
- `OnboardingStepLayout` built on top of `AuthShell`.
- `useOnboardingFlow` pure reducer + smoke checks.

Acceptance criteria:

- Extractions are behavior-preserving (BabySetupScreen + OrbHero render the same);
  no live onboarding flow change in this slice.
- The reducer + any extracted pure helper are covered by smoke checks.
- `npx tsc --noEmit`, `npm run check:local-interactions`, and `npm run lint`
  pass before commit.
- Commit is one bounded slice.

## Slice Queue

- [x] `phase-0a` - Active-baby read-site refactor, no behavior change.
- [x] `phase-0b` - Local baby creation factory, persisted local baby store,
  seed-clear ordering, dev reset extension.
- [ ] `phase-1a-setup-foundation` - Extract shared `Orb`/role/date helpers and
  introduce the pure onboarding flow reducer/layout foundation.
- [ ] `phase-1a-live-flow` - Replace passive carousel with live age/name setup,
  real local completion, night-aware onboarding scaffold, and fake completing
  label removal.
- [ ] `phase-1a-personalized-tonight` - Personalized Tonight greeting,
  Calibrating copy, first-log coach, and minimal single-caregiver `HandoffCard`
  fix.
- [ ] `phase-1a-checks-polish` - Rewrite/update local interaction checks for
  new onboarding constants/reducer/factory and complete Phase 1A polish.
- [ ] `phase-1b-notifications` - STOP by default. Gentle morning-recap opt-in
  using local notifications only. Requires `PHASE_1B_ENABLED: true`, explicit
  human approval, and likely dependency/native-permission review.
- [ ] `phase-2-polish-qa` - STOP by default for overnight. Manual QA, deferred
  partner invite on-ramp, and edit baby recovery.

## Completed Slices

### phase-0b - Local baby creation (DONE)

What shipped: a pure `createLocalBaby` factory plus a persisted local
baby/caregiver store on `AuthProvider`, so the Phase 1A flow can create a real
local baby (not the seed) with correct seed-clear ordering. No live flow change
yet — the seed stays the default until `createLocalBaby` is wired into onboarding.

- `src/data/localBaby.ts` (NEW; pure leaf, only a type import): `createLocalBaby(
  input, now) -> {baby, caregiver}` (fixed ids `local-baby`/`local-caregiver`,
  calm defaults for the skip path, role→brand-color fallback), `birthDateFromWeeks(
  weeks, now)` (clamps negative/non-finite, floors fractions), `serializeLocalBaby`
  / `parseLocalBaby` (junk → null → seed fallback), and `LOCAL_BABY_STORAGE_KEY`
  (`lullaby/local-baby/v1`).
- `src/state/AuthProvider.tsx`: local-only cold-launch hydration of the persisted
  local baby (falls back to the seed when absent); a `createLocalBaby(input)`
  context method that sets state, persists the record, then clears the seed night
  (`lullaby/local-events/v1`) so `LocalEventProvider` rehydrates clean. Configured
  (Supabase) builds unchanged — identity still resolved by `evaluate`.
- `src/components/onboarding/onboardingStorage.ts`: `resetOnboardingComplete
  ForDevelopment` now `multiRemove`s the onboarding flag + local baby + local
  events for a true dev cold-open (dev-only; keys imported relatively so the Node
  smoke test still loads the module).
- `scripts/check-local-interactions.ts`: +10 checks (W1–W10) — factory defaults/
  trimming, weeks→birthDate clamping, purity, the age-control birthDate path, and
  serialize/parse round-trip + junk rejection.

Checks (all green):

- `npx tsc --noEmit` -> exit 0.
- `npm run check:local-interactions` -> 181/181 passed (was 171; +10 W-checks).
- `npm run lint` -> exit 0.

Risks / notes:

- `birthDateFromWeeks` now lives in two places: the new `src/data/localBaby.ts` and
  the private one in `BabySetupScreen`. Phase 1A's helper extraction must reconcile
  them into one shared source (no runtime conflict today; same math).
- `createLocalBaby` is on `AuthContextValue` for all builds but only exercised by
  the local-only flow (Phase 1A); configured builds never call it.

Manual QA still recommended (device; not run in this headless slice):

- With `EXPO_PUBLIC_FORCE_ONBOARDING=true`, once Phase 1A calls
  `useAuth().createLocalBaby({...})`, confirm Tonight shows the new baby/caregiver,
  the seed Mia night is gone, and a cold relaunch rehydrates the same local baby
  (not the seed).
- Confirm the dev reset returns to a true first-run (no leftover baby or events).

### phase-0a - Active-baby read-site refactor (DONE)

What shipped: `AuthProvider`'s local-only branch now owns an active
baby/caregiver (seeded with the demo Mia/Mom as the default fallback), and every
seed read-site reads through it instead of importing the seed directly. The mint
helpers are parameterized for a future real baby; the seed stays the default.

- `src/data/mock.ts`: added `EventActor` + `SEED_ACTOR`; `create{Feed,Sleep,
  Diaper,Pump,Note}Event` take `actor: EventActor = SEED_ACTOR`.
- `src/data/localInteractions.ts`: `handleQuickLog` / `handle*Tap` /
  `handlePrimaryAction` / `add{Feed,Diaper,Note,Pump}` thread an optional
  `actor` (defaults to `SEED_ACTOR`).
- `src/state/AuthProvider.tsx`: local-only `baby`/`caregivers`/`caregiver`
  initialize from the seed (configured/Supabase builds unchanged).
- `src/features/logging/state/LoggingProvider.tsx`: `useLoggingActor` resolves
  the local actor from `useAuth().baby/caregiver` (seed fallback) — actor ids
  unchanged.
- `src/app/(tabs)/index.tsx`: reads the active baby/caregivers from `useAuth()`;
  frozen-date age fix (age now derives from `baby.birthDate` against the live
  clock, not the hardcoded `2026-06-16`).
- `src/app/(tabs)/log.tsx`: caregiver list reads the active caregivers from
  `useAuth()` (seed kept only as the ultimate fallback).
- `src/data/currentState.ts`: dropped the seed `events` import and the frozen
  `DEMO_NOW`; dead `getCurrentBabyState` now defaults to `[]` / `new Date()`.

Checks (all green):

- `npx tsc --noEmit` -> exit 0.
- `npm run check:local-interactions` -> 171/171 passed.
- `npm run lint` -> exit 0.

Intended behavior delta (one, expected by the roadmap's "frozen-date fix"):

- Local seed baby age in `BabyHeader` now computes live. Mia (born 2026-04-28)
  reads ~8 weeks today instead of the frozen 7. No layout/flow/copy changes; the
  seed events, timeline, orb, and handoff are byte-for-byte the same.

Manual QA still recommended (device, not run in this headless slice):

- `EXPO_PUBLIC_FORCE_ONBOARDING=true` cold launch in local-only: confirm Tonight
  renders Mia + Mom/Dad, quick-logs still stamp `baby-mia`/`cg-mom`, timeline +
  handoff unchanged, age reads correctly.
- Repeat with `EXPO_PUBLIC_LOGGING_V2` on/off (the actor feeds v2 hydration).

## Next Slice

`phase-0b` is complete and committed. Move to `phase-1a-setup-foundation` (extract
the shared `<Orb>` + role/date helpers, build `OnboardingStepLayout` on
`AuthShell`, add the pure `useOnboardingFlow` reducer) only if all checks pass and
the diff stays within scope. Reconcile the duplicate `birthDateFromWeeks` during
the helper extraction; keep the extractions behavior-preserving (no live flow
change in that slice).

## Blocked Status

Use `AUTOPILOT_STATUS: BLOCKED` if the agent cannot continue safely. Include:

- exact blocker
- files touched, if any
- checks run
- human decision needed

Use `AUTOPILOT_STATUS: DONE` only after Phase 1A is complete and explicitly
signed off. Do not mark DONE just because Phase 1B is skipped.

## Checks Required

Every slice must run:

```bash
npx tsc --noEmit
npm run check:local-interactions
npm run lint
```

`npm test` is not configured in this repo. The Node/tsx smoke test is the active
test harness.

## Commit Policy

- One successful slice equals one commit.
- Commit only after all required checks pass.
- Include `docs/ONBOARDING_AGENT_STATUS.md` in the same commit as the slice.
- Use conventional commits, scoped to onboarding.
- Never push from automode.
- If checks fail after 2 focused fix attempts, do not commit; set BLOCKED only
  if the blocker needs human input.

## Stop Conditions

Stop immediately if:

- Git is dirty before the slice starts.
- Current branch does not match `feat/onboarding-*`.
- The status file says `BLOCKED` or `DONE`.
- The current slice is ambiguous.
- A dependency install is required.
- Native config or prebuild work is required.
- `.env`, secrets, deployment, Supabase migrations/schema, EAS, or push are
  involved.
- Phase 1B notifications are selected while `PHASE_1B_ENABLED` is not `true`.
- Changed files exceed the runner's safe scope.
- More than `MAX_CHANGED_FILES` files change in one slice.
- Checks still fail after 2 focused fix attempts.
- Claude makes no commit for a completed slice.

## Phase 1A Scope

Phase 1A is the core overnight target after Phase 0 foundation:

- live emotional beat -> age/name setup
- real local baby completion
- shared orb/onboarding layout foundation
- personalized Tonight greeting
- Calibrating state
- first-log coach
- minimal single-caregiver `HandoffCard` fix
- updated smoke checks

Phase 1A must not include notification dependency work.

## Phase 1B Boundary

Phase 1B is intentionally separate:

- local morning-recap notification only
- double opt-in after first meaningful log
- feature-flagged
- graceful in-app fallback if denied/unavailable

Do not run Phase 1B overnight unless a human explicitly changes
`PHASE_1B_ENABLED: true` and selects the `phase-1b-notifications` slice.
