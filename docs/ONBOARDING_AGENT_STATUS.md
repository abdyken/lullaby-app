# Lullaby Onboarding Agent Status

AUTOPILOT_STATUS: READY
EXPECTED_BRANCH_PATTERN: feat/onboarding-*
RECOMMENDED_IMPLEMENTATION_BRANCH: feat/onboarding-personalized-activation
CURRENT_SLICE_ID: phase-0b
CURRENT_SLICE_NAME: Phase 0b - Local baby creation
NEXT_SLICE_ID: phase-1a-setup-foundation
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

### phase-0b - Local baby creation

Goal: add a pure `createLocalBaby` factory plus the persisted local baby/caregiver
store on `AuthProvider`, so onboarding can create a real local baby (not the seed)
with correct seed-clear ordering. Phase 0a already routes every read-site through
`useAuth().baby/caregivers`, so 0b only needs to write that store and persist it.

Roadmap basis:

- Section 11: own + persist the local baby/caregiver in `AuthProvider` (its own
  AsyncStorage key; hydrate on mount); completion ordering = write local baby →
  clear `lullaby/local-events/v1` → mark complete → reveal.
- Section 12: Phase 0b local baby creation (pure factory + store write +
  seed-clear + dev-reset extension; `birthDate` from the age control).
- Section 13: `createLocalBaby(...)` as a small pure factory.

Expected implementation scope:

- `src/state/AuthProvider.tsx` (persisted local baby store + `createLocalBaby`).
- A new pure factory module (e.g. `src/data/localBaby.ts`) for
  `createLocalBaby(inputs) -> {Baby, Caregiver}` + weeks->birthDate.
- Dev-reset extension to also clear the persisted local baby.
- `scripts/check-local-interactions.ts` for the new pure factory + weeks->birthDate
  unit checks.

Acceptance criteria:

- `createLocalBaby` is a pure, smoke-testable factory; weeks->birthDate is covered.
- The local baby/caregiver persists and rehydrates on cold launch.
- Seed remains the fallback when no local baby has been created yet.
- `npx tsc --noEmit`, `npm run check:local-interactions`, and `npm run lint`
  pass before commit.
- Commit is one bounded slice.

## Slice Queue

- [x] `phase-0a` - Active-baby read-site refactor, no behavior change.
- [ ] `phase-0b` - Local baby creation factory, persisted local baby store,
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

`phase-0a` is complete and committed. Move to `phase-0b` (local baby creation)
only if all checks pass and the committed diff stays within scope.

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
