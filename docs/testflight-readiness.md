# Lullaby — QA & TestFlight Readiness

A single pre-build QA guide. Lullaby runs as a complete **local-only demo** with
no backend; **Supabase caregiver sync is optional** and additive. This doc covers
both, plus what's still needed before a real iOS TestFlight build.

> Scope guardrail (do not regress): Lullaby owns the calm 3am handoff.
> **Reliability is the feature.** No AI, no medical advice/diagnosis, no
> predictions, no growth charts, no paywall, no analytics, no push. QA must not
> introduce any of these.

---

## 1. Prerequisites

- Node + npm, and the Expo CLI via `npx expo` (project is **Expo SDK 56**,
  `expo ~56.0.12`, React Native 0.85, React 19).
- For real-device runs: **Expo Go (SDK 56)** on the phone, or a custom dev client.
- For builds/TestFlight: an **Expo account** + **EAS CLI** (`npm i -g eas-cli`),
  and an **Apple Developer account** ($99/yr) — *not configured here; no secrets
  committed.*
- Supabase mode is optional. Without env vars the app is purely local.

Verify dependency alignment any time deps change:

```bash
npx expo install --check     # "Dependencies are up to date" for SDK 56
npx expo-doctor              # 21/21 checks should pass
```

---

## 2. Commands to run before every build

```bash
npm run check:local-interactions   # pure logic smoke test (60 checks, no RN)
npx tsc --noEmit                   # type check
npm run lint                       # expo lint
npx expo-doctor                    # config/dependency health (optional but advised)
```

All four must pass. Optionally `npx expo export --platform web` to confirm the
module graph (incl. AsyncStorage / Supabase) resolves.

---

## 3. Local-only smoke test (no env vars)

Goal: confirm the demo still works with **no Supabase config**. Ensure `.env` is
absent or both vars are empty.

1. **No auth UI** — app opens straight to the Tonight tab (no sign-in / setup).
2. **Seeded demo** — baby "Mia", a running sleep, one feed, one diaper.
3. **Quick log** — Feed (sheet → Save), Diaper (sheet → Save), Note; orb + timeline
   update; a calm toast shows; a **light haptic** fires on a real device.
4. **Sleep / Wake** — Start sleep → "Sleep running"; Wake baby ends it with a
   duration. Haptic on each.
5. **Undo (local)** — the toast's Undo removes the **most recent event overall**
   (correct on a single device); soft haptic.
6. **Handoff card** — shows the catch-up summary; **Mark caught up** → "Nothing
   new since you last checked." (success haptic). No sync-status line in local mode.
