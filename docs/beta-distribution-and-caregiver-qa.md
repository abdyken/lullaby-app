# Lullaby — Beta Distribution & Caregiver QA

Status: Operational · Companion to `docs/retention-test-plan.md`, `docs/testflight-readiness.md`

Related change: commit `0314161e08df61c06fac5f218459f174bde6f907` — *Fix caregiver invite role
selector and beta share copy* (Mom/Dad/Other selector no longer disappears on Android; invite
share text now supports beta distribution via the optional `EXPO_PUBLIC_APP_INSTALL_URL`).

---

## 1. Purpose

- How to get Lullaby onto real **test parents' phones before any App Store / Google Play
  release**.
- How to test the **caregiver invite** flow and **two-phone sync** (the handoff wedge).
- This exists for **retention testing before pricing** — we are measuring whether parents come
  back night after night. No payments, no paywall, no store dependency required to run it.

---

## 2. Parent-test build env

Set these for a parent-test (sync) build. `EXPO_PUBLIC_*` values are **build-time inlined**, so
changing any of them requires a fresh build / `expo start --clear`.

```
EXPO_PUBLIC_PRO_PREVIEW_ENABLED=0
EXPO_PUBLIC_FORCE_ONBOARDING=false
EXPO_PUBLIC_APP_INSTALL_URL=<internal beta install link>
EXPO_PUBLIC_SUPABASE_URL=<dev/staging Supabase URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable anon key>
EXPO_PUBLIC_THEME_REVEAL_DURATION_MS=600
```

- **`EXPO_PUBLIC_PRO_PREVIEW_ENABLED=0`** — Pro preview must be **disabled** for real parent
  testing. The control cohort measures pure logging retention without any Pro messaging, and no
  card should ever imply a charge during the parent test.
- **Logging is canonical by default** — there is no `EXPO_PUBLIC_LOGGING_V2` parent-test
  toggle. Feed, sleep, diaper, pump, note, and spit-up writes go through the canonical logging
  store; legacy rows are read through the compatibility mapper so old data still appears.
- **`EXPO_PUBLIC_FORCE_ONBOARDING=false`** — testers go through onboarding once, then land in
  the app normally on subsequent opens.
- **`EXPO_PUBLIC_APP_INSTALL_URL`** — point this at the **Android internal install link** now,
  and swap it for the **TestFlight link** later. When set, the invite share text embeds this
  link as the beta install step; when unset, the invite tells the recipient to install "from
  the link I sent you". Never a raw App Store / Google Play URL — those are added by the store,
  not by us.
- **Do not commit real install links or secrets.** Keep them in local `.env` / EAS env vars.

---

## 3. Important security rules

- **Do not put real install links into git** unless they are intentionally public. Use
  placeholders in tracked files and docs.
- **Do not commit the Supabase anon key** if repo policy says env files are local-only. Anon
  keys are publishable and inlined at build time, but they still don't belong in the repo when
  policy keeps `.env` local.
- **Never** put a Supabase URL/key, invite codes, baby names, notes, or any medical/free-form
  data into **analytics props**. Props stay coarse: counts (`dataDays`), UI `source`/`surface`,
  a flow `method`. (See `docs/retention-test-plan.md` §4 for the full clean-props contract.)
- The **invite share text must not contain secrets** — only the human-readable invite code and,
  when configured, the beta install link. No Supabase URL/key ever.

---

## 4. Android distribution plan

- Distribute via an **internal / beta build link** (e.g. EAS internal distribution or a signed
  APK/AAB behind an internal channel). Put that link in `EXPO_PUBLIC_APP_INSTALL_URL`.
- Testers **install the app from the link**.
- They then **open the app and choose "Join with a code."**
- The **Android parent test must not be blocked** by an App Store / Google Play public release —
  internal distribution is enough to run the retention experiment.

---

## 5. iOS distribution plan

- Use **TestFlight** for iOS testers (see `docs/testflight-readiness.md` for the build gate).
- **External** TestFlight distribution may require App Review; **internal** TestFlight does not.
- **Do not block the first Android retention test on iOS.** Android internal distribution can
  start recruiting immediately; iOS follows when TestFlight is ready.

---

## 6. Invite flow QA checklist

Run in the parent-test build, from the Account sheet → **Invite a caregiver**:

- [ ] Open the **Invite caregiver** sheet.
- [ ] Tap **Mom**, then **Dad**, then **Other**.
- [ ] All three options **remain visible and readable** at every tap.
- [ ] **No flicker / disappear** when switching selection (validate on a real Android device —
      this was the Android-specific repaint bug).
- [ ] **No layout jump** / resize when a role becomes selected.
- [ ] **Share code** message includes **install instructions** (beta link step, or the
      "install from the link I sent you" fallback when `EXPO_PUBLIC_APP_INSTALL_URL` is unset).
