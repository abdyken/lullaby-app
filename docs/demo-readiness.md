# Lullaby — Demo Readiness Checklist

A practical pre-demo guide for the **local-only P0 prototype**. The app runs the
full night loop with **zero backend**: log on Tonight, review on Log, persist
across restarts, and read calm static cards on Reassure.

> Scope reminder: this is a prototype. No Supabase, no auth, no partner sync, no
> push, no AI, no EAS. Everything is local to the device.

---

## A. What is real in this MVP

- **Tonight quick logging** — Feed, Diaper, and Note open a quick bottom sheet;
  Sleep is the immediate stateful action. The orb reflects the current state and
  the contextual button (Start sleep / Wake baby / End feed / Done) works.
- **Toast + Undo** — each save shows a calm confirmation toast that auto-dismisses;
  Undo removes the most recently saved event.
- **Haptics (best-effort)** — a light tap confirms a save (Feed / Diaper / Note /
  Start sleep / Wake baby), a soft tap confirms Undo, and a success buzz confirms
  Mark caught up. Purely additive: on a device without a haptics motor (web, many
  simulators, Low Power Mode) it is simply silent and never errors.
- **Local handoff card (Tonight)** — a small partner/handoff card below the
  timeline shows who logged the latest event (e.g. "Mom logged the last feed")
  with caregiver color chips, or "Both caregivers are ready" when nothing is
  logged. It reflects the **local** caregiver/event model on this device only —
  no invite, no account, no cloud, no realtime.
- **Handoff summary (Tonight)** — the handoff card leads with a calm, FACTUAL
  catch-up line built from events since you last checked, e.g. "While you were
  away: 2 feeds and 1 diaper. Sleep is running." A low-emphasis **Mark caught
  up** action stamps a device-local cursor (after a small success haptic), after
  which it reads "Nothing new since you last checked." Strictly descriptive — no
  advice, no predictions, no "normal/abnormal". In the local demo it summarizes
  the seeded/current events on this device.
- **Log shared history** — the Log tab reads the **same** local events as
  Tonight via `useLocalEvents()`, with Today/Yesterday grouping, Feed/Sleep/
  Diaper filters, a one-line night recap, and a warm empty state.
- **AsyncStorage persistence** — events + orb view survive reload and full app
  restart (hydrate on mount, save on change; guarded so the seed never
  overwrites real saved data before loading completes).
- **Reassure static cards + calm recap** — five fixed, conservative,
  non-diagnostic cards (Hiccups, Spit-up, Gas, Won't sleep, When to call a
  doctor) plus a top safety note, a persistent bottom disclaimer, and a calm,
  non-medical recap of what was logged tonight (counts only, no judgement).
- **Local-only behavior** — one hardcoded baby (Mia), in-memory store backed by
  AsyncStorage. No network calls of any kind.

---

## B. What is intentionally NOT built yet

- **Supabase / cloud sync** — local store only (same interface for a later swap).
- **Auth / accounts** — none.
- **Real partner sync** — the local handoff card **is** built inside Tonight
  (see section A), but it is on-device only. Caregiver invite, accounts, cloud
  sync, and realtime partner sync are P1 and **not** built.
- **Push notifications** — none.
- **AI reassurance** — none; no chat, no symptom checker.
- **Medical diagnosis / treatment** — explicitly out of scope (general info only).
- **Reassure detail articles** — cards are visually pressable but no-op for now.
- **Paywall / premium** — none.

---

## C. Demo script (happy path, ~90 seconds)

1. **Open Tonight** — point out the orb, baby header, quick-log row, timeline,
   and the local handoff card below the timeline.
2. **Add Feed** — tap Feed, pick a side in the sheet, Save; orb switches to the
   feed state, a row appears, and the handoff card updates to "… the last feed".
3. **Add Diaper** — tap Diaper, pick a type, Save; a diaper row appears and the
   handoff card updates to the latest event.
4. **Add Note (optional)** — tap Note, pick a preset (Fussy / Cried / Settled),
   Save; a note row appears.
