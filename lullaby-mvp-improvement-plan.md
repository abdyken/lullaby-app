# Lullaby Demo MVP Improvement Plan

## Context

The current **demo MVP is considered ready for a basic product demo**, but the app flow can be made clearer.

The goal of this improvement plan is **not to redesign the app**.  
The current visual design, layout language, colors, spacing, typography, tab bar, and overall aesthetic should stay intact.

The improvement target is only the **product logic and user flow**:

> A tired parent opens the app at night, understands what is happening, logs an event in 1–2 taps, sees the night history, and wakes up with a calm recap.

The uploaded `hush-baby-tracker.html` reference is useful mainly because of its interaction model:

- one-tap quick logging
- sleep / awake state
- bottom sheet event entry
- timeline of logged events
- toast confirmation with undo
- simple recap/insight structure

Do **not** copy its visual style.

---

## Product Principle

Lullaby should feel like:

> A calm night companion for newborn tracking.

Not like:

> A medical app, analytics dashboard, or complex baby-management system.

The MVP should stay focused on the newborn night shift.

---

## Current MVP Status

The demo MVP already has the core structure:

- `Tonight`
- `Log`
- `Reassure`
- custom floating tab bar
- safe-area handling
- non-diagnostic reassurance copy
- demo-ready screens

The next improvement should make the app feel more functional and understandable without expanding the scope too much.

---

# Improvement Roadmap

## Phase 1 — Make Tonight the Main Night Control Screen

### Goal

The `Tonight` screen should immediately answer:

- Is the baby currently awake or asleep?
- When was the last feed?
- When was the last diaper change?
- What has happened tonight?
- What should the parent tap next?

### Add

A current-night status block:

```text
Baby is awake
Awake for 1h 24m
Last feed: 2h 45m ago
Last diaper: 1h 10m ago
```

Or, if sleeping:

```text
Baby is sleeping
Sleeping for 42m
Started at 2:14 AM
```

### Add Sleep State Button

The sleep button should be stateful:

```text
Start sleep
```

After tapping:

```text
Baby woke up
```

When the user taps `Baby woke up`, the app should save a completed sleep event.

### Acceptance Criteria

- `Tonight` shows the current baby state.
- `Start sleep` changes the state to sleeping.
- `Baby woke up` ends the sleep session.
- Completed sleep session appears in the timeline.
- No medical claims or predictions are shown.

---

## Phase 2 — Add Quick Log Actions

### Goal

The parent should be able to log common night events with minimal thinking.

### Add Quick Actions

Add 3–4 quick log buttons:

```text
Feed
Diaper
Sleep
Note
```

Recommended MVP set:

- `Feed`
- `Diaper`
- `Note`
- Sleep handled by the main state button

Optional later:

- `Pump`
- `Medicine`
- `Temperature`

Do not add these in the demo MVP unless absolutely needed.

### Acceptance Criteria

- Quick actions are reachable from `Tonight`.
- Buttons are large enough for night use.
- Flow works one-handed.
- No heavy form is shown immediately after tapping.

---

## Phase 3 — Use Bottom Sheet for Event Logging

### Goal

Logging should feel lightweight, not like filling out a form.

When the user taps a quick action, open a bottom sheet.

---

### Feed Sheet

```text
Log a feed
Just now

[ Bottle ] [ Left ] [ Right ]

Amount / duration selector

[ Save feed ]
```

Possible fields:

- type: `Bottle | Left | Right`
- amount: optional, for bottle
- duration: optional, for nursing
- timestamp: default to now

---

### Diaper Sheet

```text
Log a diaper
Just now

[ Wet ] [ Dirty ] [ Mixed ]

[ Save diaper ]
```

Possible fields:

- type: `Wet | Dirty | Mixed`
- optional note

---

### Note Sheet

```text
Add a note
Just now

[ Fussy ] [ Cried ] [ Settled ] [ Custom ]

[ Save note ]
```

Possible fields:

- preset note
- custom note text

---

### Acceptance Criteria

- Bottom sheet opens from quick actions.
- Bottom sheet closes after save.
- User can dismiss it.
- Saved event appears in the timeline.
- TypeScript remains clean.
- No design system changes are introduced.

---

## Phase 4 — Add Toast Confirmation + Undo

### Goal

The user should feel safe after saving an event.

After saving:

```text
Feed logged · Undo
```

For diaper:

```text
Diaper logged · Undo
```

For note:

```text
Note saved · Undo
```

For sleep:

```text
Sleep logged · Undo
```

### Undo Behavior

Undo should remove the last saved event.

For MVP, it is acceptable if Undo only works for the most recent event.

### Acceptance Criteria

- Toast appears after saving.
- Toast disappears automatically after a short delay.
- Undo removes the saved event.
- The timeline updates after Undo.

---

## Phase 5 — Improve Log Screen Timeline

### Goal

The `Log` screen should clearly show that the app remembers the night.

### Timeline Format

```text
3:12 AM · Feed · Bottle · 90 ml
2:40 AM · Diaper · Wet
1:15 AM · Sleep · 1h 25m
11:50 PM · Sleep started
```

### Sorting

Newest events should appear first.

### Empty State

If there are no events:

```text
No logs yet tonight.
Start with a feed, diaper change, or sleep.
```

### Acceptance Criteria

- New events appear immediately.
- Timeline is sorted newest first.
- Empty state is calm and helpful.
- Timeline does not overlap the floating tab bar.

---

## Phase 6 — Make Reassure a Calm Morning Recap

### Goal

`Reassure` should use the logged night data, but stay non-medical.