- [ ] Share message includes **"Join with a code."**
- [ ] Share message includes the **invite code**.
- [ ] Share text does **not** include the Supabase URL/key.
- [ ] No **baby name** (or any free-form data) is put into analytics props for the invite —
      `caregiver_invited` sends **no props**.

---

## 7. Two-phone caregiver QA checklist

Exercises the real sync wedge end to end (two phones, two accounts, one baby):

- [ ] **Phone A** (owner account): open or create the baby.
- [ ] **Phone A**: invite a caregiver (mint a code, Share code).
- [ ] **Phone B**: install the beta app from the install link.
- [ ] **Phone B**: sign in with a **different** account.
- [ ] **Phone B**: choose **"Join with a code."**
- [ ] **Phone B**: enter the invite code.
- [ ] **Phone B**: sees the **same baby**.
- [ ] **Phone A**: create a **Feed** log.
- [ ] **Phone B**: sees the Feed log (sync one way).
- [ ] **Phone B**: create a **Diaper or Sleep** log.
- [ ] **Phone A**: close and reopen the app.
- [ ] **Phone A**: sees the new log / handoff summary / **new-on-open** indicator (sync the
      other way).

---

## 8. SQL / Supabase MCP verification checklist (read-only)

Read-only checks against the dev/staging Supabase project (via Supabase MCP or the dashboard).
Do **not** insert, update, or delete rows here — these confirm the app wrote what it should.

- [ ] The baby has **at least 2 caregiver rows** in `public.baby_caregivers`.
- [ ] **App-created events exist**, excluding seeded test rows (filter out
      `meta->>'seededBy' = 'retention_test_mcp'`).
- [ ] Events come from **both `caregiver_id` values** if both devices logged.
- [ ] `caregiver_invited` exists in `analytics_events`.
- [ ] `caregiver_invite_accepted` exists.
- [ ] `handoff_has_new_on_open` exists (if the reopen/handoff step was tested).
- [ ] `feed_log_created` / `sleep_log_created` exist (if those logs were created).
- [ ] **Analytics props are privacy-safe** — only coarse values (`dataDays`, `source`,
      `surface`, `method`); no names, codes, notes, volumes, or medical/free-form data.
- [ ] **Recent analytics are written to the expected baby**, not a wrong/other baby — confirm
      recent `analytics_events.baby_id` matches the baby under test.

---

## 9. Parent-test readiness exit criteria

All must hold before recruiting parent pairs:

- [ ] Android **install link works** (testers can install from it).
- [ ] **Invite copy works** (install instructions + "Join with a code" + code, no secrets).
- [ ] **Role selector works** (Mom/Dad/Other stay visible, no flicker/jump).
- [ ] **Two caregivers can join the same baby.**
- [ ] **Logs sync both ways** between the two phones.
- [ ] **Handoff / new-on-open works.**
- [ ] **Insights still opens** (and shows the 7-day view + weekly recap once enough data
      exists).
- [ ] **Pro-preview disabled** (`EXPO_PUBLIC_PRO_PREVIEW_ENABLED=0`).
- [ ] **No paywall.**
- [ ] **No payments.**
- [ ] **No RevenueCat.**
- [ ] **No App Store / Google Play dependency** for the Android test.

---

## 10. Local Android dev loop

Two commands, run from the repo root with a device plugged in (USB debugging on) or an
emulator running. RevenueCat is a native dependency, so use `npm run android` (not just
Metro) whenever native deps change.

```
npm run android   # builds + installs the debug/dev APK on the connected device
npm run dev       # starts Metro/dev-client, sets adb reverse, opens the app
```

- **`npm run android`** ([scripts/android-dev.mjs](../scripts/android-dev.mjs)) builds the debug
  APK (`:app:assembleDebug`), installs it on the selected device, and prints
  `Installed. Now run: npm run dev`. It does **not** need Metro running first. Set
  `ANDROID_SERIAL=<serial>` to target a specific device when several are attached.
- **`npm run dev`** ([scripts/dev-client.mjs](../scripts/dev-client.mjs)) prefers port **8081**.
  If **8081 is busy with an unrelated (non-Metro) process** — e.g. a browser — it does **not**
  fail: it automatically picks the next free port (8082, 8083, …), sets `adb reverse` for that
  port, starts Metro on it, and opens the dev build with the matching deep link. You'll see a
  line like `Port 8081 is busy with non-Metro process, using 8082 instead.` **No need to
  manually kill anything.** If 8081 is held by this script's own stale Metro, it's stopped and
  the port reused (as before).
- **Override the port** when you want a specific one:

  ```
  EXPO_DEV_PORT=8082 npm run dev
  # or
  npm run dev -- --port 8082
  ```

  The default (`npm run dev`) stays fully automatic — you never have to run
  `npx expo start --port …` by hand. `Ctrl+C` stops Metro cleanly.