5. **Undo (optional)** — use the toast's Undo to remove that last save and show
   the timeline + handoff card revert.
6. **Start Sleep** — tap Sleep (or the orb's "Start sleep"); sleep starts
   running ("Sleep running") and the handoff card reflects the sleep start.
7. **Wake baby** — tap the orb's "Wake baby"; sleep ends with a duration and the
   orb returns to calm.
8. **Open Log** — show the same events grouped by day, the recap line, and the
   Feed/Sleep/Diaper filters.
9. **Reload the app** — shake → Reload (or `r` in the terminal); events are
   still there → persistence works.
10. **Open Reassure** — show the five calm static cards, the calm logged-tonight
    recap, the top safety note, and the bottom disclaimer. Note: content is
    general information, not advice.

---

## D. Real-device manual checklist (Expo Go)

Run on a real phone (e.g. OnePlus / Android via Expo Go), in a dim room:

- [ ] **Layout** renders correctly on the device (no cut-off header/notch issues).
- [ ] **Tabbar does not cover content** — last card on each tab is fully visible
      above the floating pill; scroll to the bottom to confirm clearance.
- [ ] **Scroll works** on Tonight, Log, and Reassure.
- [ ] **Feed spam prevention** — tapping Feed twice quickly adds only one feed.
- [ ] **Diaper spam prevention** — tapping Diaper twice quickly adds only one.
- [ ] **Sleep does not duplicate** — tapping Sleep while already sleeping does
      not start a second sleep.
- [ ] **Wake baby ends sleep** — "Sleep running" becomes a finished sleep with a
      duration; orb returns to calm.
- [ ] **Handoff card updates** — after each Feed/Diaper/Note/Sleep save, the
      Tonight handoff card reflects the latest event and the correct caregiver
      chip; Undo reverts it; it never implies cloud/realtime sync.
- [ ] **Log filters work** — All / Feed / Sleep / Diaper narrow the list correctly.
- [ ] **Events persist after reload** — and after a full close/reopen of Expo Go.
- [ ] **Reassure copy is safe and static** — no diagnosis, disclaimer present,
      cards don't navigate anywhere (no-op press is expected).
- [ ] **Night legibility** — text is readable, accents are calm, nothing harsh.
- [ ] **Haptics fire on save** — a Feed/Diaper/Note save, Start sleep, Wake baby,
      and Undo each give a subtle tap (best-effort; absent on devices without a
      haptics motor or in Low Power Mode — should never error either way).

---

## E. Commands to run before the demo

```bash
npm run check:local-interactions   # pure logic smoke test (no RN/AsyncStorage)
npx tsc --noEmit                   # type check
npm run lint                       # lint
npx expo export --platform web     # optional bundle smoke check
```

All three of the first commands must pass. The bundle export is optional but
confirms the module graph (including AsyncStorage) resolves.

---

## F. Demo caveats (say these out loud)

- This is a **local prototype**, not a production build.
- **Data is stored locally on the device only** — nothing is uploaded; there is
  no account and no sync between devices.
- **Reassure content is general information, not medical advice.** It does not
  diagnose or treat.
- **Clinical sign-off is required before any public launch** — every Reassure
  card must be reviewed by a qualified provider first (hard ship-blocker).
- The baby (Mia) and caregivers are seeded sample data.

---

## G. Resetting between runs (dev/demo only)

A low-emphasis **Reset demo night** control sits at the bottom of the **Log**
tab. Tapping it calls `resetLocalEvents()` — it clears the persisted local
events from AsyncStorage, restores the seeded night, **clears the device-local
handoff cursor**, and dismisses any active toast, so Tonight / Log / the Reassure
recap all return to the clean seeded state (and stay seeded after a reload). The
cursor reset means the handoff card shows its catch-up story again right away,
instead of "Nothing new" left over from a previous Mark-caught-up.

- **Prototype-only.** It is gated behind React Native's `__DEV__` flag, so it is
  stripped from production/release bundles and never shown to real users.
- Use it to get a clean slate right before a manual QA pass or a live demo.
