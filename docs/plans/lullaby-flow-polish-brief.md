# Lullaby — User Flow Polish Brief (Quick Log + Log Sheets)

## Role
You are a senior React Native / Expo engineer and product designer for Lullaby.

## What this is about
This is **not** an animation task and **not** a motion showcase. The goal is to
cut friction on the one flow that matters most before App Store submission: an
exhausted parent, one hand, in the dark, logging a care event as fast as
possible.

The one principle worth taking from Chris Raroque's "make apps feel 10x better"
video: **improve ergonomics and remove steps.** Motion, if any, only ever
*confirms* an action — it never decorates.

## Scope for THIS pass
Two flows only:
1. **Quick log** — Home/Tonight → event saved.
2. **Log sheets** — Feed / Sleep / Diaper / Pump.

Do NOT touch Insights, Reassure, onboarding, or auth in this pass.

## The target metric
Report **taps-from-Home-to-saved** for each event type, before and after. Aim
for a single tap on the common case wherever it's safe to prefill.

## Step 1 — Inspect first (do NOT code yet)
Read and map before proposing anything:
- Home/Tonight quick-log components
- Feed / Sleep / Diaper / Pump sheet components
- the save path / logging v2 handlers (read-only — understand, don't change)
- current defaults for time / amount / type
- keyboard + focus handling in each sheet
- theme tokens, existing press-feedback and haptics utilities

Then produce a short diagnosis + plan and **stop for my review**.

## What to look for (flow friction)
- **Smart defaults.** Prefill time = now. Prefill last-used values (last bottle
  amount, last diaper type, etc.) so the common case needs near-zero input.
- **Taps audit.** Count every required tap between intent and "saved." Kill the
  avoidable ones.
- **Autofocus.** Primary input focused and keyboard up on sheet open, so there's
  no extra tap to start typing.
- **Thumb reach.** Save / start-timer reachable one-handed at the bottom.
  Nothing critical stranded at the top of the screen.
- **Save always reachable.** Never hidden behind the keyboard or a scroll.
- **Active timer clarity.** Running sleep/feed state is obvious; stopping
  auto-fills duration; no re-entering data.
- **One hand, dark.** Readable and tappable in night theme with large targets.

## Motion — minimal, only as confirmation
- **Press feedback:** opacity-first (0.82–0.9) or tint. No layout resize, no
  bounce. ~120–180ms.
- **Save confirmation:** one soft, one-time acknowledgment of the created item.
  No confetti, no loud success state.
- Nothing ambient. No shimmer, no glow, no orbs.

## Hard guardrails
- **Zero business-logic changes.** No changes to logging v2 handlers, data
  shape, or save semantics.
- No API contract changes.
- Do not touch auth / onboarding gates, RevenueCat / pro flags, or Reassure
  caching / spend guardrails.
- **Keep all 414 smoke tests green.** If a change would touch a tested
  assertion, stop and ask.
- No new dependencies. Use the existing animation stack (Reanimated / Animated)
  and the existing haptics util.
- Respect reduced motion if present. No information conveyed by motion alone.
- **Never make logging slower.** Speed is the entire point.

## Deliverables (in order)
1. **Flow diagnosis:** current taps-to-save per event type, where the friction
   is, what already works well.
2. **Flow fix plan:** the specific step-cuts and defaults, ranked by impact.
   Smallest high-value set first — do not try to fix everything.
3. **Wait for my go-ahead.**
4. **Implement** in small, reversible commits, one flow at a time — quick log
   first, then the sheets.
5. **Report:** files changed, taps before/after, what you intentionally left
   alone, how to test on Android / Expo Go, risks.

## QA before you call it done
- `npm run lint`
- `npx tsc --noEmit`
- full smoke suite green (414)
- Manual on Android / Expo Go: fresh user, user with no baby, user with baby but
  no logs, active sleep/feed timer, save Feed/Sleep/Diaper/Pump, open + close
  each sheet, night theme, one-handed reach, no layout jump on press.

Be opinionated. Pick the smallest set of step-cuts that makes the night path
feel obviously faster. If a smaller change is safer, propose the smaller change.
