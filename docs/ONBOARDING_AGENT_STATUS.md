# Lullaby Onboarding Agent Status

AUTOPILOT_STATUS: READY
EXPECTED_BRANCH_PATTERN: feat/onboarding-*
RECOMMENDED_IMPLEMENTATION_BRANCH: feat/onboarding-personalized-activation
CURRENT_SLICE_ID: phase-1a-live-flow
CURRENT_SLICE_NAME: Phase 1A - Live setup flow (live age/name setup + real local completion + night-aware scaffold)
NEXT_SLICE_ID: phase-1a-personalized-tonight
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

### phase-1a-live-flow - Live setup flow

Goal: replace the passive 3-panel value carousel with the live, personalized
setup flow now that the foundation (shared `<Orb>`, `RolePicker`/age helpers,
`OnboardingStepLayout`, `useOnboardingFlow`) is in place. This is the first
user-visible onboarding change.

Roadmap basis:

- Section 7 (flow B→C→D): emotional beat → age + optional name → real handoff into
  Tonight.
- Section 11 (completion ordering): write local baby → clear `lullaby/local-events/v1`
  → `markOnboardingComplete` → reveal.
- Section 12 (Phase 1A live flow): drop the paged `ScrollView`, render one step at a
  time off `useOnboardingFlow`, wire completion to `useAuth().createLocalBaby`, kill
  the fake `ONBOARDING_COMPLETING_LABEL`, resolve night at entry.

Expected implementation scope:

- Rebuild `OnboardingScreen` on `OnboardingStepLayout` + `<Orb>`, driven by
  `useOnboardingFlow` (step state, not scroll index — blank-frame postmortem).
- A one-thumb age control (coarse `RolePicker`/`ChoicePill` pattern → representative
  weeks → `birthDateFromWeeks`) + optional name; no keyboard on the critical path.
- Wire completion to `useAuth().createLocalBaby(...)` with the §11 ordering; remove
  the fake "Setting up..." completing label.
- Resolve the surface (`resolveSurfaceMode`) at entry so the first frame is night-safe.

Acceptance criteria:

- New install (no local baby) walks beat → age/name → real local baby → Tonight; the
  seed Mia never appears; skip/"Set up later" still creates a minimal valid baby.
- `npx tsc --noEmit`, `npm run check:local-interactions`, and `npm run lint` pass.
- Commit is one bounded slice. (`scripts/check-local-interactions.ts` likely needs a
  rewrite of the old G7–G12 panel assertions once the carousel is gone — see
  `phase-1a-checks-polish`.)

