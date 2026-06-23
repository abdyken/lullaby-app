# Lullaby — Insights Tab Implementation Plan

## 1. Goal

Add a new **Insights** tab to the bottom tabbar of the Lullaby app.

The feature should follow the uploaded `preview(2).html` reference:

```text
Today / Insights / Log / Growth / History
```

The Insights screen should help parents understand patterns from existing logs:

- feeding rhythm;
- sleep totals and sleep trend for the last 7 days;
- wake window patterns;
- daily averages for feeds, sleep, and diapers.

This feature must be implemented carefully without breaking the existing logging flows, bottom sheet behavior, Log FAB, theme reveal animation, or current tabbar animation.

---

## 2. Product Requirements

### 2.1 New tabbar item

Add a new bottom tab called:

```text
Insights
```

Position:

```text
Today -> Insights -> Log FAB -> Growth -> History
```

If the current app does not yet have Growth, keep the current app structure but place Insights directly after Today and before the central Log action.

### 2.2 New Insights screen

The screen should include:

```text
Insights
Last 7 days · updated now
```

Main sections:

1. **What we're seeing**
   - feed rhythm insight;
   - sleep insight;
   - wake window insight.

2. **Sleep this week**
   - simple 7-day bar chart;
   - average sleep label.

3. **Stats row**
   - feeds per day;
   - sleep per day;
   - diapers per day.

### 2.3 No medical claims

Insights must be framed as pattern recognition, not medical advice.

Avoid:

```text
healthy
diagnosis
problem
abnormal
medical issue
```

Use safer language:

```text
based on recent logs
steady
recent pattern
not enough data yet
looks consistent with recent days
```

---

## 3. Suggested File Structure

Create:

```text
src/app/(tabs)/insights.tsx
src/features/insights/InsightsScreen.tsx
src/features/insights/insightSelectors.ts
src/features/insights/types.ts
src/features/insights/components/InsightCard.tsx
src/features/insights/components/InsightsSectionCard.tsx
src/features/insights/components/WeeklySleepBars.tsx
src/features/insights/components/InsightStatCard.tsx
```

Optional tests:

```text
src/features/insights/__tests__/insightSelectors.test.ts
```

---

## 4. Implementation Strategy

Implement in small safe steps.

Do not try to build the whole feature in one large pass.

Recommended order:

```text
Task 1: Add navigation route and tabbar item.
Task 2: Build static UI from reference.
Task 3: Add deterministic selectors with real data.
Task 4: Add empty states.
Task 5: Add tests.
Task 6: Run visual QA and theme reveal QA.
```

---

## 5. Task 1 — Navigation Only

### Goal

Add the Insights tab without changing any data logic.

### Steps

1. Create:

```text
src/app/(tabs)/insights.tsx
```

2. Render a temporary screen:

```tsx
export default function InsightsRoute() {
  return <InsightsScreen />;
}
```

3. Create:

```text
src/features/insights/InsightsScreen.tsx
```

Temporary content:

```tsx
export function InsightsScreen() {
  return (
    <View>
      <Text>Insights</Text>
      <Text>Coming soon</Text>
    </View>
  );
}
```

4. Add the tabbar item in:

```text
src/app/(tabs)/_layout.tsx
```

5. Use a chart-style icon if the project already uses an icon library.

Good icon options:

```text
BarChart3
ChartNoAxesColumn
Activity
```

### Important

If the app has a custom tabbar and a theme reveal overlay tabbar, update both.

The new Insights item must appear in both:

```text
base tabbar
theme reveal overlay tabbar
```

Otherwise, theme switching can desync the tabbar.

### Acceptance Criteria

- Insights tab appears in the bottom tabbar.
- Tapping Insights opens the Insights screen.
- Today still works.
- Log FAB still opens the chooser.
- History/Timeline still works.
- Theme reveal animation does not break.

---

## 6. Task 2 — Static UI Matching the Reference

### Goal

Build the visual screen using static mock data first.

Do not wire real calculations yet.

### Screen layout

```text
[Header]
Insights
Last 7 days · updated now

[Card]
What we're seeing

[InsightCard]
🍼 Feed rhythm text
Source label

[InsightCard]
🌙 Sleep pattern text
Source label

[InsightCard]
💡 Wake window text
Source label

[Card]
Sleep this week                    14h 20m avg
7 vertical bars: Mon Tue Wed Thu Fri Sat Sun

[Stats row]
7.2       14h       6.4
Feeds/day Sleep/day Diapers/day
```

