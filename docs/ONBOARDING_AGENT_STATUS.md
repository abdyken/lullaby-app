# Lullaby Onboarding Agent Status

AUTOPILOT_STATUS: READY
EXPECTED_BRANCH_PATTERN: feat/onboarding-*
RECOMMENDED_IMPLEMENTATION_BRANCH: feat/onboarding-personalized-activation
CURRENT_SLICE_ID: phase-0a
CURRENT_SLICE_NAME: Phase 0a - Active-baby read-site refactor
NEXT_SLICE_ID: phase-0b
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

### phase-0a - Active-baby read-site refactor

Goal: introduce an active local baby/caregiver read path with no user-visible
behavior change, keeping the seed as the fallback.

Roadmap basis:

- Section 11: own local baby/caregiver in `AuthProvider`, above `OnboardingGate`.
- Section 12: Phase 0a active-baby read-site refactor.
- Section 16: first implementation task.

Expected implementation scope:

- `src/state/AuthProvider.tsx`
- `src/data/mock.ts`
- `src/data/localInteractions.ts`
- `src/features/logging/state/LoggingProvider.tsx`
- `src/app/(tabs)/index.tsx`
- `src/app/(tabs)/log.tsx`
- `src/data/currentState.ts`
- `scripts/check-local-interactions.ts` only for focused pure checks if needed.

Acceptance criteria:

- Local-only behavior remains visually unchanged.
- Seed baby/caregiver are fallback values, not the only identity path.
- Existing smoke checks still pass.
- `npx tsc --noEmit`, `npm run check:local-interactions`, and `npm run lint`
  pass before commit.
- Commit is one bounded slice.

## Slice Queue

- [ ] `phase-0a` - Active-baby read-site refactor, no behavior change.
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

- None yet.

## Next Slice

After `phase-0a`, move to `phase-0b` only if all checks pass and the committed
diff stays within scope.

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
