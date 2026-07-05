# Lullaby Onboarding Roadmap

> **How to read this file.** This is a product + UX + technical **roadmap**, not a code change. **No onboarding code is implemented by adopting this document.** Implementation is broken into gated phases (§12); each ships behind the existing `EXPO_PUBLIC_FORCE_ONBOARDING` dev flag and is verified before the next.
> This roadmap was researched against 10+ onboarding references and **stress-tested by three independent review passes — design, product/CEO, and engineering — all verified against the live code** (see §15). Their corrections are integrated throughout.

---

## Context — why this roadmap exists

Lullaby is a local-only P0 baby-care MVP (Expo SDK 56, expo-router, React 19, Reanimated 4 + RN `Animated`, AsyncStorage, optional Supabase). It already has a **working onboarding** — and that is the crux. The current onboarding (`src/components/onboarding/OnboardingScreen.tsx`) is a **3-panel value-prop carousel** (LOG THE NIGHT → WHAT HAPPENED → CALM NEXT STEP) after a ~950ms logo-glow intro. It is beautifully built (staggered `Animated` entries, page dots, skip, reduce-motion) but **passive**: it tells the parent what the app does, personalizes nothing, ends on a *fake* "Setting up…" label, and drops the user onto a Tonight screen seeded with a stranger's baby ("Mia").

The real personalization already exists but is **disconnected**: `src/components/auth/BabySetupScreen.tsx` collects baby name, age, caregiver name/role — only in Supabase `needs-setup` builds, behind the carousel, as a cold form. In the default local-only build, the carousel's "Set up baby" button sets up *no baby at all*; it marks a flag and reveals seeded demo data.

So the opportunity is not "make the carousel prettier." It is to **invert onboarding**: stop pre-selling features and instead set up *their* night in a couple of warm questions, then carry them to the moments that sell themselves — **their first log making the orb come alive**, and tomorrow, **the app having remembered the night for them.** This reverses a recent team decision ("three calm panels"); that reversal is **confirmed (Transform)**, and the morning-recap return loop is scoped to a **local notification** shipped as a separate slice (**Phase 1B**). §16 records the confirmed decisions.

---

## 1. Executive Summary

**Recommendation: evolve onboarding from a passive value carousel into a short, warm, *personalized setup → staged activation* flow, built around the orb and the assets Lullaby already ships.**

Five moves:

1. **Ask the one question they came for, first.** Lead with the baby's **age/birth date** (BabyCenter's A/B: this lifted welcome-screen click-through **29%→70%**) plus an optional **name**. Cut feature slides, the role step, and any "intent quiz" — collecting unused answers is fake personalization, which the brief forbids.
2. **Make the orb the live protagonist of setup, not decoration.** One shared `<Orb>` (extracted from `OrbHero`), one shared breathing driver, **night-resolved at entry**: the **name appears in its core, the age shifts its sky, and it follows the parent home** to become the Tonight orb. The "aha" starts *during* setup, not only after.
3. **Make "complete" mean a real baby exists — owned in the right place.** Onboarding creates a *local* baby/caregiver (no account), owned by **`AuthProvider`'s local-only branch above the gate**, replacing the hardcoded "Mia." The fake "Setting up…" becomes a true action.
4. **Stage activation across two sessions.** Night-1 = first 2-tap log → orb comes alive (the delight). Night-2 = **"it remembered"** — `TonightStatus` answers "when did she last eat?" before the parent asks (the recurring wedge value). The first-log coach points the eye at `TonightStatus`/`HandoffCard`, not just the animation.
5. **Earn the return — tightly scoped.** The app has *no* return trigger today (`expo-notifications` isn't even installed). v1 adds **one** deliberately minimal retention loop: a gentle **morning-recap reminder via a *local* notification** (no backend, no account, no push server), offered as a **double opt-in** (asked in-app *after* the first meaningful log — never on the welcome screen — then the OS prompt only if they say yes), easy to skip, with a graceful **fallback** when notifications are unavailable/denied (the recap still appears in-app on next open). **Feature-flaggable** and shipped as its own slice (**Phase 1B**) so it never bloats the core setup flow. Account, partner-sync, and all other prefs stay deferred and contextual — matching the strategy's local-first, privacy-first, "no paywall before retention" stance.

Target: install → first log in **≈30–45s**, ≤3 taps to the first log, account/notifications deferred. It reuses the design system, `OrbHero`, the gate, the dev flag, and haptics — but the **data-ownership refactor under it is real work** (the seed identity is wired into many files; §12 sequences it safely first).

---

## 2. Current App Audit (what exists in the repo today)

**Stack:** Expo SDK ~56, expo-router (file-based, `typedRoutes`, React Compiler on), React 19.2 / RN 0.85, `react-native-reanimated` 4.3 (tab bar, theme reveal) + RN `Animated` (onboarding, splash), `lottie-react-native`, `expo-linear-gradient`, `expo-haptics`, AsyncStorage, optional `@supabase/supabase-js`. **No `expo-notifications`.** Custom native `modules/expo-circular-reveal`. Scripts: `expo lint`; typecheck via `npx tsc --noEmit` (no script); smoke test `tsx scripts/check-local-interactions.ts`. No Jest.

**Boot & gating chain** (`src/app/(tabs)/_layout.tsx`): `BrandSplashGate` → `RootLayout` (fonts/theme) → `AuthProvider` → `AuthGate` → `OnboardingGate` → `[AuthScreen | BabySetupScreen | tabs]` → `LocalEventProvider` → `LoggingProvider` → tabs. **Critical ordering fact:** `OnboardingGate` mounts **above** `LocalEventProvider`/`LoggingProvider` — the onboarding subtree cannot call `useLocalEvents()`/`useLogging()`. `AuthGate` routes by status: `local-only`/`ready` → app; `needs-setup` → `BabySetupScreen`; `signed-out` → `AuthScreen`; all wrapped by `OnboardingGate`.

**Onboarding (the thing we're improving):** `OnboardingScreen.tsx` (intro → paged `ScrollView` of 3 panels via `usePanelEntry`/`entryStyle`, `PageDots`, Skip, CTA — *still scroll-index driven*, the recorded blank-frame postmortem's exact shape), `onboardingContent.ts` (panels + `ONBOARDING_COMPLETING_LABEL='Setting up...'`), `onboardingStorage.ts` (key `lullaby.onboarding.v1.complete`, `EXPO_PUBLIC_FORCE_ONBOARDING`, dev reset), `OnboardingGate.tsx` (`completeOnboarding` = `markOnboardingComplete` + reveal).

**Personalization that exists (disconnected):** `BabySetupScreen.tsx` collects `displayName`, `role` (mom/dad/other → color), `babyName`, `age in weeks` → `birthDate`, or join `code`. **`RolePicker`, `birthDateFromWeeks`, `parseWeeks` are private/non-exported** in that file — they must be extracted before reuse. Calls `useAuth().completeSetup(...)`, which is **Supabase-only** (`if (!supabase || !session) return;`) — no local path exists today.

**Where "Mia" actually lives (the load-bearing constraint):** `src/data/mock.ts` exports `baby` (Mia), `caregivers`, `babyCaregivers`, `buildSeedEvents()` as **module constants**; the mint helpers `createFeedEvent/createSleepEvent/createDiaperEvent/createPumpEvent/createNoteEvent` **hardcode `babyId: baby.id, caregiverId: caregivers[0].id`**, and `src/data/localInteractions.ts` builds on them. `LoggingProvider.useLoggingActor` (local branch) hardcodes `childId = seedBaby.id`. Tonight (`(tabs)/index.tsx`) does `baby = isSupabase ? remoteBaby : seedBaby` and computes age against a **frozen date `new Date('2026-06-16')`** (latent bug for real birthdates). `LocalEventProvider` holds only `{events, orbView}` (no baby identity) and **persists the seed** to `lullaby/local-events/v1` on first launch. **There is no "active baby" concept in local mode.**

**Design system** (`src/theme/index.ts`): `colors` (cream `#FBF4EF` day bg; event accents feed `#FF7A3D` / sleep `#5560C6` / diaper `#23B79E` / pump `#FFB12E`; mom `#FF9E5E`/dad), `sky` gradients (day/night/dusk), `radii`, warm `shadows`, `surfaces` (day cream / night navy `#191826`), `tabbar`. Fonts Fredoka/Nunito. `ThemeProvider` boots `DEFAULT_MODE='day'`; the auto-by-clock helper `resolveSurfaceMode()` exists but **the reviews disagreed on whether it actually runs at boot** — treat night-at-boot as *unverified* (see §10/§11). Day↔night uses native `expo-circular-reveal`. Reusable: `OrbHero` (+`useOrbBreathe`, breathe ~2750ms half-cycle; SVG orb + sky + progress ring), `Card`, `Screen`, `PrimaryActionButton`, `QuickLogButton`, `ChoicePill`, `TimelineCard`/`TimelineItem`, `BabyHeader`, **`TonightStatus`** (time-since last feed/diaper + sleep), **`HandoffCard`** ("what happened since you last checked"), `AppToast` (undo). Haptics `hapticSave`/`hapticUndo`/`hapticSuccess`. `AuthShell` is already a cream, keyboard-aware, eyebrow/title/subtitle + children + bottom-action scaffold.

**Product loop:** **Tonight** (`(tabs)/index.tsx`) renders, in order: `BabyHeader` → `OrbHero` → **`TonightStatus`** → `QuickLogRow` (Feed/Sleep/Diaper/Pump) → `TimelineCard` → **`HandoffCard`**; currently seeded so it never looks empty. `src/data/currentState.ts` already builds `buildTonightStatus`, `buildHandoffSummary`, and `buildNightRecap`. **Both strategy moats — "time since last feed" and the handoff summary — are already on screen.** **Insights** has graceful day-count empty states (0/1/2–3/4+ days). **Reassure** = safety disclaimer + 5 static cards + the **night recap** (consumed here, not on Tonight), strictly non-diagnostic. The four logging flows match the brief (Sleep/Feed/Pump are timestamp-based active sessions surviving restart; Diaper is two-tap).

**Constraints to respect:** local-only by default (handoff/sync is single-device — do **not** overpromise it); reassurance must stay descriptive/non-medical; recorded **postmortems/gotchas** — blank-frame onboarding (don't drive entry off live scroll index), AsyncStorage rehydration needs cold-launch coverage, theme-reveal double-render (animated copies must share one driver or freeze), Android tappable-bg/borderRadius quirks, SVG-mask draw-reveal antipattern, and LAN/Expo-Go device testing silently fails (use tunnel fallback for QA).

---

## 3. Product Goal

Onboarding must, in priority order:

1. **Set the emotional + trust tone in ~10 seconds** — "this app understands 3am, one hand, half-asleep, and your night stays yours." Calm, honest, not a marketing wall.
2. **Set up *their* night, fast** — create a real (local) baby with age (+ optional name) so the whole app is personal, in ≤2 asked taps.
3. **Deliver the first aha** — carry the parent to their **first log → orb comes alive**.
4. **Set up the second aha and the return** — make tomorrow's "it remembered" inevitable, and offer the one gentle morning-recap nudge that brings them back.
5. **Defer everything else** — account, partner invite, most notifications, units, profiling are introduced *contextually later*, never as first-run walls.

**Non-goals:** feature tours; collecting profile data the app doesn't use; any goal/target number a tired parent could feel judged by; faking real-time sync/handoff; turning into a daytime database or a pregnancy app (born-baby scope for v1).

---

## 4. User Psychology (who, and in what state)

**Primary user:** the birthing/primary parent in the first days–weeks postpartum, often setting up *at night*, one-handed, holding or feeding a baby; physically recovering, emotionally raw, sleep-deprived. **Secondary:** a partner/co-caregiver joining later via invite.

**State during onboarding:** exhausted, anxious ("am I doing this right?"), low bandwidth, low patience, skeptical of "another app/another form," possibly tearful. They didn't open Lullaby to learn software; the night is hard.

**Design implications:**
- **One decision, one thumb, per screen.** Bottom-anchored large targets; keep the keyboard off the critical path.
- **Reassure and earn trust before you ask.** Warmth + one privacy line ("stays on this phone, no account needed") precede the first data field.
- **Honesty over hype.** No exclamation excitement, no anthropomorphized intelligence the app lacks. Calm competence.
- **Forgiving + escapable.** Per-field "Skip for now" *and* an intro-level "Set up later" that drops straight into a working app. Nothing punishes a mistake (Undo already nails this).
- **Fast + interruptible** (baby cries → drop and resume). ≈30–45s.
- **Night-safe.** No bright-white shock at 3am; respect Reduce Motion.

---

## 5. Reference Analysis (10 references)

> Researched from real teardowns, A/B case studies, and design write-ups; cross-checked against the 14-product matrix in `docs/LULLABY_STRATEGY.md`. **Borrow the *pacing & emotion* of wellness apps, the *age/name personalization* of baby apps, and refuse the *quizzes, paywalls, permission walls, and guilt mechanics* of both.** The strongest evidence is the A/B data (flagged ★).

| # | Reference | What it does well | Borrow for Lullaby | Avoid |
|---|---|---|---|---|
| 1 | **BabyCenter** | ★ **"Due date first" on the welcome screen lifted CTR 29%→70% (~13% conv. lift).** One date drives everything. Registration deferred. | **Ask the one defining question (birth date/age) first** — front-loading the *most relevant* ask *raises* completion. | ★ Their **Welcome Tour backfired** (31% vs 42% conversion for skippers). No tours. Reward/notification clutter. |
| 2 | **Huckleberry** | Birth date → instant age-appropriate plan; **SweetSpot** prediction as the hook; activation needs just **one logged sleep**. | Birth date as highest-leverage field; value = something tailored to *this* baby; one log unlocks it. | Heavy paywall gating the core hook; question overload. |
| 3 | **Napper** | Best-in-class **"Guided First Action + Calibrating"**: "log this morning's wake-up" → contextual next nudge → honest **"learning [name]'s rhythm"** state. Dark-mode-first "for dimly lit rooms," one-handed. | The **Calibrating empty state** (honest, not blank/fake-precise) + guided first tap; dark-first, one-thumb. | ~40-step flow forcing account **and** subscription before you see the app. |
| 4 | **Nara Baby** | Near-zero friction to first log; **every field optional/back-fillable** ("save now, enrich later"); research: parents treat logging as *"a grounding, reassurance-building activity."* | **Save-now-enrich-later** for all logging; frame logging itself as calm/reassurance. | Cold "Join your family" framing for sharing — frame the *handoff* emotionally instead. |
| 5 | **Headspace** | ★ Asking **2–3 "what brings you here?" questions before recommending doubled course starts (31%→63%)** ("Perceived Fit"). Removed the mandatory first session; easy-exit intro. | The *principle* that a cheap, **used** question creates relevance + a low-pressure "just looking" escape. **Caveat:** their tweaks moved *starts*, not the daily loop — don't over-invest in a quiz. | Legacy heavy flow (paywall + value slides before doing anything). |
| 6 | **Calm** | "Take a deep breath" + a calming scene *before* any input; **branches deep only on the one urgent goal** (sleep); home "start here" tooltips. | The **sensory-calm opener**; in-context "start here" cue on a never-blank home. | Permission + paywall stacking before any value; quiz payoff hidden behind signup. |
| 7 | **Finch** | Emotional, zero-typing first action (pick a color → egg hatches); **you earn points for answering onboarding itself**; auto-built starter plan (never a blank slate). | A warm, zero-friction first beat that creates *someone you now care for* (the baby/orb) before any logging UI. | Mid-flow "FREE/FREE/FREE" paywall; screen-count bloat. |
| 8 | **Duolingo** | Canonical **value-before-signup** (complete a real lesson, *then* "save your progress"); **streak-freeze as a forgiving safety net, not a reward.** | Defer account until after value; if any commitment, make it gentle/forgiving. | Shame/loss-pressure pushes; early permission stacking; brightness louder than our calm target. |
| 9 | **Flo** | **Reassurance after every answer** ("this is normal") tied to a concrete benefit; primes *why* before each question; easy→sensitive ramp. | The **validate-every-answer microcopy** — turns data entry into care (in our plain voice). | ~32–70 screens; mid-flow notification ask; heavy data appetite. |
| 10 | **Tiimo** | Documented motion doctrine: **"animations guide attention rather than demand it,"** tuned to avoid startle; soft fade/grey state changes; no streak/shame. | The **motion law** verbatim — slow easing, fade not flash — exactly right at 3am. | Early hard paywall; importing planner complexity. |

**Cross-cutting lessons → Lullaby decisions:**
- **First 20s = relief, not a form** (Calm/Finch): one breathing-orb beat + one honest human line + one privacy line.
- **Ask only what's used; defer the rest** (BabyCenter/Headspace/Nara): collect **age (+optional name)**; defer role/account/notifications/units. Completion drops ~10–15% per pre-value screen → **≤3 taps to first log.**
- **Personalization must be real** (Huckleberry/Napper): age drives the orb's sky and (later) age-aware content; name drives the greeting. Nothing collected that isn't immediately used.
- **Never blank; "Calibrating," not fake-precise** (Napper) — the honest empty state *is* the invite.
- **Activation = do-the-thing** (Headspace/Nara/Duolingo): first *log*, not a tour. But onboarding has a **ceiling** — design night-2, not just the quiz.
- **Notifications: never on launch; double opt-in, in-context, after value** — opted-in users ~2× more likely to return.
- **Motion = alive, not performing** (Tiimo): guide attention, fade not flash.
- **Anti-patterns to kill (with receipts):** value carousels, feature tours (BabyCenter −11pts), forced signup, permission/paywall walls, fake "Setting up…", goal numbers, guilt/streaks, blank/fake-empty states, flowery copy.

---

## 6. Proposed Onboarding Concept

**"Your night, set up in two breaths — with the orb you'll live with."**

A warm, near-wordless setup where **the orb is the protagonist, not the backdrop.** One shared `<Orb>` component (extracted from `OrbHero`) appears at the splash logo's position, **resolves to night or day at entry**, and then *responds to each answer*: the baby's **name settles into its core**, the **age shifts its sky** (newborn → night, ~3mo → dusk, 6mo+ → day), and it **follows the parent home** to become the Tonight orb. By the time setup ends, the orb is already *theirs* — the first log simply continues the story. This makes "continuity of the orb" real and buildable (one component + one breathing driver + cross-fade), not an asserted "morph."

It should feel **warm, alive, gentle, premium, emotionally supportive** — and explicitly *not* corporate (no feature grid), *not* childish (no mascot/saturation), *not* overloaded (one idea per screen), *not* dishonest (one privacy line up front; no faked intelligence or sync). The emotional arc: *land softly + "you're in the right place, your night stays yours" → tell us about your baby (orb comes alive) → here is their night, alive and waiting → take one calm action → tomorrow it will have remembered.*

---

## 7. Suggested Onboarding Flow (screen-by-screen)

**Recommended v1 — short, local-first, night-aware, ≤3 taps to first log.** Role, intent-quiz, account, and most notifications are deferred (§8).

**A. Brand splash** *(exists — `BrandSplashGate`).* No change.

**B. Emotional beat — landing (tap-through, NOT auto-advance)** *(1 screen)*
- Purpose: calm + trust before any ask; establish the orb.
- Visual: the shared `<Orb>` fades/scales in at the splash logo's screen position (cross-fade, **night-resolved background** if it's night).
- Headline **Lullaby** · body *A calm place for the night shift.* · a second human line *The hard hours are easier with a little help.*
- Primary **Begin** (no auto-advance — let a tired parent breathe). Secondary **Set up later** → creates a minimal local baby and drops straight to a working Tonight (escape hatch). → C.

**C. Your baby — age + name (the one question they came for)** *(1 screen)*
- Purpose: the single highest-leverage personalization; emotional anchor; orb comes alive.
- **Age (primary):** a **one-thumb coarse control** — *Newborn · A few weeks · A few months* (reuses the `ChoicePill`/`RolePicker` pattern; maps to representative weeks → `birthDate`; exact-weeks field optional/secondary for precision). **No keyboard on the critical path.** On commit, the **orb's sky animates to the age** (~600ms).
- **Name (optional, same screen):** *Who are we caring for?* field "e.g. Mia". On commit, the **name settles into the orb's core**.
- **Trust line (required, small):** *Stays on this phone. No account needed.*
- Primary **Continue** · Secondary **Skip for now** (age → generic; name → "your baby"). → D.

**D. Real handoff into Tonight** *(transition, ~1s)*
- Copy *Getting {name}'s night ready…* (now *true* — writes the local baby/caregiver, clears the seed, marks complete; ordering in §11).
- Motion: the **same orb** stays put and the Tonight sky card builds around it — it literally arrives home. Hold the resolved theme (no flash). → E.

**E. Personalized Tonight + first-log coach (the destination, never blank)**
- `BabyHeader` reads **{name} · {age}**; `OrbHero` calm; `TonightStatus` honestly reads *"None yet"*; timeline empty (no Mia).
- A **Calibrating** line (Napper): *Getting to know {name}'s nights — log a few and the rhythm will fill in.*
- One dismissible coach-mark on `QuickLogRow`: *Tap to log {name}'s first feed — it'll stay on your timeline.* (no anthropomorphized "I'll keep the thread").

**F. First 2-tap log → orb comes alive (aha #1)**
- Diaper is the lowest-friction first tap (two taps, no session); any log flips the orb + sky. `hapticSave`, `AppToast` "· Undo", a **plain** celebration.
- The coach then points the eye at the **`TonightStatus` strip** (*there's your thread — last feed, just now*) so the parent sees the *recurring* value, not only the animation.

**G. End-of-session — earn the return** *(one gentle, skippable prompt)*
- **Morning-recap opt-in — local notification only** (no backend/account/push server). **Double opt-in:** ask in-app *after* the first meaningful log (never on the welcome screen) — *Want a gentle good-morning with last night's recap?* **Maybe later / Yes, gently** — and request the OS permission *only* if they say yes. Easy to skip; never guilt.
- **Fallback:** if notifications are unavailable or denied, lose nothing — the recap still appears **in-app** on next open (built from the existing `buildNightRecap`), and the plain expectation still lands: *Come back tomorrow — {name}'s night will be waiting, and you'll see how long since the last feed at a glance.* (Leans on the **"it remembered"** night-2 aha, not the thin night-1 recap.)
- Ships as **Phase 1B**, behind a feature flag, isolated from the core setup flow.

**Deferred / contextual (never first-run):**
- **Partner invite** via the `HandoffCard` empty-state on-ramp (see §8/§9) — verbal seed now; live invite ships with the sync epic (don't promise real-time until it's real).
- Account/cloud backup; units/time format (locale default); feeding method; "edit baby" (typo recovery).
- **Cut from v1:** the separate role step and any "what's hardest?" intent quiz (unused → fake personalization; the brief forbids it).

**Configured/Supabase builds:** v1 targets the **local-only** flow. In a configured build, onboarding's collected name/age **prefill `BabySetupScreen`** (avoid double entry) rather than re-asking — see §11.

---

## 8. Personalization Model

| Field | Why it matters | Required? | When asked | Used by |
|---|---|---|---|---|
| **Baby age / birth date** | Highest-leverage (BabyCenter 29→70); drives orb sky now + age-aware content later; logging baseline. | **Required-ish** (skippable → generic) | First-run, screen C | Orb sky, `BabyHeader` age, future age-aware Reassure/Insights |
| **Baby name/nickname** | Emotional anchor; greeting; makes it *theirs*. | **Optional** (→ "your baby") | First-run, screen C | `BabyHeader`, orb core, toasts, copy |
| **Privacy assurance** (shown, not asked) | Trust before the first field; privacy is a real wedge (breach backlash). | **Shown** | First-run, screen C | — (activation lever) |
| **Caregiver role/name** | Colors logs — but only disambiguates *once a 2nd caregiver exists* (deferred). Asking now violates "only what's used next." | **Deferred** (default Mom) | At **partner invite** | Timeline attribution, `HandoffCard` |
| **Morning-recap reminder** (local notification only) | The **only** first-run return trigger (app has none today). On-brand, value-delivering, not a streak. **No backend, no account, no push server.** Feature-flagged; graceful fallback to in-app recap if denied/unavailable. | **Opt-in (double): in-app ask after first log → OS prompt only if yes** | End of session 1 (screen G), **Phase 1B** | `expo-notifications` (local scheduling), `buildNightRecap` |
| **Other notifications** (session-running nudge) | Gentle "feed running long". | **Deferred** | Contextual, when a session runs | Push (future) |
| **Units / time format** | Correct display. | **Deferred** (locale default) | Settings (future) | Feed/Pump volume |
| **Feeding method / "what's hardest"** | Not consumed anywhere yet → fake personalization. | **Cut for v1** | — | (only if/when content consumes it) |
| **Account / partner invite** | Cross-device + the handoff moat (needs 2 devices). | **Deferred** | After value; via `HandoffCard` on-ramp | Supabase, sync epic |

**Principles:** first-run collects only what's **used on the very next screen** (age → orb sky + header; name → core + greeting). State *why* in one phrase; "you can change this anytime." **Save-now-enrich-later** for all logging (Nara). **Gap flagged:** deferred prefs (units/feeding method/session nudges) need a small settings store that doesn't exist yet — scope it only when the first such pref ships, not in v1.

---

## 9. Activation Strategy

**Activation is staged, because the orb is the *delight* and `TonightStatus`/`HandoffCard` are the *value*.**

- **Session-1 aha (delight):** first 2-tap log → **orb comes alive** for *their* baby. Diaper is the lowest-friction first tap; any log flips the orb. This is real and category-best (the strategy calls the orb transition "the single most distinctive thing in this entire category") — but it is *one-time*.
- **Session-2 aha (recurring value):** on reopen, **`TonightStatus` answers "when did she last eat?"** before the parent asks — the **"it remembered"** moment. This is the load-reducing wedge, and it only exists *because* they logged in session 1.
- **The return trigger:** a tightly-scoped **morning-recap reminder via a *local* notification** (§7G, shipped as **Phase 1B**) — without it a local-only parent has *no* reason to return (the app sends nothing today). Double opt-in (in-app after the first log → OS prompt only on yes), skippable, feature-flagged, with a graceful in-app fallback if denied. The biggest retention lever and the one justified new dependency (`expo-notifications`, local scheduling only).

**Why not the alternatives:** *set a goal* → violates no-targets (guilt). *Open a Reassure card* → calming but passive, no orb payoff (good as a secondary nudge). *Just view personalized Tonight* → necessary, not sufficient — seeing isn't the aha; *doing* is, and *returning* is what retains.

**Wire the coach to the wedge:** after the first log, draw the eye to `TonightStatus` and treat `HandoffCard` as a feature, not scenery. **Solo-caregiver fix:** with one caregiver and no events, `HandoffCard` currently renders the false "Both caregivers are ready" (it does `caregivers.slice(0,2)`); turn that empty state into the **partner-invite on-ramp** ("Caring with someone? Invite them so you both see the same night") — this fixes the bug *and* gives the moat its only on-ramp.

**Measure:** session-1 = % new installs with ≥1 real log; the truer metric = **night-2 return** (no analytics dependency needed to design for it).

---

## 10. UX & Motion Direction

**Motion law (Tiimo): guide attention, don't demand it** — slow easing, fade/grey not flash, no bounce/confetti. Keep onboarding on **JS `Animated`** (matches existing code, React-Compiler-safe; do *not* introduce Reanimated 4 here); reuse `useOrbBreathe`, `usePanelEntry`/`entryStyle` (`PANEL_ENTER_MS≈360`, stagger ≈72ms, `Easing.out(cubic)`, spring friction 8/tension 42). **Do not** reintroduce the SVG-mask draw-reveal (recorded antipattern).

**Orb-protagonist choreography (the differentiator — replaces the old "morph" hand-wave):**
1. *Splash→beat:* cross-fade splash logo out while the **one shared `<Orb>` (extracted from `OrbHero`)** fades/scales in at the *same screen-center coords*; interpolate lavender→cream→resolved-theme as **one** gradient pass.
2. *Per-step:* the orb lives in a **fixed top header zone** (~`insets.top+24`, ~140px) — **never vertically centered**, so the keyboard can never cover the bottom CTA. Content runs the existing entry stagger (eyebrow→title→field), **driven by step state, not scroll index** (postmortem); render one step at a time (drop the paged `ScrollView`).
3. *Answer-driven orb:* name commit → name cross-fades into the orb **core** (reuse `OrbHero`'s core text slot); age commit → animate **`skyTone`** (newborn `sky.night` → ~3mo `sky.dusk` → 6mo+ `sky.day`) ~600ms; (when role is later collected) ring stroke fills with `colorHex` ~400ms.
4. *Setup→Tonight:* the orb **stays put** and the Tonight sky card builds around it (same object arriving home); hold the resolved theme (no flash).
5. *Reduce Motion:* every step becomes an instant state set; the orb stops breathing; cross-fades become swaps; **the shared breathe value is frozen** (recorded theme-reveal double-render gotcha — two orbs on different drivers visibly diverge mid-cross-fade).

**Night-safety (concrete mechanism, not a promise):** the reviews disagreed on whether the app auto-resolves night at boot, and onboarding currently **hardcodes `colors.cream`**. So: resolve the surface at onboarding entry via `resolveSurfaceMode(pref, currentHour)`, render the step scaffold + orb from `surfaces.night`/night `OrbBody` when night, and ensure the **first onboarding frame is no brighter than the splash**. Also verify/fix the app-wide boot resolution (benefits every screen).

**Accessibility (specific, must-fix):**
- **Keyboard vs CTA vs orb:** orb pinned top, CTA pinned bottom, input between — keyboard never covers the action (see choreography #2). Prefer the one-thumb age control over a number-pad.
- **Contrast:** the active `RolePicker` paints **white on the role color** — `mom #FF9E5E` (~1.9:1) and "Other"=teal `#23B79E` (~2.3:1) **fail WCAG AA** (worse at night). Fix to ink-on-tint or darker fills *before* reuse.
- **Screen-reader focus:** on step change, `AccessibilityInfo.setAccessibilityFocus` to the new title (else VoiceOver strands on an unmounted control).
- **Dynamic Type:** titles use fixed `fontSize:31` — add `adjustsFontSizeToFit`/`numberOfLines` (copy `OrbHero`'s existing pattern) so "How old is {long name}?" doesn't clip.
- **Haptics:** `hapticSave` on advance/first-log, `hapticSuccess` on setup complete (already no-op under Reduce Motion/Low Power).
- **Progress dots:** with ≤3 steps, **drop `PageDots`** — prefer calm forward motion over a counter.

**Illustration:** none new — reuse the orb + `sky` gradients. Lottie only for *one* optional designer-authored celebration moment, if an asset is ever supplied (not required for v1).

---

## 11. Information Architecture (state & integration)

- **Own the local baby in the right layer.** Add a **persisted local baby/caregiver to `AuthProvider`'s local-only branch** (its own AsyncStorage key; hydrate on mount; expose `useAuth().baby` + `createLocalBaby({name,birthDate,role,colorHex})`). `AuthProvider` sits **above** `OnboardingGate`, so onboarding can write it and Tonight can read it. **Do not** put baby creation in `LocalEventProvider` (it mounts *after* the gate and holds no identity — the original plan's mistake).
- **Refactor seed read-sites** to read the active baby/caregiver, with the **seed demoted to a dev-only fallback**: the `mock.ts` mint helpers (`create*` take `{babyId,caregiverId}`), `localInteractions` add*, `LoggingProvider.useLoggingActor`, Tonight (`index.tsx`, incl. replacing the **frozen `2026-06-16` age date** with `Date.now()`), and `log.tsx`. Otherwise locally-created logs stay stamped `baby-mia`/`cg-mom`.
- **Completion ordering (matters — the event store is persisted and the provider remounts after onboarding):** (1) write local baby/caregiver store → (2) clear `lullaby/local-events/v1` → (3) `markOnboardingComplete` → (4) reveal children. Then `LocalEventProvider`/`LoggingProvider` mount and hydrate clean.
- **Completion semantics:** change "complete" from a bare flag to **"a baby exists."** Bump to `lullaby.onboarding.v2.complete` so existing testers re-run the new flow once. Keep `EXPO_PUBLIC_FORCE_ONBOARDING`; extend the dev reset to also clear the local baby (true cold-open).
- **First-run gating:** new install / no local baby → full flow. Returning with a baby → straight to Tonight. Skip / "Set up later" still creates a **minimal valid baby** ("your baby", generic age, default role) so the app is fully functional.
- **`loggingV2` interplay:** the first-log coach must detect "zero real events" against the **flag-correct store** and **wait for `waitingForV2Hydration`** (recorded "V2 Tonight must not render before hydration" postmortem) so it doesn't flash over a hydrating orb.
- **Configured/Supabase builds:** keep `ensureCaregiverSetup`/`provisioning.ts` as-is; personalized onboarding is local-only for v1, and in configured builds onboarding answers **prefill `BabySetupScreen`** (resolve the double-collection explicitly rather than re-asking). Don't unify local + Supabase creation under one function — local is a separate persisted-store write.
- **typedRoutes:** keep onboarding a **gated component**, not a route.
- **Editing later:** baby name/age via `BabyHeader` tap → small `EditBabySheet`.
- **Morning-recap reminder (Phase 1B) is self-contained and local:** a feature flag (e.g., `EXPO_PUBLIC_ENABLE_RECAP_REMINDER`), a persisted opt-in choice + permission status, and a scheduled *local* notification (no server). Permission is requested only after the in-app "yes"; denial/unsupported falls back to the in-app recap with no error surfaced (fire-and-forget, like haptics).

---

## 12. Technical Implementation Plan (safe phases)

> Each phase = independently testable slices (lint + `tsc --noEmit` + smoke). Build behind `EXPO_PUBLIC_FORCE_ONBOARDING=true`. **Phase 0 is bigger than "thin reuse" — sequence it first and alone.**

**Phase 0 — Data foundation (sequence first; bigger than "thin reuse")**

*Phase 0a — Active-baby read-site refactor (no behavior change; the riskiest slice).* Introduce an active baby/caregiver in `AuthProvider` (local branch) and route every seed consumer through it; **seed remains the default fallback**. Files: `src/state/AuthProvider.tsx`, `src/data/mock.ts` (mint helpers take `{babyId,caregiverId}`), `src/data/localInteractions.ts`, `src/features/logging/state/LoggingProvider.tsx` (`useLoggingActor`), `src/app/(tabs)/index.tsx` (+ frozen-date fix), `src/app/(tabs)/log.tsx`, `currentState.ts`. Gate: **all existing smoke checks still pass**, `tsc`, lint. Own commit.

*Phase 0b — Local baby creation.* `createLocalBaby(inputs) → {Baby, Caregiver}` as a **pure factory** + persisted store write + seed-clear (`lullaby/local-events/v1`) + dev-reset extension; `birthDate` from the age control. Tests: unit the factory + weeks→birthDate (pure → smoke-testable).

**Phase 1A — Live setup flow + first meaningful log + personalized Tonight** (the core ship)
- Goal: the full first-run arc — emotional beat → age/name → real completion → personalized, Calibrating Tonight → first-log coach → orb alive. (Merges the flow restructure and the landing/activation into one shippable slice.)
- Extract first: a shared **`<Orb>`** from `OrbHero` (body+breathe+ring, one `useOrbBreathe` driver); **`RolePicker` + `birthDateFromWeeks` + `parseWeeks`** out of `BabySetupScreen` into a shared module; build **`OnboardingStepLayout` on top of `AuthShell`** (orb/header slot + pinned CTA), not a sibling.
- Flow: `useOnboardingFlow` as a **pure reducer** (`nextStep(state,action)`); **drop the paged `ScrollView`** (render one step, cross-fade); kill the `ONBOARDING_COMPLETING_LABEL` fake; wire completion to `createLocalBaby`; resolve night at entry; fix `RolePicker` contrast.
- Tonight: greets {name}{age}; **Calibrating** line; `FirstLogCoach` (flag-correct store, hydration-aware, never blocks the tap); first log → orb alive → eye to `TonightStatus`. **Minimal `HandoffCard` fix:** with a single caregiver, never render the false "Both caregivers are ready" (hide or show a single-caregiver state) — the full partner-invite on-ramp is deferred to Phase 2.
- Files: `onboarding/*`, `(tabs)/index.tsx`, `BabyHeader`, `TonightStatus`/`QuickLogRow`, `HandoffCard`, new `FirstLogCoach`.
- Tests: **rewrite** (not extend) `scripts/check-local-interactions.ts` — the v2 key + new steps/copy break the v1 assertions (key, eyebrows, CTA labels, 3-step `getNextOnboardingStep`, skip-on-final). Add pure-reducer + factory checks.

**Phase 1B — Gentle morning-recap opt-in (local notification only; tightly scoped)**
- Goal: the one v1 retention loop — a **local** `expo-notifications` morning reminder built from the existing `buildNightRecap`. **No backend, no account, no push server.**
- Behavior: **double opt-in** — ask in-app *after* the first meaningful log/session (never on the welcome screen); request the OS permission **only if** the user says yes; optional and easy to skip.
- Resilience: **feature-flagged** (e.g., `EXPO_PUBLIC_ENABLE_RECAP_REMINDER`); **graceful fallback** — if notifications are unavailable or denied, surface the recap **in-app** on next open and never error (fire-and-forget, like haptics).
- Keep it isolated so it **never bloats Phase 1A**. New dep: `expo-notifications` (local scheduling only).
- Files: a small `useMorningRecapReminder` + in-app opt-in prompt; reuse `buildNightRecap`; flag plumbing.
- Tests: pure schedule-time/eligibility logic in the smoke harness; manual device QA for the permission flow + denied/unsupported fallback.

**Phase 2 — Polish, QA & deferred extras**
- Polish: motion timing, contrast, Dynamic Type, `setAccessibilityFocus`, reduce-motion frozen breathe; finalize smoke; `tsc`/lint; **device QA in day + night + Reduce Motion** (Expo **tunnel fallback** ready — LAN testing silently fails).
- Deferred (only if/when wanted): full **`HandoffCard` → partner-invite on-ramp**, `EditBabySheet` (typo recovery). Live partner sync stays in the separate Supabase epic; the on-ramp must not promise real-time yet.

**Verification (every phase):** `npx tsc --noEmit` · `expo lint` · `tsx scripts/check-local-interactions.ts` (pure reducer + factory + copy/step constants) · manual: `EXPO_PUBLIC_FORCE_ONBOARDING=true` + dev-reset local baby → walk the flow on device in **day & night** and with **Reduce Motion on**, confirming a real first log flips the orb and the seed never reappears.

---

## 13. Suggested Component Architecture (adapted to the repo)

**Extract (enabling refactors, before flow work):**
- **`<Orb>`** — one component from `OrbHero` (body + `useOrbBreathe` + ring), rendered in the beat/companion **and** Tonight, driven by one shared breathe value (kills the parallel intro loop; makes continuity real).
- **`RolePicker` + `birthDateFromWeeks` + `parseWeeks`** → shared module (currently private in `BabySetupScreen`).
- **`OnboardingStepLayout`** built **on top of `AuthShell`** (add orb/header slot + pinned bottom CTA) — *not* a parallel cream scaffold (recorded duplication antipattern).

**New, small, pure where possible:**
- `useOnboardingFlow` — pure step reducer (`beat → baby → creating → done`), smoke-testable.
- `createLocalBaby(...)` — pure factory (Phase 0b).
- `FirstLogCoach` — dismissible, zero-real-events-only, flag/hydration-aware.
- Tonight **Calibrating** state (small).
- `useMorningRecapReminder` + a small in-app opt-in prompt (Phase 1B) — schedules a *local* `expo-notifications` reminder, persists opt-in + permission, falls back to the in-app recap (`buildNightRecap`) if denied/unsupported.
- `EditBabySheet` (Phase 2, deferred).

**Map to the user's suggested names:** `OnboardingScreen` (refactored), `OnboardingStepLayout` (on `AuthShell`), `OnboardingProgress` (= dropped for ≤3 steps), `OnboardingChoiceCard` (= `RolePicker`/`ChoicePill`), `OnboardingTextInput` (= `AuthField`), `OnboardingMotionScene` (= the shared `<Orb>`), state helpers (= `useOnboardingFlow` + `onboardingStorage.ts` + `createLocalBaby`).

---

## 14. Copywriting Draft

Tone: calm, human, plain, reassuring, concise — no fake excitement, no flowery slop, no anthropomorphized intelligence, no medical claims, no targets.

- **Beat:** **Lullaby** — *A calm place for the night shift.* / *The hard hours are easier with a little help.* · CTA **Begin** · secondary **Set up later**
- **Baby (age+name):** **Tell us about your baby** — age: *Newborn · A few weeks · A few months* · name: *Who are we caring for? (optional)* "e.g. Mia" · trust line: *Stays on this phone. No account needed.* · CTA **Continue** · secondary **Skip for now** · helper: *You can change this anytime.*
- **Validate-an-answer microcopy (Flo, in plain voice):** on a newborn age — *Those early weeks are a lot. We'll keep it simple.*
- **Setup transition:** *Getting {name}'s night ready…*
- **Tonight greeting:** header **{name} · {age}** · Calibrating: *Getting to know {name}'s nights — log a few and the rhythm will fill in.*
- **First-log coach:** *Tap to log {name}'s first feed — it'll stay on your timeline.* (post-log) *There's your thread — last feed, just now.*
- **First-log success:** (existing) *Feed logged · Undo.*
- **Return (end of session 1):** *Want a gentle good-morning with last night's recap?* **Maybe later** / **Yes, gently** · *Come back tomorrow — {name}'s night will be waiting.*
- **If notifications are unavailable/denied:** no alarming copy — the recap simply appears in-app on next open.
- **Partner on-ramp (HandoffCard empty):** *Caring with someone? Invite them so you both see the same night.*
- **Empty Insights (keep):** *Today is your first day of logs. Keep logging and patterns will appear here.*
- **Skip/edit:** **Skip for now** (never bare "Skip"); *You can change this anytime.*
- **Avoid:** "Welcome to the family!", "Let's get started!", "You're all set! 🎉", "Set your goals", "I'll keep the thread", any number-as-target, any "both caregivers are ready" with one caregiver.

---

## 15. Design Review Score

> Scored by three independent review passes — **design, product/CEO, engineering** — each verified against the live code. Below are the **pre-revision** scores (the draft they reviewed); this document integrates every <9 path-to-10. Consolidated = mean of the three lenses.

| Dimension | Design | Product | Eng | Consolidated (pre) | Path to 10 → applied in this revision | Target (post) |
|---|---|---|---|---|---|---|
| **Clarity** | 9 | 8 | 8 | **8.3** | Correct the stale §2 audit (add `TonightStatus`/`HandoffCard`, the `mock.ts` seed reality); de-ambiguate the role step (now deferred). ✔ §2/§7/§8 | **9** |
| **Emotional quality** | 7 | 7 | 9 | **7.7** | Don't auto-advance the beat; add a human line + a privacy/trust line; kill "I'll keep the thread"; lead with reassurance. ✔ §6/§7/§14 | **9** |
| **Visual originality** | 6 | 8 | 8 | **7.3** | Make the orb the *answer-driven, night-aware protagonist* (name→core, age→sky, follows-home) instead of a static logo + form. ✔ §6/§10 | **9** |
| **Activation strength** | 8 | 6 | 8 | **7.3** | Stage activation (orb delight → "it remembered" value); add the morning-recap return trigger; wire the coach to `TonightStatus`/`HandoffCard`. ✔ §9 | **9** |
| **Accessibility** | 6 | 9 | 8 | **7.7** | Fix `RolePicker` contrast; pin orb-top/CTA-bottom so the keyboard never covers it (one-thumb age control); `setAccessibilityFocus` on step change; Dynamic Type. ✔ §10 | **9** |
| **Implementation feasibility** | 7 | 7 | 6 | **6.7** | Re-locate the active baby to `AuthProvider` above the gate; split Phase 0 into 0a/0b; enumerate the seed read-sites; rewrite (not extend) the smoke test. ✔ §11/§12 | **8–9** |
| **Consistency with current app** | 8 | 9 | 8 | **8.3** | Build `OnboardingStepLayout` on `AuthShell`; extract (not duplicate) `RolePicker`/`<Orb>`; keep JS `Animated`; honor postmortems. ✔ §10/§13 | **9** |

**Honest caveat:** feasibility is the one dimension that stays a notch under 10 even after revision — the local-baby/seed refactor is genuinely 2–3× the naive scope. The plan now scopes it *correctly and first* (Phase 0a), which is the best achievable; it remains the highest-execution-risk area.

---

## 16. Final Recommendation

**Direction:** transform onboarding from a 3-panel value carousel into a short, warm, **age-first setup → orb-protagonist → staged activation (first log + the return)** flow, local-first, reusing the design system, `OrbHero`, the gate, and `TonightStatus`/`HandoffCard`. This **reverses the recent "three calm panels" decision** (now confirmed).

**Branch:** `feat/onboarding-personalized-activation`

**First implementation task (Phase 0a):** **introduce an active local baby/caregiver in `AuthProvider` and refactor the seed read-sites to use it, with the seed demoted to a dev-only fallback** — `mock.ts` mint helpers take `{babyId,caregiverId}`, and `localInteractions`, `LoggingProvider.useLoggingActor`, `(tabs)/index.tsx` (+ frozen-date fix), and `log.tsx` read it. No UI change; **all existing smoke checks stay green**, `tsc` + lint clean. This de-risks everything downstream (until data ownership is correct, no flow can be "real" and logs stay stamped "Mia").

**Then:** 0b (`createLocalBaby` + seed-clear) → **1A** (extract `<Orb>`/`RolePicker`; step-machine flow; night-aware setup + first log + personalized/Calibrating Tonight + first-log coach + minimal `HandoffCard` single-caregiver fix) → **1B** (local morning-recap opt-in, feature-flagged) → **2** (polish/QA; deferred partner-invite on-ramp + `EditBabySheet`).

---

### Decisions confirmed
1. **Direction: Transform** — age-first setup + orb-protagonist + staged activation, replacing the 3-panel carousel.
2. **Return trigger: morning recap, tightly scoped** — **local notification only** (no backend, no account, no push server), **double opt-in** (in-app ask after the first log → OS prompt only on yes), skippable, **feature-flagged**, graceful in-app fallback if denied/unavailable. Shipped as **Phase 1B**, isolated from the core setup flow.
3. **v1 scope (minimal):** age + optional name → first log → personalized/Calibrating Tonight (**Phase 1A**) + morning recap (**Phase 1B**). The full **partner-invite on-ramp** is deferred to **Phase 2**; Phase 1A includes only the *minimal* `HandoffCard` fix so a single caregiver never sees the false "both caregivers are ready." Role step, account/backup, units, and any intent quiz remain deferred.

### Status & next step
This roadmap is approved. Implementation remains **gated per §12** and is intentionally **not started** in this document. The first build task is **Phase 0a** (§16) on branch `feat/onboarding-personalized-activation`: introduce the active local baby in `AuthProvider` and refactor the seed read-sites (seed demoted to a dev-only fallback), keeping all existing smoke checks green.