Foundation already shipped (this slice's prerequisites, in `phase-1a-setup-foundation`):

- `src/components/Orb.tsx` (shared `<Orb>` + `useOrbBreathe`).
- `src/components/auth/RolePicker.tsx` (`RolePicker` + `colorForRole` + `ROLES`).
- `src/components/onboarding/onboardingFlow.ts` + `useOnboardingFlow.ts` (pure reducer + hook).
- `src/components/onboarding/OnboardingStepLayout.tsx` (on `AuthSurface`).
- `parseWeeks` reconciled into `src/data/localBaby.ts` (single source with `birthDateFromWeeks`).

## Slice Queue

- [x] `phase-0a` - Active-baby read-site refactor, no behavior change.
- [x] `phase-0b` - Local baby creation factory, persisted local baby store,
  seed-clear ordering, dev reset extension.
- [x] `phase-1a-setup-foundation` - Extract shared `Orb`/role/date helpers and
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

### phase-1a-setup-foundation - Setup flow foundation (DONE)

What shipped: the enabling extractions + pure flow/layout scaffolding for Phase
1A, with no live onboarding flow change yet (the carousel still runs). The next
slice (`phase-1a-live-flow`) consumes these.

- `src/components/Orb.tsx` (NEW): the shared `<Orb>` (day/night body cross-fade +
  progress ring + white core) + `useOrbBreathe` + the orb types, extracted from
  `OrbHero`. One breathe driver, external-or-internal (theme-reveal overlay still
  supported).
- `src/components/OrbHero.tsx`: now composes `<Orb>` inside its sky card; keeps its
  exact public API + render (sky gradient, cloud/star decor, description pill,
  primary button unchanged). Re-exports `OrbSky`/`OrbCoreKind`/`OrbStateIconKind` +
  `useOrbBreathe` so `@/components/OrbHero` consumers (e.g. `currentState.ts`) are
  untouched.
- `src/components/auth/RolePicker.tsx` (NEW): `RolePicker` + `colorForRole` + `ROLES`
  extracted from `BabySetupScreen`. Contrast fix (roadmap §10): active selection is
  now ink-on-tint (soft role tint fill + 2px role-color border + ink text) instead
  of WCAG-failing white-on-tint. Selection behavior unchanged.
- `src/data/localBaby.ts`: `parseWeeks` added beside `birthDateFromWeeks` (single
  source). `BabySetupScreen` now imports both from here (the duplicate private
  `birthDateFromWeeks` is gone — reconciled, same math) and `RolePicker`/`colorForRole`
  from the new module.
- `src/components/onboarding/onboardingFlow.ts` (NEW): pure step reducer
  `beat → baby → creating → done` (+ `skip`/`back`/`reset`), `INITIAL_ONBOARDING_FLOW`,
  `onboardingStepIndex`, `isOnboardingComplete`. React-free pure leaf (smoke-testable).
- `src/components/onboarding/useOnboardingFlow.ts` (NEW): the `useReducer` hook over
  the pure reducer, exposing `begin/submit/skip/created/back/reset` + `step`/`isComplete`.
- `src/components/onboarding/OnboardingStepLayout.tsx` (NEW): per-step scaffold on the
  shared `AuthSurface` (orb pinned top, content scrolls, CTA pinned bottom).
- `src/components/auth/AuthShell.tsx`: extracted `AuthSurface` (the cream,
  keyboard-aware scaffold) so `OnboardingStepLayout` builds on it instead of a parallel
  cream background. `AuthShell` composes `AuthSurface` — render is byte-identical.
- `scripts/check-local-interactions.ts`: +9 checks — `parseWeeks` (X1–X2) and the
  onboarding flow reducer (Y1–Y7: happy path, skip, back, reset no-op, out-of-order
  no-ops, step order + completion).

Checks (all green):

- `npx tsc --noEmit` -> exit 0.
- `npm run check:local-interactions` -> 190/190 passed (was 181; +9 X/Y checks).
- `npm run lint` -> exit 0.

Intended visual delta (one, mandated by the slice — "fix the RolePicker contrast"):

- The active `RolePicker` pill changed from white-on-role-color to ink-on-role-tint
  with a role-color border (WCAG AA). Visible only on `BabySetupScreen` (Supabase
  `needs-setup` builds) today; behavior identical. `OrbHero`/Tonight render unchanged.

Risks / notes:

- `OnboardingStepLayout`, `useOnboardingFlow`, and `<Orb>`-in-onboarding are not yet
  wired into any live screen — they land in `phase-1a-live-flow`. They typecheck +
  lint but have no on-device coverage yet.
- The smoke test's old G7–G12 panel assertions still describe the 3-panel carousel;
  they stay valid this slice (no flow change) but must be rewritten when the carousel
  is replaced (`phase-1a-checks-polish`).

Manual QA still recommended (device; not run in this headless slice):

- `BabySetupScreen` (Supabase `needs-setup` build): confirm the role pills read clearly
  in day + night and selection still drives the brand color.
- Tonight: confirm `OrbHero` (calm/feed/sleep/diaper, day + night, progress ring) looks
  identical to before the `<Orb>` extraction, incl. the theme reveal.

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

`phase-1a-setup-foundation` is complete and committed. Move to `phase-1a-live-flow`:
rebuild `OnboardingScreen` on `OnboardingStepLayout` + `<Orb>` driven by
`useOnboardingFlow`, add the one-thumb age + optional name controls, wire completion
to `useAuth().createLocalBaby` with the §11 ordering (write baby → clear local events
→ mark complete → reveal), kill the fake `ONBOARDING_COMPLETING_LABEL`, and resolve
night at entry. This is the first user-visible flow change, so verify on device in
day + night; expect to rewrite the old carousel smoke assertions (G7–G12) — that
cleanup is scoped to `phase-1a-checks-polish`.

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