### Component Responsibilities

#### `InsightsSectionCard`

Wrapper for white cards.

Props:

```ts
type InsightsSectionCardProps = {
  title: string;
  actionLabel?: string;
  children: React.ReactNode;
};
```

#### `InsightCard`

Small tinted insight row.

Props:

```ts
type InsightCardProps = {
  emoji: string;
  text: React.ReactNode;
  source?: string;
  tone?: 'feed' | 'sleep' | 'diaper' | 'growth' | 'neutral';
};
```

#### `WeeklySleepBars`

Simple chart using React Native `View`.

Props:

```ts
type WeeklySleepBarsProps = {
  days: Array<{
    label: string;
    minutes: number;
  }>;
};
```

Rules:

- no chart dependency;
- each bar is a `View`;
- height is calculated from `minutes / maxMinutes`;
- minimum visible height: 6-8 px;
- labels below bars: Mon, Tue, Wed, Thu, Fri, Sat, Sun.

#### `InsightStatCard`

Small stat card.

Props:

```ts
type InsightStatCardProps = {
  value: string;
  unit?: string;
  label: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'neutral';
};
```

### Styling Notes

Use existing app tokens if available.

Match the reference visual language:

```text
white surface cards
soft shadows
rounded corners
surface-2 tinted insight rows
small uppercase/source labels
indigo sleep bars
warm orange accent for links/highlights
```

Do not introduce a new design system.

Reuse existing theme colors and typography from the app.

### Acceptance Criteria

- Screen visually resembles the reference.
- Static data renders correctly.
- No real selectors are required yet.
- No existing logging flow changes.

---

## 7. Task 3 — Real Data Selectors

### Goal

Replace mock data with deterministic insights based on local logging/timeline events.

Create:

```text
src/features/insights/insightSelectors.ts
```

### Suggested View Model

```ts
export type InsightsViewModel = {
  updatedAt: number;
  hasEnoughData: boolean;
  dataDays: number;

  cards: Array<{
    id: string;
    emoji: string;
    text: string;
    source: string;
    tone: 'feed' | 'sleep' | 'diaper' | 'growth' | 'neutral';
  }>;

  weeklySleep: Array<{
    date: string;
    label: string;
    minutes: number;
  }>;

  stats: {
    feedsPerDay: {
      value: string;
      label: string;
      delta?: string;
      deltaTone?: 'up' | 'down' | 'neutral';
    };
    sleepPerDay: {
      value: string;
      unit?: string;
      label: string;
      delta?: string;
      deltaTone?: 'up' | 'down' | 'neutral';
    };
    diapersPerDay: {
      value: string;
      label: string;
      delta?: string;
      deltaTone?: 'up' | 'down' | 'neutral';
    };
  };
};
```

### Input Data

Use the existing logging/timeline state.

Look for existing selectors such as:

```text
timelineSelectors.ts
v2TimelineEntries
v2QuickLogMeta
```

Do not duplicate event parsing if a timeline selector already normalizes events.

### Date Window

Insights should use:

```text
last 7 calendar days including today
```

Use local time boundaries.

Suggested helpers:

```ts
startOfLocalDay(timestamp)
endOfLocalDay(timestamp)
getLast7LocalDays(now)
```

Avoid UTC-only grouping unless the rest of the app already uses UTC.

---

## 8. Selector Calculations

### 8.1 Feed rhythm

Input:

```text
feed events from the last 7 days
```

Calculation:

1. Sort feed events by start/completion time.
2. Calculate intervals between consecutive feed events.
3. Average the intervals.
4. Format the result as:

```text
2h 45m
```

Example insight:

```text
Feeds are settling into a 2h 45m rhythm based on recent logs.
```

Source examples:

```text
From 38 feeds this week
Based on 12 recent feeds
Not enough feed history yet
```

Minimum useful data:

```text
at least 3 feed events
```

Fallback:

```text
Log a few more feeds to see feeding rhythm.
```

---

### 8.2 Sleep this week

Input:

```text
sleep events from the last 7 days
```

Calculation:

