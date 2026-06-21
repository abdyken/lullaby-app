# Lullaby — Native Mobile App Blueprint

Working product blueprint for the Expo React Native app. Grounded directly in
`.reference/lullaby-phone-mockup.html` (the approved visual direction). This is a
planning doc, not code. The mockup is the design we keep — nothing here redesigns it.

Stack assumed: Expo React Native · TypeScript · Expo Router · NativeWind · Supabase · EAS Build.

> **Read the mockup correctly first.** That HTML is a *scroll-driven storytelling*
> component for the landing page: `window.LullabyPhone.setState('sleep'|'feed'|'diaper'|'partner')`
> swaps the screen as the user scrolls. In the real app **nothing is scroll-driven** —
> the orb reflects the baby's *actual current status* in real time. The four "states"
> are not a carousel; they are the live states the home screen moves through during a night.

---

## 1. Product Definition

**What Lullaby is as a mobile app**
A calm, one-handed night companion for parents of a 0–12 month-old. The core loop is:
wake at 3am → glance at the orb to see where you are (asleep / last feed / who's on) →
tap one big button to log a feed, sleep, or diaper → go back to bed. A second, smaller
job: bounded reassurance for the most common newborn worries, so the panic ("is this
normal?") has somewhere calm to go that isn't a midnight Google spiral.

**Main user problem**
Exhausted, anxious parents operating a phone one-handed in the dark need to (a) keep a
shared thread of what happened tonight without friction, and (b) be reassured without
being diagnosed. Existing trackers are cold, busy, and built for daylight data entry.

**Emotional promise**
"It's 3am, you're not alone, and you're doing fine." The app should feel like a soft
night-light, not a spreadsheet. Every screen lowers the parent's heart rate.

**What the app should NOT become**
- A medical/health dashboard or anything that diagnoses.
- A sleep-training program, growth-percentile charter, or milestone tracker.
- An AI cry-analyzer or an AI chatbot ("ask anything") surface.
- A social network / feed.
- A generic baby tracker that races competitors on feature count.
- A daylight data-entry tool. If a feature only makes sense awake at noon, it's wrong here.

---

## 2. MVP Feature Set (strict)

### P0 — first usable mobile MVP (the night loop) — **3-tab app from day one**
The bottom tab bar exists from the first native prototype, and **every tab has real
(local/mock) content** — no empty or fake tabs.
- **One baby profile** (name, birth date, avatar) — single source of context for the header.
- **Tonight tab** — the orb hero showing live status (asleep / feeding / awake), the quick-log
  row, tonight's timeline, the current-action button, and a small partner/handoff card. The product's heart.
- **Log tab** — a real history screen reading the **same local/mock events**: Today/Yesterday
  grouping, feed/sleep/diaper filters, a simple night recap, and a warm empty state.
- **Reassure tab** — **static safe cards** (no AI in P0): hiccups, spit-up, gas, won't sleep,
  when to call a doctor. No diagnosis, no unsafe advice, no medical claims (see §8).
- **Feed logging** — start/stop timer, side (L/R). Feed is an interval event.
- **Sleep logging** — start/stop timer. Sleep is an interval event.
- **Diaper logging** — one-tap, wet / dirty / both. Diaper is an instant event.
- **Partner/handoff card inside Tonight** — uses the existing caregiver/avatar design (the
  `lb-sync` card). Not a tab in P0; not real-time yet — reflects the local caregiver model.
- **Local persistence** — events survive app restart (offline-first; cloud comes later).

### P1 — strong next features
- **Pump / Bottle / Medicine logging** — added under a "More" action in Log / the quick-log row
  (the 4th `pump` tile already exists in the mockup; add amount field).
- **Partner sync / handoff as its own tab or screen** — invite a second caregiver, shared live
  log, "who did the last wake-up." Promote from the Tonight card once it has real realtime
  functionality. (Heavy: auth + shared baby + realtime. Data model is built for it in P0.)
- **Richer reassurance** — expand the static set; dynamic/contextual help only after safety review.
- **Push notifications** — gentle, opt-in (e.g. "feed running 45 min").

### P2 — later
- Multiple babies / twins.
- Day/night summaries and gentle pattern surfacing (never sleep-training advice).
- Data export for a pediatrician visit.
- Paywall / premium.
- Widgets, watch complications.

**Cut on sight (anti-bloat):** AI insights, cry analysis, growth charts, community, in-app
messaging, wearable integrations, anything requiring two-handed daytime attention.

---

## 3. Bottom Tab Bar Proposal

**Decision: 3 tabs, present from the first P0 prototype — Tonight · Log · Reassure.**
Every tab ships with real (local/mock) content from day one; none is an empty placeholder.
Settings is **not** a tab — it sits behind the baby header (tap the avatar). Partner is
**not** a tab in P0 — it's a card inside Tonight. Three tabs keeps thumb reach trivial in
the dark and avoids the cold SaaS five-tab bar.

### Tab 1 — Tonight
- **Purpose:** the live night loop — see status, log fast, glance at tonight.
- **Main screen content:** baby header · sky/orb live status · quick-log row · tonight timeline ·
  current-action button · small partner/handoff card.
- **Why it deserves a tab:** it's the reason the app is open at 3am; it must be one thumb-tap away always.
- **Icon metaphor:** a soft crescent moon / the orb itself (rounded, stroke 1.9, the mockup's SVG style).
- **NOT here:** historical days/recaps (that's Log), settings, the Reassure cards.

### Tab 2 — Log
- **Purpose:** "what happened" as a proper history screen, reading the **same local/mock events** as Tonight.
- **Main screen content:** Today / Yesterday grouping · Feed/Sleep/Diaper filters · a simple
  night recap (e.g. "3 feeds, 2 diapers, 5h 20m sleep") · warm empty state when no events exist.
- **Why it deserves a tab:** the second-most-common need (recall last night, scan the pattern),
  and it's where "See all" from the Tonight timeline lands. Real content from day one via the mock store.
- **Icon metaphor:** soft stacked rounded lines / a gentle list-with-rounded-corners.
- **NOT here:** active logging controls (logging happens on Tonight), settings, charts/analytics.

### Tab 3 — Reassure
- **Purpose:** the calm "is this normal?" surface for worry moments.
- **Main screen content (P0 = static safe cards only, no AI):** hiccups · spit-up · gas ·
  won't sleep · when to call a doctor. Each opens a calm card with a "usually normal" line,
  a conservative "Call your provider if…" block, and a quiet disclaimer. No diagnosis, no
  unsafe advice, no medical claims (§8).
- **Why it deserves a tab:** it's the emotional half of the promise and must be reachable
  *during* panic, not buried — and the five static cards give it real content on day one.
- **Icon metaphor:** a soft heart inside a speech bubble, or a hand/heart — warm, never a medical cross.
- **NOT here:** AI chat, symptom checkers, diagnosis tools, logging, anything making medical claims.

**Partner placement (P0):** a small partner/handoff card *inside Tonight*, built from the
existing caregiver/avatar design (`lb-sync`). It becomes a P1 tab or screen only once it has
real functionality (invite + shared live log). Never add a 5th tab without earning it.

**Settings placement:** behind the baby header. Tapping the baby avatar/name opens baby +
account + caregiver settings. Rationale: settings is a low-frequency, eyes-open task; giving
it a tab steals reach from the things you do half-asleep.

---

## 4. Screen Map

For each: user goal · main UI · empty state · primary action · design notes (from mockup) · 3am feel.

### Onboarding
- **Goal:** understand what Lullaby is and get to a baby in <60s.
- **UI:** 2–3 soft full-bleed panels using the sky gradients (`#FFE0B8→#F3D3EC` day,
  `#3B3A74→#6E6FC2` night), one line of copy each, single pill CTA.
- **Empty state:** n/a (first run).
- **Primary action:** "Add your baby."
- **Design notes:** reuse the orb as a friendly mascot; Fredoka headline, Nunito body.
- **3am feel:** never shown at 3am — but still calm, never a marketing wall.

### Baby Profile Setup
- **Goal:** create the baby context the whole app hangs on.
- **UI:** name field, birth date picker, avatar (default illustrated baby like the mockup's
  `lb-av` SVG), optional caregiver color (Mom `#FF9E5E` / Dad `#5560C6`).
- **Empty state:** n/a.
- **Primary action:** "Start tonight."
- **Design notes:** the avatar + name + age feed directly into the persistent `BabyHeader`.
- **3am feel:** one-time, but keep it short so a tired parent finishes it.

### Home / Night Dashboard (Tonight)
- **Goal:** see status and log in one glance + one tap.
- **UI:** `BabyHeader` (avatar, "Mia", "7 weeks old", caregiver stack) · `OrbHero` (sky
  gradient by state, breathing sun/moon, progress ring, core showing state + live timer) ·
  contextual `PrimaryActionButton` ("Wake baby" / "End feed" / "Done") · `QuickLogRow`
  (P0: Feed/Sleep/Diaper; the 4th Pump tile from the mockup is P1) · `TimelineCard` (Tonight).
- **Empty state:** orb shows "All quiet" with a soft prompt: "Tap to log the first feed."
  Timeline reads "Nothing logged yet tonight" — warm, not empty-grey.
- **Primary action:** the contextual orb button (start/stop the active thing).
- **Design notes:** the sky changes with real time/state (`is-night` / `is-dusk` / day),
  not with scroll. Accent color follows the active state via `data-state` mapping
  (sleep `#5560C6`, feed `#FF7A3D`, diaper `#23B79E`). Cream background `#FBF4EF` stays in every state.
- **3am feel:** the breathing orb is the heartbeat of the screen — slow, soft, alive.

### Feed Logging
- **Goal:** start/stop a feed one-handed, capture side.
- **UI:** large running timer (Fredoka, tabular-nums, like `lb-orb-time`), L/R side toggle,
  big stop pill. Optional bottle/breast type later.
- **Empty state:** "Start a feed" with the feed accent `#FF7A3D`.
- **Primary action:** Start feed → becomes End feed (the orb's `End feed` action).
- **Design notes:** feed-tint `#FFEDE0` surfaces; orb ring tracks elapsed time.
- **3am feel:** giant target, no typing required to start; details optional.

### Sleep Logging
- **Goal:** mark sleep start, see it running, end on wake.
- **UI:** running duration, "started 4:12" subline (mockup's `lb-m-text`), stop pill.
- **Empty state:** "Start sleep" with sleep accent `#5560C6`, night sky.
- **Primary action:** Start sleep → Wake baby.
- **Design notes:** night sky `is-night` with stars; ring shows elapsed.
- **3am feel:** the calmest screen; stars on, dim, quiet copy ("we'll keep the night quiet").

### Diaper Logging
- **Goal:** log a change in one tap.
- **UI:** a small bottom sheet: Wet / Dirty / Both, optional note. Instant, no timer.
- **Empty state:** n/a (it's a quick action, not a standing screen).
- **Primary action:** pick type → auto-saves, orb shows the `check` state ("Just logged").
- **Design notes:** diaper accent `#23B79E`, diaper-tint `#DDF5EF`, the `lb-orb-check` confirm.
- **3am feel:** done in under two seconds; a soft check, then back to home.

### Log (history) — Tab 2
- **Goal:** recall what happened tonight and on previous days.
- **UI:** Today / Yesterday section grouping · Feed/Sleep/Diaper filter chips · `TimelineItem`
  rows (time · colored dot icon · label · who-chip) · a simple night-recap summary line per day
  (e.g. "3 feeds · 2 diapers · 5h 20m sleep"). Reads the same local/mock store as Tonight.
- **Empty state:** "Your nights will show up here. Log your first feed on Tonight." Never a blank list.
- **Primary action:** filter / open a day. (No logging here — logging lives on Tonight.)
- **Design notes:** keep the connector line (`lb-tl-item::before`), colored dots by kind,
  caregiver chips (`lb-who`). Recap is one calm line, not a chart.
- **3am feel:** scannable, gentle, no numbers-heavy analytics.

### Reassure — Tab 3
- **Goal:** calm a specific worry fast, with honest bounds.
- **UI (P0 = static safe cards, no AI):** a list of five fixed cards — hiccups, spit-up, gas,
  won't sleep, when to call a doctor — each opening a calm detail (plain-language framing,
  "usually normal" line, conservative "Call your provider if…" block, optional link to a
  trusted source, "Did this help?"). Content is bundled locally; no logged-data dependency.
- **Empty state:** n/a in P0 (the five cards are always present). Search/expansion is P1.
- **Primary action:** open a card; secondary: the helpful yes/no.
- **Design notes:** lavender accent for this section (the landing's reassurance tone), warm
  terracotta for red-flags (never blaring red, never color-only — pair icon + "Call").
- **3am feel:** reads like a calm friend who's a nurse, not a symptom checker. See §8.

### Partner Sync / Handoff — **P0 = card inside Tonight; full screen is P1**
- **Goal:** both caregivers see the same live night; know who did the last wake-up.
- **P0 (card in Tonight):** the `lb-sync` card ("Dad handled the last wake-up", two avatars)
  reflecting the local caregiver model. No invite, no realtime yet.
- **P1 (own screen/tab):** invite flow, shared live timeline with who-chips, "View handoff."
- **Empty state (P1):** "Invite your partner so you're both in the loop."
- **Primary action (P1):** Invite caregiver / View handoff.
- **Design notes:** the gradient sync card (`feed-tint → diaper-tint`), dusk sky `is-dusk`.
- **3am feel:** removes the "did you already feed her?" whispered argument at 3am.

### Settings (behind baby header)
- **Goal:** manage baby, account, caregivers, notifications.
- **UI:** grouped list, calm not techy.
- **Empty state:** n/a.
- **Primary action:** varies.
- **Design notes:** keep cream surfaces and rounded cards; no dense iOS grouped-grey.
- **3am feel:** rarely opened at night; just don't make it cold.

---

## 5. Adapting the Mockup into the Real App

The mockup is two things stacked: a **landing storytelling toy** (scroll wiring) and a
**real product UI** (the components). Pull them apart.

| Element | Verdict | Notes |
|---|---|---|
| **Sky/orb hero** | **Stay — becomes a real native component** | Keep the gradient sky, breathing orb, progress ring, glass core. Drive it from **live status + real timers**, not scroll. Day/night/dusk follows real clock + state. |
| **Quick log row** | **Stay — real component** | Four tinted tiles. In-app each opens its log flow / starts a timer. Active-tile ring (`is-active`) reflects the running activity. |
| **Tonight timeline** | **Stay — real component** | Real events, real times, real caregiver chips. "See all" routes to the Log tab. |
| **Baby header** | **Stay — real component** | Now also the entry point to Settings (tap avatar). |
| **Caregiver avatars** | **Stay — real, but data-backed** | Static "M/D/+" in mockup; in-app these are real profiles with colors. The "+" becomes "invite." |
| **Main action button** | **Change — make it contextual** | Mockup cycles labels by state; in-app it's a real start/stop tied to the active event (Start feed/End feed, Start sleep/Wake). |
| **Bottom tab bar** | **Add — missing in mockup** | Mockup is a single screen. Add the 3-tab bar (§3). Match the soft style; don't import a stock RN tab look. |
| **Scroll state-swap (`setState`, `is-swapping`)** | **Landing-only — drop entirely** | This is the storytelling mechanism. The app uses real navigation + state, not a fade-swap carousel. |
| **Preview harness (`.lb-stage`, demo tabs, `lb-demo-only`)** | **Landing-only — drop** | Already marked DELETE-ME in the file. |
| **Screen spacing** | **Polish** | Mockup is a fixed 748px frame with no scroll (`overflow:hidden`). Real screens scroll and must handle small phones + safe areas/notch. Keep the 13px gap rhythm and 18px screen padding as the baseline. |
| **Typography** | **Stay, formalize** | Fredoka for display (name, timer, titles), Nunito for body/labels. Load via `expo-font`. |
| **State transitions** | **Polish, reframe** | The .32s fade + translateY and the .7s sky transition are lovely — reuse them for *real* state changes (feed starts → orb animates), not scroll. Honor reduced-motion (mockup already does). |
| **One-handed usability** | **Polish — make it a rule** | Targets already ~38–44px; bump primary actions to ≥56px, keep them in the lower 2/3 for thumb reach, and verify on a small device in the dark. |

---

## 6. Design System Extraction (from the mockup tokens)

### Color tokens (verbatim from `.lb-phone`)
```
ink            #2E2A40   (primary text)
ink-soft       #736E86   (secondary text)
ink-faint      #A8A2B8   (tertiary / timestamps)
bg / cream     #FBF4EF   (app background — stays cream in EVERY state)
surface        #FFFFFF   (cards)
surface-2      #FBF6F2   (subtle alt surface)
line           #F0E8E2   (hairlines, timeline connector)

feed           #FF7A3D   feed-2 #FF9E5E   feed-tint  #FFEDE0
sleep          #5560C6   sleep-2 #7C84DA  sleep-tint #E9EBFB
diaper         #23B79E                    diaper-tint #DDF5EF
pump (amber)   #FFB12E   (icon)           pump tiles  #FFF0D2→#FCE6B6

caregiver: mom #FF9E5E   dad #5560C6   (extend with a small calm palette)

sky day  : linear 168deg #FFE0B8 → #FFC9B0 → #F3D3EC → #FBEFF6
sky night: linear 168deg #3B3A74 → #4A4D9C → #6E6FC2
sky dusk : linear 168deg #EDE7FB → #E7E9FC → #DCF4EE
```
Accent is **dynamic**: it maps to the active state (`data-state` → feed/sleep/diaper). Reuse
that pattern as a theme value the orb and primary button read from.

### Typography
- **Display:** Fredoka (400–700). Used for baby name (18px/600), orb timer (38px/600,
  tabular-nums), section titles, moment title (17px/600).
- **Body/UI:** Nunito (400–900). Body, button labels (14px/800), quick-log labels (11px/800),
  timeline labels.
- **Eyebrow/state label:** 10px, weight 800, letter-spacing .12em, uppercase, accent-colored.

### Border radius
```
r-lg 34px (hero/sky)   r-md 24px (cards)   r-sm 16px (small tiles)
pill 999px (buttons)   phone frame 48px (device only, not in-app)
quick-log icon tile ~13px
```

### Card style
White (`#FFFFFF`) or cream surface, `r-md` (24px), generous internal padding (~15–16px),
soft card shadow. No hard borders — separation via shadow + cream background.

### Shadow style
```
soft (hero):  0 22px 50px -18px rgba(60,40,30,.30)
card:         0 10px 26px -14px rgba(60,40,30,.22)
```
Warm-tinted (brown-based), never neutral grey. This is a big part of the cozy feel.

### Icon style
Stroke-based, ~1.9px stroke weight, rounded linejoin/linecap, 20–24px viewBox. Single-color,
tinted to the relevant accent. No filled glyphs, no emoji, no medical iconography.

### Motion style
- Orb "breathe": scale .97↔1.03, 5.5s ease-in-out, infinite.
- State change: opacity + translateY(6px), .32s ease.
- Sky gradient + progress ring: .7s ease.
- Press feedback: scale .96 on active.
- **Always** honor `prefers-reduced-motion` / Reduce Motion (kill animations, keep state).

### Component rules
- Cream background is sacred — never a white or dark app background.
- One accent at a time, set by the active state.
- Everything rounded; nothing sharp. Shadows, not borders.
- Big targets, lower-screen weighting for thumb reach.
- Text hierarchy via Fredoka/Nunito + size, not heavy color.

### Bottom tab bar visual direction
Floating, rounded (`r-md`+), cream/white with the soft card shadow — echo the mockup's
`.lb-demo-tabs` pill container (rounded 18px, soft shadow, active item gets a white chip +
shadow). Active tab uses the current accent or ink; inactive uses `ink-soft #736E86`.
Icons in the same stroke style. Never the default flat RN tab bar.

---

## 7. Expo React Native Build Plan

### Build order (UI-first, data-mocked)
1. **Project + design foundation.** Expo Router app, NativeWind configured with the tokens
   from §6, `expo-font` loading Fredoka + Nunito, a `theme` module exporting colors/radii/shadows,
   and an accent-by-state helper.
2. **Reusable primitives** (see component list below) before any screen.
3. **3-tab shell** (Tonight · Log · Reassure) wired in Expo Router so the tab bar exists from
   the very first prototype — even before the tabs are fully filled. No empty/fake tabs.
4. **Tonight** against a **local mock data store** (in-memory + AsyncStorage). Get the orb,
   quick-log, timeline, and partner card feeling right with fake events. The make-or-break screen.
5. **Feed → Sleep → Diaper** log flows, writing to the mock store, updating the orb live.
6. **Log (history)** reading the same mock store (Today/Yesterday grouping, filters, night recap).
7. **Reassure** — the five static safe cards (hiccups, spit-up, gas, won't sleep, when to call a
   doctor) as bundled local content (§8).
8. Only now: **Supabase** behind the same data interface, then **auth**, then **partner sync**,
   then **push**, then **EAS** production builds and store submission.

### Reusable components to create first (in this order)
1. `ThemeProvider` / tokens + `useAccent(state)` — colors, radii, shadows, fonts.
2. `Screen` / cream `Background` wrapper (safe-area aware, handles notch).
3. `Card` (rounded surface + warm shadow) — base for everything.
4. `OrbHero` (sky gradient + breathing orb + progress ring + core slot) — the signature.
5. `PrimaryActionButton` (accent pill, press-scale).
6. `BabyHeader` (avatar + name + age + caregiver stack, tappable → Settings).
7. `AvatarStack` / `CaregiverAvatar`.
8. `QuickLogRow` + `QuickLogButton` (tinted tiles, active ring).
9. `TimelineCard` + `TimelineItem` (time · dot icon · label · who-chip).
10. `Eyebrow` / `StatLabel` (uppercase accent micro-label) + `LogSheet` (bottom sheet for entries).

### Data models (P0, shape for multi-caregiver from day one)
```ts
Baby        { id, name, birthDate, avatarKey, createdBy }
Caregiver   { id, displayName, colorHex, role }          // mom/dad/other
BabyCaregiver { babyId, caregiverId, role }              // join — enables partner sync later
LogEvent    { id, babyId, caregiverId, type, startAt, endAt?, meta, createdAt }
            // type: 'feed' | 'sleep' | 'diaper' | 'pump'
            // feed/sleep = interval (startAt + endAt); diaper = instant (endAt null)
            // meta: feed{side:'L'|'R'}, diaper{kind:'wet'|'dirty'|'both'}, pump{amountMl}
```
Reassurance content is **not** a DB model for MVP — bundle it as typed local JSON validated
by a schema (matches the prior plan's red-flags/source gate), shipped with the app.

### Supabase tables (later — after the mock UI works)
`babies`, `caregivers` (or reuse `auth.users` profiles), `baby_caregivers`, `events`.
RLS scoped so a caregiver only sees babies they're linked to. Realtime on `events` powers
partner sync. Keep the existing landing `waitlist` table untouched. Reassurance stays bundled
JSON unless/until editing cadence demands a CMS.

### Mock locally first
- All four log types, the timeline, and the orb states run off the local store with seeded
  fake data — so the whole night loop is demoable with **zero backend**.
- The mock store and the eventual Supabase data layer implement the **same interface**, so
  swapping in Supabase is a backend change, not a UI rewrite.

### Wait until after the UI prototype
Auth, Supabase wiring, realtime partner sync, push notifications, EAS production builds /
store submission, deep links, analytics. None of these should block getting the home loop
to feel right on a real phone via Expo Go.

---

## 8. Medical Safety / Reassurance Boundaries

**What reassurance CAN safely do**
- Offer calm, plain-language framing for common, usually-benign newborn worries.
- State a general "what's typically normal" range.
- Always pair it with conservative red-flag triggers and a link to a trusted source (e.g. AAP).
- Capture a low-pressure "Did this help?" signal.

**What it MUST avoid**
- Diagnosing, naming conditions, or estimating probability of illness.
- Personalized medical advice or dosing.
- Anything that reads as a symptom checker or replaces a clinician.
- Coupling reassurance to the baby's logged data (no "based on her feeds, this is fine").

**Red-flag handling**
- Every topic has a "Call your provider if…" block, conservative by default.
- Convey urgency with icon + the word **"Call"** — never color alone, never a blaring red.
  Use the brand's warm terracotta, not an alarm red.

**Source / review requirements**
- **P0 static cards** (hiccups, spit-up, gas, won't sleep, when to call a doctor) can exist in
  the prototype as bundled local content, written conservatively to these rules from the start.
- **Before any public launch**, a qualified reviewer (pediatric nurse / doctor / vetted source)
  must sign off every card. This stays a hard pre-launch ship-blocker, enforced in code: a card
  missing `red_flags` (non-empty) or `source` fails validation and cannot build.
- "When to call a doctor" is the safest framing of the set — keep it general (fever thresholds,
  breathing, dehydration, lethargy as "call your provider" triggers), never a diagnosis.

**Copy tone rules**
- Warm, honest, short. Reassuring-but-truthful, never falsely calming.
- Plain words, the worry in the parent's own language as the title.
- Never alarmist, never clinical-cold, never cute about real risk.

**Where disclaimers appear (without ruining the calm)**
- A persistent, quiet global line on reassurance screens: "General information, not medical
  advice. When in doubt, call your pediatrician." Small, low-contrast, always present.
- **Not** plastered on logging screens — those stay clean. The disclaimer belongs to the
  reassurance surface, shown once per screen at the bottom, not as a modal or a nag.

---

## 9. Final Recommendation

**Recommended MVP scope**
Ship a **3-tab app from the first prototype**, every tab with real local/mock content: one baby,
Tonight orb dashboard with feed/sleep/diaper logging + timeline + partner card, a real Log
history screen, and five static safe Reassure cards. Offline-first local storage. Pump, real
partner sync, and richer reassurance are P1 — designed for now, built next.

**Recommended bottom tab bar**
Three tabs: **Tonight · Log · Reassure.** Logging stays on Tonight (quick-log row). Partner is
a card inside Tonight (P1 tab later). Settings lives behind the baby header. No 4th/5th tab for MVP.

**First 5 screens to build**
1. Tonight dashboard (orb + quick-log + timeline + partner card) — build first, it's the product.
2. Feed logging (start/stop timer + side).
3. Sleep logging (start/stop timer).
4. Diaper logging (one-tap sheet).
5. Log (history) — Today/Yesterday grouping + filters + recap, reading the same mock store.
(Baby Profile Setup is a prerequisite stub — hardcode a baby first, build the real setup screen
right after the loop feels good. Reassure's five static cards and Onboarding come right after.)

**First 10 reusable components to create**
`ThemeProvider`/tokens · `Background` · `Card` · `OrbHero` · `PrimaryActionButton` ·
`BabyHeader` · `AvatarStack` · `QuickLogRow`/`QuickLogButton` · `TimelineCard`/`TimelineItem` ·
`Eyebrow` + `LogSheet`.

**Do NOT build yet**
- Supabase wiring, auth, and realtime partner sync (mock locally first).
- Push notifications.
- Reassurance beyond the five static P0 cards — no richer/dynamic content, and no public
  launch of even the five cards before clinical sign-off (§8).
- Multiple babies, growth charts, AI insights, cry analysis, data export.
- Paywall / premium.
- Any in-app version of the landing's scroll-driven state-swap animation.
- EAS production builds / store submission (until the home loop feels right on a real device).

---

## 10. Expansion Principle (grow without rewriting the core)

The 3-tab structure is chosen so the app can grow carefully later without touching the core
loop. Each future addition has a designated, non-disruptive home:

- **More log types (Pump / Bottle / Medicine):** add as actions under Log or an overflow in the
  quick-log row. The `LogEvent` model already carries `type` + `meta`, so new types are data,
  not new screens or a schema rewrite.
- **Real Partner sync:** already lives as a card inside Tonight and is backed by the
  `BabyCaregiver` join table from P0. Promote it to its own tab/screen only when it has real
  invite + realtime functionality — no core rework, just unlocking what's already modeled.
- **Supabase / auth:** the UI is built against a local mock store with the same interface as the
  eventual Supabase layer, so going online is a backend swap, not a UI rewrite.
- **Push notifications:** added on top of the existing event timers (e.g. "feed running 45 min");
  no structural change.
- **Production reassurance:** the Reassure tab already exists with safe static cards; richer or
  dynamic content slots into the same surface — and only after the §8 safety review.

Net: every growth path is either new *data* on an existing model, a *promotion* of something
already present (partner card → tab), or a *backend swap* behind an unchanged UI. The three tabs
and the core night loop never need to be rebuilt.

---

*Source of visual truth: `.reference/lullaby-phone-mockup.html`. Keep it open while building
the components in §7. Don't redesign — translate.*
