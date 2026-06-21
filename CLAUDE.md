# CLAUDE.md

You are working on the Lullaby React Native app.

## Main objective

Implement the main logging system for:
- Feed
- Sleep
- Diaper
- Pump

Use this document as the product and technical source of truth:

- `docs/LULLABY_LOGGING_IMPLEMENTATION_PLAN_EN.md`

## Existing project rule

This is an existing MVP, not a greenfield app.

Do not rewrite the whole app.
Do not redesign unrelated screens.
Preserve the existing app structure where possible.
Refactor only what is necessary to implement the new logging system correctly.

Also use this visual/interaction reference:

- `.reference/preview.html`

This file demonstrates the desired behavior for the four main logging flows:
Feed, Sleep, Diaper, and Pump.
Preserve the existing app design where possible, but use this reference to understand the intended interaction model.

## Product requirements

The final implementation must support:

### Feed

- Breastfeeding flow with left/right side selection.
- Breastfeeding active session with timers.
- Ability to switch sides during a breastfeeding session.
- Bottle flow with volume and milk type.
- Feed events must appear in the timeline.

### Sleep

- Sleep must be a start/stop active session.
- Store `startedAt` and `endedAt`.
- Do not persist ticking counters.
- Calculate elapsed time from timestamps.
- Sleep state must survive app restart.
- Sleep events must appear in the timeline.

### Diaper

- Quick log in two taps.
- Supported values: wet, dirty, both, dry.
- Diaper events must appear in the timeline.
- Advanced details should not block the quick-log path.

### Pump

- Pumping must support side selection: left, right, both.
- Pumping should support timer-based sessions.
- Volume is optional and can be added after stopping.
- Pump belongs primarily to the caregiver/parent, not only to the child.
- Pump events must appear in the timeline.

## Technical rules

- Prefer TypeScript-safe models.
- Prefer timestamp-based timers.
- Keep event models extensible.
- Add tests where the project already has test infrastructure.
- Run available verification commands before completing a task:
  - `npm run typecheck` if available
  - `npm run lint` if available
  - `npm test` if available
- If a command does not exist, document that.
- If a command fails, try to fix the failure.
- If blocked, update the status file with `AUTOPILOT_STATUS: BLOCKED`.

## Git rules

- Work only on the current feature branch.
- Do not push.
- Do not deploy.
- Do not modify production secrets.
- Do not run destructive commands.
- Do not use:
  - `git reset --hard`
  - `git clean -fd`
  - `rm -rf`
  - force push
  - production migration commands
  - deployment commands

## Autopilot rule

When running in autopilot mode:

1. Read the plan.
2. Read the status file.
3. Find the next incomplete task.
4. Complete exactly one logical task.
5. Verify it.
6. Commit it.
7. Update the status file.
8. Stop the current turn.

The external autopilot script will call you again for the next task.