1. Group sleep sessions by local day.
2. Sum sleep minutes per day.
3. Calculate average daily sleep minutes.
4. Find longest sleep stretch.

Display:

```text
Sleep this week
14h 20m avg
```

Bar chart:

```text
Mon Tue Wed Thu Fri Sat Sun
```

Bar value:

```text
daySleepMinutes / maxSleepMinutes
```

Minimum useful data:

```text
at least 1 sleep event
```

Fallback:

```text
No sleep logged yet this week.
```

---

### 8.3 Wake windows

Input:

```text
sleep sessions from the last 7 days
```

Calculation:

A wake window is the gap between:

```text
previous sleep end -> next sleep start
```

Steps:

1. Sort sleep sessions by start time.
2. For each pair of consecutive sleep sessions:
   - previous endedAt;
   - next startedAt;
   - gap = next.startedAt - previous.endedAt.
3. Ignore impossible values:
   - negative gaps;
   - very long gaps over 8-10 hours if needed.
4. Average the valid gaps.

Example insight:

```text
Wake windows are around 2h based on recent sleep times.
```

Minimum useful data:

```text
at least 2 completed sleep sessions
```

Fallback:

```text
More completed sleeps are needed to estimate wake windows.
```

---

### 8.4 Diapers per day

Input:

```text
diaper events from the last 7 days
```

Calculation:

```text
diaper count / active data days
```

Prefer active data days over always dividing by 7 if the user only has 1-2 days of logs.

Example:

```text
6.4 diapers/day
```

Delta:

```text
steady
```

Avoid medical interpretation.

---

### 8.5 Feeds per day

Input:

```text
feed events from the last 7 days
```

Calculation:

```text
feed count / active data days
```

Display:

```text
7.2 feeds/day
```

---

### 8.6 Sleep per day

Input:

```text
sleep events from the last 7 days
```

Calculation:

```text
total sleep minutes / active data days
```

Display:

```text
14h sleep/day
```

---

## 9. Empty States

The screen must work with little or no data.

### 0 events

Show:

```text
Insights
Last 7 days

Start logging for a few days and Insights will appear here.
```

Also show disabled/empty cards:

```text
Feed rhythm
Sleep this week
Wake windows
```

### 1 day of data

Show:

```text
Today is your first day of logs. Keep logging to unlock weekly insights.
```

Still show basic stats from today.

### 2-3 days of data

Show:

```text
Early patterns
```

Use cautious wording:

```text
based on the first few days
```

### 4-7 days of data

Show the full Insights layout.

---

## 10. Data Safety and Performance

### Do

- Use memoized selectors where appropriate.
- Keep calculations local and deterministic.
- Recalculate only when logging state changes.
- Use display formatting helpers for durations.
- Keep all calculations read-only.

### Do not

- Write to storage from Insights.
- Create timers inside Insights unless absolutely needed for an "updated now" label.
- Add a chart library for simple bars.
- Add AI-generated medical advice.
- Dispatch provider updates from the Insights screen.
- Change logging flow event shapes unless required and reviewed.

---

## 11. Theme and Design Requirements

The Insights screen must support:

```text
light mode
dark mode
theme reveal transition
small mobile screens
web preview
Android
iOS
```

If theme reveal overlay uses cloned tabbar content, the Insights tab must be included there too.

Visual rules:

- no native Android elevation in masked overlay tabbar if the app currently avoids it;
- no debug borders;
- no temporary hardcoded bright colors;
- use existing theme palette.

---

## 12. Testing Plan

### Unit tests for selectors

Create tests for:

```text
no events
one day of events
feed rhythm with multiple feeds
sleep weekly grouping
wake window calculation
diapers per day
mixed events
events outside the 7-day window
events crossing midnight
```

### Example test cases

#### No events

Expected:

```text
hasEnoughData = false
cards show fallback text
weeklySleep has 7 days with 0 minutes
stats are 0 or empty-state friendly
```

#### Feed rhythm

Events:

```text
08:00 feed
10:30 feed
13:00 feed
```

Expected rhythm:

```text
2h 30m
```

#### Sleep grouping

Events:

```text
Mon 10:00-11:00
Mon 14:00-15:30
Tue 09:00-10:00
```

Expected:

```text
Mon = 150 minutes
Tue = 60 minutes
```

#### Wake windows

Sleep sessions:

```text
08:00-09:00
11:00-12:00
14:30-15:00
```

Wake windows:

```text
2h
2h 30m
```

Average:

```text
2h 15m
```

---

## 13. Manual QA Checklist

Run:

```bash
EXPO_PUBLIC_LOGGING_V2=1 npx expo start --clear
```

Check:

```text
[ ] Insights tab appears in bottom tabbar.
[ ] Insights is placed after Today.
[ ] Central Log FAB still opens chooser.
[ ] Today screen still opens all logging sheets.
[ ] Feed flow still works.
[ ] Sleep flow still works.
[ ] Diaper flow still works.
[ ] Pump flow still works.
[ ] Timeline/History still works.
[ ] Theme toggle reveal still covers the tabbar correctly.
[ ] Switching tabs has no black flicker.
[ ] Insights screen scrolls correctly.
[ ] Weekly sleep bars fit on small screens.
[ ] Empty state works with fresh storage.
[ ] Real data appears after creating logs.
[ ] Lint passes.
[ ] Tests pass if added.
```

---

## 14. Suggested Claude Agent Prompt

```text
Implement the Insights tab based on `.reference/preview(2).html`.

Goal:
Add a new Insights screen to the bottom tabbar. The reference shows the tabbar order as Today / Insights / Log / Growth / History. The Insights screen includes:
- Header: Insights
- Subtitle: Last 7 days · updated ...
- Card: What we're seeing
- Three insight cards: feed rhythm, sleep pattern, wake windows
- Card: Sleep this week with a simple 7-day bar chart
- Bottom stat row: feeds/day, sleep/day, diapers/day

Important constraints:
- Do not modify existing logging flows unless required for read-only data access.
- Do not break Today, Log FAB, History/Timeline, bottom sheets, or theme reveal animation.
- If the tabbar has a reveal overlay clone, update the base tabbar and the overlay tabbar together.
- Start with static UI matching the reference, then wire real deterministic data from existing logging/timeline state.
- Use React Native Views for the bar chart. Do not add a chart dependency.
- Insights must be local deterministic pattern recognition, not medical advice.
- Avoid medical claims like healthy/abnormal/problem/diagnosis.

Suggested files:
- `src/app/(tabs)/insights.tsx`
- `src/features/insights/InsightsScreen.tsx`
- `src/features/insights/components/InsightCard.tsx`
- `src/features/insights/components/InsightsSectionCard.tsx`
- `src/features/insights/components/WeeklySleepBars.tsx`
- `src/features/insights/components/InsightStatCard.tsx`
- `src/features/insights/insightSelectors.ts`
- `src/features/insights/types.ts`
- optional: `src/features/insights/__tests__/insightSelectors.test.ts`

Data requirements:
- Use last 7 local calendar days including today.
- Calculate feed rhythm from intervals between feed events.
- Calculate sleep average and longest stretch from sleep sessions.
- Calculate wake windows from gaps between completed sleeps.
- Calculate feeds/day, sleep/day, and diapers/day.
- Add empty states for 0 events, 1 day, 2-3 days, and full 7-day data.

Implementation order:
1. Add route and tabbar item.
2. Build static UI matching the reference.
3. Add real selectors.
4. Add empty states.
5. Add selector tests.
6. Run visual QA.

Verification:
- Run lint.
- Run tests if available.
- Run:
  `EXPO_PUBLIC_LOGGING_V2=1 npx expo start --clear`
- Verify tabbar order and behavior.
- Verify Log FAB still opens chooser.
- Verify existing logging flows still work.
- Verify theme reveal animation does not desync the new tabbar item.
- Verify Insights works with empty storage and with real logs.

Report back:
- files changed
- UI implemented
- selectors implemented
- empty states implemented
- tests/lint result
- manual visual QA result
```

---

## 15. Definition of Done

The feature is done when:

```text
[ ] Insights tab exists and is reachable from bottom tabbar.
[ ] Screen visually follows the uploaded HTML reference.
[ ] Static mock data has been replaced with real local logging data.
[ ] Empty states work.
[ ] Selector calculations are tested or manually verified.
[ ] Existing logging flows are unchanged.
[ ] Theme reveal animation still works.
[ ] Log FAB still works.
[ ] Lint passes.
[ ] App runs successfully with EXPO_PUBLIC_LOGGING_V2=1.
```