It should not diagnose, predict, or tell the parent that everything is definitely fine.

### Good Copy

```text
Here’s what you logged tonight:

3 feeds
2 diaper changes
Longest sleep stretch: 2h 40m

Newborn nights can vary. If something feels unusual, urgent, or worrying, contact your pediatrician or local emergency care.
```

### Avoid

```text
Your baby is healthy.
This is normal.
No need to worry.
The app detected nothing concerning.
```

### Acceptance Criteria

- Reassure uses real logged events.
- If no events exist, it shows an empty recap state.
- Copy remains bounded and non-diagnostic.
- Safety disclaimer remains visible.
- No medical recommendations are generated.

---

## Phase 7 — Add Local Persistence

### Goal

Events should not disappear after app reload or restart.

For demo MVP, use local persistence only.

Recommended:

- `AsyncStorage`
- local app state
- no Supabase yet
- no authentication yet

### Suggested Data Model

```ts
export type NightEventType =
  | 'feed'
  | 'diaper'
  | 'sleep_start'
  | 'sleep_end'
  | 'note';

export type NightEvent = {
  id: string;
  type: NightEventType;
  timestamp: string;
  details?: {
    label?: string;
    amountMl?: number;
    durationMin?: number;
    note?: string;
  };
};
```

### Suggested State

```ts
export type NightState = {
  babyStatus: 'awake' | 'sleeping';
  activeSleepStartedAt?: string;
  events: NightEvent[];
};
```

### Acceptance Criteria

- Events persist after app reload.
- App handles empty storage safely.
- Undo updates storage.
- State restoration does not break the UI.
- TypeScript remains clean.

---

## Phase 8 — Demo Polish

### Goal

Make the improved MVP feel stable during a live demo.

### Checklist

- All screens respect safe area.
- Floating tab bar does not cover content.
- All buttons are tappable.
- Bottom sheet works on small screens.
- Empty states are ready.
- Undo does not break state.
- Reassure copy stays safe.
- Timeline works with no events and many events.
- App can be reset for a fresh demo.

### Optional Dev-Only Feature

Add a hidden or development-only button:

```text
Reset demo night
```

This should clear local events and reset baby state.

---

# Recommended Implementation Order

## Step 1

Add shared local night state.

```text
NightState
NightEvent
addEvent()
undoLastEvent()
startSleep()
endSleep()
```

## Step 2

Update `Tonight`.

Add:

- current baby status
- sleep state button
- last feed / diaper / sleep summaries
- quick log buttons

## Step 3

Add bottom sheet.

Support:

- Feed
- Diaper
- Note

## Step 4

Add timeline.

Show recent events on `Tonight`.

Show full list on `Log`.

## Step 5

Update `Reassure`.

Generate calm recap from local events.

## Step 6

Add persistence.

Use AsyncStorage or the existing local storage approach in the project.

## Step 7

Run checks.

```bash
npm run check:local-interactions
npx tsc --noEmit
npm run lint
```

---

# Non-Goals for This MVP Pass

Do not add:

- Growth screen
- WHO percentiles
- milestones
- charts
- AI insights
- medical suggestions
- prediction engine
- account system
- auth
- Supabase
- partner sync
- push notifications
- complex onboarding
- multi-baby profiles

These can be considered later after the night logging loop feels excellent.

---

# Final Target Flow

The improved MVP should support this simple flow:

```text
Parent opens app at night
→ sees Tonight status
→ taps Feed / Diaper / Note / Start sleep
→ event is saved through bottom sheet
→ event appears in timeline
→ app remembers the night
→ Reassure gives a calm morning recap
```

This is the ideal demo story:

> Track the night. Wake up clear.

---

# Implementation Guardrails

## Do Not Change

- visual design direction
- tab bar design
- typography system
- screen structure unless necessary
- current safe-area wrapper
- existing reassurance safety tone

## Allowed Changes

- state logic
- event data model
- bottom sheet interaction
- quick log actions
- timeline rendering
- local persistence
- recap generation

## Safety Rule

All user-facing text must avoid diagnosis.

Use phrases like:

```text
Based on what you logged...
Here’s a calm recap...
Patterns can vary...
Contact your pediatrician if something feels unusual or urgent.
```

Avoid phrases like:

```text
This is normal.
Your baby is fine.
No medical concern detected.
The app recommends...
```

---

# Suggested Prompt for Implementation Agent

Use this prompt if handing the task to Claude, Codex, or another coding agent:

```text
We have a demo MVP mobile app called Lullaby. The design must not be changed. Do not redesign screens, colors, typography, or the tab bar.

Improve only the product logic and interaction flow.

Goal:
Make the MVP easier to understand for tired parents at night by adding:
1. A current baby awake/asleep status on the Tonight screen.
2. A stateful sleep button: Start sleep → Baby woke up.
3. Quick log actions for Feed, Diaper, and Note.
4. A bottom sheet for logging Feed / Diaper / Note details.
5. A toast confirmation with Undo.
6. A timeline of events on Log, with recent events also visible on Tonight.
7. A Reassure morning recap generated from logged events.
8. Local persistence for demo use.

Do not add Growth, percentiles, milestones, AI insights, medical predictions, auth, Supabase, partner sync, or push notifications.

All reassurance copy must remain non-diagnostic and safe:
- Do not say “your baby is fine”
- Do not say “this is normal”
- Do not provide medical recommendations
- Include a disclaimer to contact a pediatrician or emergency care if something feels unusual or urgent.

After implementation, run:
npm run check:local-interactions
npx tsc --noEmit
npm run lint

Return a concise summary of changed files, behavior added, and test results.
```
