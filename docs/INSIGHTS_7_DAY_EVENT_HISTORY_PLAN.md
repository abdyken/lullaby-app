# Insights 7-Day Event History Access Plan

## Context

This task belongs to the Lullaby mobile app.

Current product direction:

- Lullaby already has logging flows for Feed, Sleep, Diaper, and Pump.
- The next major feature area is Insights.
- Insights will need access to recent logging history, but this task is only a safe read-only data foundation.
- The current branch should only add 7-day event history access.
- This task must not change existing logging behavior, storage writes, event shapes, or UI design.

This plan is intentionally narrow. It is a guardrail document for implementation agents so they do not accidentally expand scope into Insights UI, tabbar changes, storage schema changes, or logging flow rewrites.

## Task

Add read-only 7-day event history access for Insights without changing logging flows, event shapes, storage writes, or UI design.

## Goal

Create a small selector/helper layer that future Insights code can use to read the last 7 days of existing logging events.

The result should allow future code to ask:

```ts
const history = selectInsightsSevenDayHistory(state, nowMs);
```

or an equivalent project-appropriate selector name.

The selector/helper should return existing event or timeline data derived from the current logging state. It should not create a new persisted model.

## Non-Goals

This task does not implement Insights UI.

Do not:

- add an Insights tab
- add an Insights screen design
- change tabbar behavior
- change Feed UI
- change Sleep UI
- change Diaper UI
- change Pump UI
- change quick log behavior
- change event creation behavior
- change active timer behavior
- change local storage writes
- change stored event shapes
- add migrations
- normalize historical events
- rewrite logging state architecture

## Hard Constraints

The implementation must be read-only.

Do not change:

- logging flows
- event shapes
- reducer actions
- provider write behavior
- persistence schema
- storage write paths
- UI layout
- visual design
- existing timeline behavior
- local interaction behavior

The selector/helper must not:

- dispatch actions
- mutate input state
- mutate event arrays
- write to storage
- change timestamps
- change event payloads
- create new persisted records

## Files to Inspect First

Before implementing, inspect the existing logging data flow.

Likely relevant files:

```txt
src/features/logging/state/timelineSelectors.ts
src/features/logging/state/*
src/features/logging/*
src/app/(tabs)/index.tsx
```

Also inspect any existing tests for:

```txt
timelineSelectors
logging state
local interactions
```

Use the existing timeline/state layer as the source of truth if possible.

## Preferred Architecture

Prefer adding a small read-only selector/helper near the existing logging selector layer.

Good options:

```txt
src/features/logging/state/insightsSelectors.ts
```

or, if the project already keeps timeline-derived selectors together:

```txt
src/features/logging/state/timelineSelectors.ts
```

Recommended export names:

```ts
export const INSIGHTS_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function selectInsightsSevenDayHistory(state: LoggingState, nowMs = Date.now()) {
  // implementation
}
```

Use actual existing project types instead of inventing new ones.

If the existing project already has an app/root state selector convention, follow it.

## Data Source Rule

Prefer deriving from existing timeline selectors rather than reading storage directly.

Good:

```ts
const entries = selectTimelineEntries(state);
```

Avoid:

```ts
AsyncStorage.getItem(...)
```

Reason:

- timeline selectors are already the app's read model
- Insights should not introduce a second source of truth
- storage access would make the feature harder to test
- direct storage reads increase the risk of schema coupling

## Filtering Rules

The selector should return entries whose relevant timestamp is inside this window:

```ts
const fromMs = nowMs - INSIGHTS_HISTORY_WINDOW_MS;
const toMs = nowMs;
```

Include entries where:

```ts
timestamp >= fromMs && timestamp <= toMs
```

Exclude:

- entries older than 7 days
- future entries, if the timestamp is greater than `nowMs`
- entries without a usable timestamp, unless the existing timeline convention already handles them

Do not modify the returned event content.

## Timestamp Rule

Use the timestamp already used by the existing timeline.

Do not invent a new timestamp priority unless the existing events require it.

If timeline entries already expose a display/sort timestamp, use that.

If existing event types vary, create a tiny internal helper only if needed:

```ts
function getEntryTimestampMs(entry: ExistingTimelineEntry): number | null {
  // use existing timestamp conventions only
}
```

