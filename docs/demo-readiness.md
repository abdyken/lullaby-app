# Lullaby — Demo Readiness Checklist

A practical pre-demo guide for the **local-only P0 prototype**. The app runs the
full night loop with **zero backend**: log on Tonight, review on Log, persist
across restarts, and read calm static cards on Reassure.

> Scope reminder: this is a prototype. No Supabase, no auth, no partner sync, no
> push, no AI, no EAS. Everything is local to the device.

---

## A. What is real in this MVP

- **Tonight quick logging** — Feed, Sleep, and Diaper from the quick-log row;
  the orb reflects the current state and the contextual button (Start sleep /
  Wake baby / End feed / Done) works.
- **Log shared history** — the Log tab reads the **same** local events as
  Tonight via `useLocalEvents()`, with Today/Yesterday grouping, Feed/Sleep/
  Diaper filters, a one-line night recap, and a warm empty state.
- **AsyncStorage persistence** — events + orb view survive reload and full app
  restart (hydrate on mount, save on change; guarded so the seed never
  overwrites real saved data before loading completes).
- **Reassure static cards** — five fixed, conservative, non-diagnostic cards
  (Hiccups, Spit-up, Gas, Won't sleep, When to call a doctor) plus a top safety
  note and a persistent bottom disclaimer.
- **Local-only behavior** — one hardcoded baby (Mia), in-memory store backed by
  AsyncStorage. No network calls of any kind.

---

## B. What is intentionally NOT built yet

- **Supabase / cloud sync** — local store only (same interface for a later swap).
- **Auth / accounts** — none.
- **Partner sync / handoff** — modeled in data, not built as a feature.
- **Push notifications** — none.
- **AI reassurance** — none; no chat, no symptom checker.
- **Medical diagnosis / treatment** — explicitly out of scope (general info only).
- **Reassure detail articles** — cards are visually pressable but no-op for now.
- **Paywall / premium** — none.

---

## C. Demo script (happy path, ~90 seconds)

1. **Open Tonight** — point out the orb, baby header, quick-log row, timeline.
2. **Add Feed** — tap Feed; orb switches to the feed state, a row appears.
3. **Add Diaper** — tap Diaper; a diaper row appears (instant event).
4. **Start Sleep** — tap Sleep (or the orb's "Start sleep"); sleep starts
   running ("Sleep running").
5. **Wake baby** — tap the orb's "Wake baby"; sleep ends with a duration and the
   orb returns to calm.
6. **Open Log** — show the same events grouped by day, the recap line, and the
   Feed/Sleep/Diaper filters.
7. **Reload the app** — shake → Reload (or `r` in the terminal); events are
   still there → persistence works.
8. **Open Reassure** — show the five calm static cards, the top safety note, and
   the bottom disclaimer. Note: content is general information, not advice.

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
- [ ] **Log filters work** — All / Feed / Sleep / Diaper narrow the list correctly.
- [ ] **Events persist after reload** — and after a full close/reopen of Expo Go.
- [ ] **Reassure copy is safe and static** — no diagnosis, disclaimer present,
      cards don't navigate anywhere (no-op press is expected).
- [ ] **Night legibility** — text is readable, accents are calm, nothing harsh.

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