7. **Log tab** — same events, Today/Yesterday grouping, filters, recap line.
8. **Persistence** — reload (shake → Reload, or `r`): events survive.
9. **Reset demo night** (Log tab, `__DEV__` only) — restores the seed **and clears
   the handoff cursor**, so the card shows its catch-up story again (not "Nothing
   new"). Dismisses any toast.
10. **Reassure** — five static cards, top safety note, logged-tonight recap
    (counts only), persistent bottom disclaimer. No diagnosis anywhere.

Haptics are **best-effort**: silent (never an error) on web, many simulators, or
in Low Power Mode.

---

## 4. Supabase two-phone test (optional sync)

Full end-to-end script and known limitations live in
[supabase/README.md](../supabase/README.md). Summary:

1. **Apply migrations** (filename order) and enable the **Email** auth provider;
   turn **Confirm email = off** for the smoothest first run. Confirm Realtime is on.
2. **Set env** — copy `.env.example` → `.env`, fill `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable anon values only — **never** a
   service-role secret). Restart the dev server (env is inlined at build time).
3. A signs up → **New baby** setup → invites caregiver → shares code.
4. B signs up (different email) → **Join with code** → lands on the same baby.
5. Log on A → appears on B within ~1s, attributed correctly; status reads
   **Synced just now**.
6. B taps **Mark caught up** (device-local cursor; A unaffected).
7. **Undo is caregiver-scoped**: each phone's Undo only removes **its own** most
   recent event — never the partner's newer event.

### Auth / invite / realtime checklist

- [ ] **Missing env** → no auth UI; pure local demo (Section 3).
- [ ] **Partial env** (only one var set) → treated as unconfigured → local demo
      (no half-configured crash; see `isSupabaseConfigured`).
- [ ] **Signed-out** → calm email + password sign-in / sign-up surface.
- [ ] **Sign-up, confirmation OFF** → session immediately → baby setup.
- [ ] **Sign-up, confirmation ON** → calm "confirm your email, then sign in" note;
      no crash; sign in works after confirming.
- [ ] **Baby setup (New baby)** → provisions profile + baby + link idempotently;
      reopening never duplicates rows.
- [ ] **Invite creation** → short code, shown for reading aloud / OS share; reuses
      an open code instead of piling up; success haptic.
- [ ] **Join with code** → success haptic, lands on shared baby; bad/expired/used
      codes show calm copy ("expired", "already been used", "doesn't match").
- [ ] **Realtime** → feed/diaper/note/sleep + Undo replicate to the other phone
      within ~1s; correct caregiver attribution.
- [ ] **Handoff summary** → on the non-logging phone, a factual catch-up line that
      refreshes live; **Mark caught up** clears it (per-device).
- [ ] **Sync status line** → `Syncing…` / `Synced just now` / `Offline · will
      retry` (honest: offline changes are in memory, re-pushed on reconnect).
- [ ] **Sign out / re-login** → returns to sign-in; signing back in restores the
      shared baby and live night.

---

## 5. Known limitations (honest, pre-TestFlight)

- **Supabase mode is not offline-persistent** — unsynced changes live in memory
  until reconnect (local-only mode still caches to AsyncStorage). Closing the app
  while offline drops the in-memory change. Status says "will retry", not "saved".
- **Handoff cursor is device-local** — marking caught up on one phone does not
  affect another (it's personal reading state, not shared data).
- **`orbView` is local** — if a partner ends a sleep while your orb shows sleep,
  your orb keeps its view until your next interaction (timeline/status are live).
- **One baby per caregiver** — first linked baby; no multi-baby switching.
- **No invite-management list** — reuse/mint a code; revoke only via SQL.
- **Full re-read on realtime change** (not payload reconciliation) — simple and
  correct at newborn-night volume.
- **Haptics best-effort** — absent on web/simulators/Low Power Mode (never errors).
- **Reassure content is general information, not medical advice** — and is **not
  yet clinically reviewed** (see Section 7).

---

## 6. Pre-TestFlight checklist (iOS)

Native config now present:

- [x] **App name** `Lullaby`, **slug** `lullaby`, **scheme** `lullaby`, version `1.0.0`.
- [x] **iOS bundle identifier** `com.bizhanash.lullaby` and **Android package**
      `com.lullaby.app` set in `app.json`.
- [x] **`eas.json`** with `development` / `preview` / `production` profiles
      (`appVersionSource: remote`, production `autoIncrement`).
- [x] Icons + splash configured (iOS Icon Composer `assets/expo.icon`, adaptive
      Android icon, splash plugin).

Still required (needs accounts/secrets — intentionally not done here):

- [ ] **Confirm the bundle identifier** before the first submission. iOS uses
      `com.bizhanash.lullaby` (Apple Developer did not allow registering
      `com.lullaby.app`); the Android package remains `com.lullaby.app`.
      **The iOS bundle id is permanent once registered** in App Store Connect.
- [ ] **`eas init`** to create the EAS project and inject `extra.eas.projectId`
      (not fabricated here).
- [ ] **Apple Developer Program** membership + an App Store Connect app record.
- [ ] **Supabase env for builds** — set `EXPO_PUBLIC_SUPABASE_URL` /
      `EXPO_PUBLIC_SUPABASE_ANON_KEY` as **EAS environment variables** (per build
      profile), since `EXPO_PUBLIC_*` is inlined at build time. Never commit `.env`.
      (Anon/publishable values only; RLS protects the data — see supabase/README.md.)
- [ ] **Pro-preview flag** — `EXPO_PUBLIC_PRO_PREVIEW_ENABLED` **defaults to `false`**:
      the non-paid Lullaby Pro preview cards (`UpgradeCard` / `ProPreviewCard`) stay
      hidden. Set it to `1` as an **EAS environment variable** *only* for a dedicated
      Pro-preview retention build; leave it unset for control/standard builds. It is
      inlined at build time, so toggling requires a rebuild. No payment or paywall is
      ever implied — the cards only record interest analytics.
- [ ] **Privacy** — App Store privacy questionnaire + a privacy policy URL
      (account email + baby log data are collected in Supabase mode).
- [ ] Decide TestFlight mode: **local-only build** (no env, nothing to disclose) or
      **sync build** (env set; privacy disclosures apply).

Build/submit (once the above are done):

```bash
eas init                       # one-time: creates the EAS project
eas build -p ios --profile preview        # internal-distribution test build
# or, for TestFlight:
eas build -p ios --profile production
eas submit -p ios --latest
```

---

## 7. Clinical review gate (Reassure) — hard ship-blocker

The five Reassure cards (Hiccups, Spit-up, Gas, Won't sleep, When to call a
doctor), the top safety note, the "logged tonight" recap, and the bottom
disclaimer are **general information, not medical advice**, and are written to be
strictly descriptive — no diagnosis, no treatment, no "normal/abnormal" judgement,
no coupling of reassurance to logged data as interpretation.

**Before any public release (incl. an open TestFlight beta):** every Reassure card
must be reviewed and signed off by a qualified clinician. This is a hard gate.
A closed internal TestFlight build for the team is fine pre-review **only if** no
external testers see the Reassure content as guidance.

---

## 8. What QA must NOT add (scope guard)

No push notifications · no AI/chat/coach · no medical claims, diagnosis, or
predictions · no growth charts/percentiles/milestones · no analytics · no paywall ·
no UI redesign. Fixes during QA are narrow bug/copy fixes only.