Keep it private unless there is a strong reason to export it.

## Ordering Rule

Preserve the existing ordering from the timeline selector unless the codebase already has a clear convention for history selectors.

Do not sort differently just for Insights in this task.

If the timeline currently returns newest-first, keep newest-first.

If the timeline currently returns oldest-first, keep oldest-first.

## Type Rule

Reuse existing types.

Preferred:

```ts
ExistingTimelineEntry[]
```

or whatever the current project already uses.

Avoid introducing a new public event model such as:

```ts
type InsightEvent = ...
```

unless absolutely necessary.

If a derived type is necessary, make it clearly read-only and non-persisted:

```ts
type InsightsHistoryEntry = ExistingTimelineEntry;
```

## Test Plan

Add focused tests only for the selector/helper.

Test cases:

1. Empty state returns an empty array.
2. Events inside the last 7 days are included.
3. Events older than 7 days are excluded.
4. Future events are excluded.
5. Boundary event at exactly `nowMs - 7 days` is included.
6. Boundary event at exactly `nowMs` is included.
7. Input state/arrays are not mutated.
8. Returned entries preserve existing shape.

Use deterministic `nowMs` in tests.

Example:

```ts
const nowMs = new Date("2026-06-23T10:00:00.000Z").getTime();
```

Do not rely on real `Date.now()` in tests.

## Suggested Implementation Steps

### Step 1: Inspect existing selectors

Find the selector currently used to build timeline entries.

Confirm:

- where logging events live in state
- how timeline entries are derived
- what timestamp field powers timeline ordering
- what type is returned
- whether selector tests already exist

### Step 2: Add history window constant

Add:

```ts
export const INSIGHTS_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
```

Keep it near the Insights selector/helper.

### Step 3: Add read-only selector/helper

Add a selector that:

- accepts state
- accepts optional `nowMs`
- gets existing timeline entries/events
- filters to the 7-day window
- returns filtered entries
- does not mutate anything

### Step 4: Add tests

Add minimal tests near existing selector tests.

Do not add broad UI tests for this task.

### Step 5: Run checks

Run the normal project checks.

## Verification Commands

Run:

```bash
npm run lint
npx tsc --noEmit
```

If available:

```bash
npm run check:local-interactions
```

If selector tests exist, run targeted tests.

Examples:

```bash
npm test -- timelineSelectors
npm test -- insightsSelectors
npx jest insightsSelectors
```

Use the command that matches the project setup.

## Expected Diff

Expected small diff:

```txt
docs/INSIGHTS_7_DAY_EVENT_HISTORY_PLAN.md
src/features/logging/state/insightsSelectors.ts
src/features/logging/state/__tests__/insightsSelectors.test.ts
```

Alternative acceptable diff:

```txt
docs/INSIGHTS_7_DAY_EVENT_HISTORY_PLAN.md
src/features/logging/state/timelineSelectors.ts
src/features/logging/state/__tests__/timelineSelectors.test.ts
```

The exact file names can differ if the repository already has a clearer convention.

## Acceptance Criteria

This task is complete when:

- a read-only 7-day history selector/helper exists
- the selector is deterministic with `nowMs`
- the selector reuses existing logging/timeline data
- events older than 7 days are excluded
- future events are excluded if possible
- tests cover the filtering behavior
- `npm run lint` passes
- `npx tsc --noEmit` passes
- `npm run check:local-interactions` passes if available
- no UI changed
- no logging flows changed
- no event shapes changed
- no storage writes changed

## Final Report Format

When implementation is done, report:

```txt
Branch:
<current branch>

Files changed:
- ...

Selector/helper added:
- ...

What changed:
- ...

What did not change:
- logging flows unchanged
- event shapes unchanged
- storage writes unchanged
- UI unchanged

Checks:
- npm run lint: pass/fail
- npx tsc --noEmit: pass/fail
- npm run check:local-interactions: pass/fail/not available
- targeted tests: pass/fail/not available
```

## Important Warning

Do not expand this task.

If the implementation requires touching Feed/Sleep/Diaper/Pump UI, event creation, storage writes, or tabbar design, stop and report the blocker instead of making the change.
