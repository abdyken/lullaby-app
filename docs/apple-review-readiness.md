# Lullaby — Apple Review Readiness

Final read-only smoke report for the **Shape A local-only v1** App Store
submission. It summarizes what the overnight Apple-review fix pass (tasks 01–09)
actually changed, what a human still has to do, the exact commands to run, and
the App Store Connect + TestFlight checklists to work through before submitting.

> **Release shape.** Lullaby v1 ships **local-only**: everything a parent logs
> stays on the phone. No Supabase sync, no realtime caregiver sharing, no
> household/entitlement backend, no multiple babies, no push notifications, no
> local-to-account migration. Pro ships **OFF by default**. Keep it that way for
> the first submission.

_Generated: 2026-07-03. App version `1.0.0`. iOS bundle id `com.bizhanash.lullaby`,
Android package `com.lullaby.app` (do not change either)._

---

## 1. Verification status (as of this report)

Run from the repo root — all green for the final review-copy branch
`fix/apple-final-review-copy-and-links`:

| Command | Result |
| --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | ✅ exit 0 |
| `npm run lint` (`expo lint`) | ✅ clean |
| `npm run check:local-interactions` | ✅ All 391 checks passed |
| `git diff --check` | ✅ clean |

There is **no `npm test` script** in this project — the pure-logic smoke suite
(`scripts/check-local-interactions.ts`, run via `npm run check:local-interactions`)
is the test infrastructure. Do not assume a Jest/Vitest runner exists.

---

## 2. What was fixed (tasks 01–09)

| # | Blocker | Status | Summary |
| --- | --- | --- | --- |
| 01 | Reassure safety copy + draft gate | ✅ done | New pure gate `src/features/reassure/domain/contentGate.ts` hides placeholder clinical KB blocks from **public (non-`__DEV__`) builds** until `REASSURE_CONTENT.status` flips to `approved`. Gated topic answers show review-pending copy + a pediatrician pointer; triage escalation stays ungated. Subtitle reads "General supportive information for tonight — not medical advice, never a diagnosis." |
| 02 | Local-only truthful copy | ✅ done via `fix/apple-final-review-copy-and-links` | Account-entry chips read **Saved on this device / Optional account / Privacy-first**. Handoff/Tonight public copy is fixed to **Tonight’s log is saved on this device.** and **Updated just now.** Account/auth/settings/invite copy no longer promises backup, sync, multi-device pickup, shared logs, or caregiver visibility for Shape A local-only v1. Caregiver invite entry points now show a disabled/future-facing **Caregiver invites / Coming later** row instead of opening active sharing. Smoke guards **AE8** and **AE9** pin this. Validation passed: `npm run typecheck`, `npm run lint`, `npm run check:local-interactions` (391/391), and `git diff --check`. |
| 03 | Settings screen from Home header | ✅ done | New route `src/app/settings.tsx` (root Stack sibling of `(tabs)`, **no fifth tab**). Tonight header account button pushes `/settings`; sections: Account, Appearance (Night mode switch), Privacy & data, Support, About. |
| 04 | Privacy / Terms / Support / About | ✅ done | Privacy Policy + Terms of Use link rows, Support `mailto` row (email shown as subtitle), build info in About. Destinations resolve from `src/lib/appLinks.ts` with env overrides (`EXPO_PUBLIC_PRIVACY_POLICY_URL` / `_TERMS_URL` / `_SUPPORT_EMAIL`) falling back to **placeholder** `https://lullaby.app/privacy`, `/terms`, `support@lullaby.app`. All opens are try/catch-guarded. |
| 05 | Account logout + delete account | ✅ done (code) / ⚠️ migration not applied | Sign out was already reachable. Added in-app **Delete account** (two-step confirm) → `AuthProvider.deleteAccount()` → `deleteAccountRemote()` → self-scoped definer RPC in `supabase/migrations/20260703060000_delete_account.sql`. **The migration is NOT applied to the remote Supabase project**; until it is, the flow degrades to a truthful email-request fallback. |
| 06 | Baby profile edit | ⚠️ **partial (not merged)** | Wrapper run failed; no code landed. Baby name + birth date are set during onboarding (`BabySetupScreen`); **there is no post-setup edit affordance**. See §5. |
| 07 | RevenueCat safe for production | ✅ done | Pro ships **OFF** by default (`EXPO_PUBLIC_PRO_ENABLED=0`) so no paywall is reachable in the shipping build. Hardened the defensive "unconfigured" state: `restorePurchases()` short-circuits crash-safely; Restore button is tappable in every paywall state. SDK stays isolated in `src/lib/revenueCat.ts`, all calls try/catch-guarded. Pro card/paywall copy no longer says **doctor-ready summary**, **more caregivers**, or pediatrician-share summary; it now uses the safer future-facing copy **Fuller history, gentle weekly recaps, and export-ready summaries. Coming later.** |
| 08 | Insights error / empty / loading states | ✅ done | `src/features/insights/InsightsScreen.tsx` now has a load-status machine (`loading`/`ready`/`error`) with a calm error card + "Try again", a loading card, and a request-token ref so stale loads are ignored. A read failure no longer masquerades as the empty "Getting started" state. |
| 09 | Typecheck / env / docs / release config | ✅ done | Added the `typecheck` npm script. Verified `.env.example` documents the full 16-var `EXPO_PUBLIC` surface with safe beta defaults (Pro flags off, RevenueCat keys empty). Verified iOS permission strings (mic + speech) in `app.json` plugin config and `ios/Lullaby/Info.plist`; ATS keeps `NSAllowsArbitraryLoads=false`. |

### iOS config confirmed in-repo

- **Bundle id:** iOS `com.bizhanash.lullaby`, Android package `com.lullaby.app`. Do not change either.
- **Version:** `1.0.0`.
- **Permission strings** — only permission-gated native capability is
  `expo-speech-recognition`; both keys present with review-safe copy:
  - `NSMicrophoneUsageDescription` — "Lullaby uses the microphone so you can ask a question hands-free."
  - `NSSpeechRecognitionUsageDescription` — "Lullaby uses speech recognition to hear your question and route it to a safe answer."
- **ATS:** `NSAllowsArbitraryLoads=false` (secure default). No camera / photos /
  location / notifications / background-audio APIs are used.

---

## 3. Exact commands to run before building

Run all of these from the repo root; **all must pass** before an EAS build:

```bash
npm run typecheck                  # tsc --noEmit
npm run lint                       # expo lint
npm run check:local-interactions   # pure-logic smoke suite (391 checks after AE9/W7b)
npx expo-doctor                    # config / dependency health (advisory)
```

To produce the App Store build (does **not** submit — submission is manual, see §4):

```bash
npm i -g eas-cli                   # if not installed
eas login
eas build --platform ios --profile production
```

> `eas.json` has `build.production` configured but **`submit.production` is an
> empty object** — App Store Connect credentials are intentionally not committed.
> `eas submit` will not work until a human wires credentials (see §4). Do **not**
> run `eas submit` from an automated context.

Production build env (set as EAS secrets / in the `production` profile, never
committed): keep `EXPO_PUBLIC_PRO_ENABLED=0`, and set the real
`EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_TERMS_URL`,
`EXPO_PUBLIC_SUPPORT_EMAIL` once the pages/mailbox exist.

---

## 4. Remaining manual tasks (human required)

These cannot be done safely from the automated fixer and gate submission:

1. **Host the Privacy Policy and Terms of Use pages before submission.** The
   in-app links read `EXPO_PUBLIC_PRIVACY_POLICY_URL` and
   `EXPO_PUBLIC_TERMS_URL`, with placeholder fallbacks at
   `https://lullaby.app/privacy` and `/terms`. Those fallback pages must be live
   if used, or production EAS env must point to real hosted pages. A dead privacy
   link is an Apple 5.1.1(i) rejection.
2. **Ensure `support@lullaby.app` (or the `EXPO_PUBLIC_SUPPORT_EMAIL` override)
   is a real, monitored mailbox** — it is also the documented manual
   account-deletion fallback.
3. **Decide the account posture for the reviewed binary.**
   - *If accounts ship disabled/unconfigured (recommended for Shape A):* no
     sign-in is functional, the entry shows the honest "Accounts are not set up
     in this build yet" note, and Delete Account is moot. Simplest to review.
   - *If accounts ship enabled:* you **must** apply the delete-account migration
     first — `supabase db push` (or paste `supabase/migrations/20260703060000_delete_account.sql`
     into the SQL editor). Apple 5.1.1(v) requires in-app deletion to actually
     work when account creation ships.
4. **Ensure the submitted build includes branch
   `fix/apple-final-review-copy-and-links`.** That branch removes stale
   sync/caregiver-sharing handoff copy, disables public caregiver invite entry
   points for Shape A, softens Pro card copy, and adds AE9/W7b smoke guards.
5. **Clinician sign-off for Reassure (task 01 launch gate).** Work
   `docs/reassure-content-review.md` items 1–15, then flip
   `REASSURE_CONTENT.status` to `approved` with `reviewedBy`/`reviewedAt`. Until
   then, public builds correctly show the review-pending card instead of clinical
   KB content — safe to submit, but the feature answers few questions.
6. **Wire EAS Submit credentials** (`eas.json` → `submit.production`): App Store
   Connect API key or `appleId` / `ascAppId` / `appleTeamId`. Use EAS secrets;
   never commit secrets.
7. **Baby profile edit is not implemented (task 06 gap).** Name + birth date are
   only editable during onboarding. Not an Apple blocker, but a likely reviewer/
   user expectation — track as fast-follow.

---

## 5. Remaining Apple-review risks

Ranked by likelihood of a review note for the intended local-only v1:

1. **Dead Privacy/Terms links** — highest risk. Placeholder URLs must be live
   before submission (§4.1).
2. **Delete-account only works after the migration is applied** — if accounts
   ship enabled and the RPC isn't applied, a reviewer testing deletion sees the
   email-request fallback (Apple 5.1.1(v)) (§4.3).
3. **App-privacy questionnaire accuracy** — App Store Connect must declare
   microphone + speech-recognition usage and that the app collects no data / does
   no tracking (local-only). This is a human data-safety step, not enforceable in
   code.
4. **App Store metadata is outside the repo** — description / screenshots /
   review notes must not describe Reassure as medical guidance or an AI doctor,
   and must carry the general-information disclaimer.

**Not a risk for the intended submission:** the paywall. With Pro OFF by default,
no purchase/paywall surface is reachable (task 07). Account-entry and
Handoff/Tonight copy are truthful for Shape A once the submitted build includes
`fix/apple-final-review-copy-and-links`: chips read "Saved on this device",
"Optional account", and "Privacy-first"; the handoff card says the log is saved
on this device and updated just now.

---

## 6. App Store Connect checklist

- [ ] App record created for iOS bundle id **`com.bizhanash.lullaby`** (do not change it).
- [ ] Privacy Policy URL entered — **same** hosted URL the app links to (§4.1).
- [ ] App Privacy ("data safety"): declare **microphone** + **speech recognition**
      usage; **no data collected**, **no tracking** (local-only v1).
- [ ] Age rating questionnaire completed (no objectionable content; a baby-care
      tracker).
- [ ] Category / subtitle / description carry **no medical-advice or AI-doctor
      claims**; include the "general supportive information, not medical advice"
      framing where Reassure is mentioned.
- [ ] Screenshots reflect the actual local-only app (no unimplemented sync/paywall).
- [ ] **Review notes:** state that the app is local-only, works fully offline with
      no account required, and (if accounts are disabled) that sign-in is not part
      of this build. If accounts are enabled, provide a demo account and confirm
      Delete Account works (migration applied).
- [ ] Export compliance: standard HTTPS only, no proprietary encryption.
- [ ] Subscriptions: **none active** for this submission (Pro OFF). Do not attach
      subscription products or paywall metadata.
- [ ] Support URL / marketing URL point to a real, reachable page.

---

## 7. TestFlight smoke checklist

Install the production/preview build via TestFlight and confirm on a real device.
This mirrors the local-only paths in `docs/testflight-readiness.md`, focused on
the Apple-review surfaces the fix pass touched:

**Core logging (must all work offline, no account):**
- [ ] App opens straight to **Tonight** — no forced sign-in / setup wall.
- [ ] **Feed** (breastfeeding side + timer, side-switch; bottle volume + type)
      logs and appears in the timeline.
- [ ] **Sleep** start/stop session; elapsed derives from timestamps; **survives an
      app restart**; appears in the timeline.
- [ ] **Diaper** quick-log in two taps (wet/dirty/both/dry); appears in the timeline.
- [ ] **Pump** side selection (left/right/both) + timer; optional volume after
      stopping; appears in the timeline.
- [ ] Undo on the toast removes the most recent event.

**Apple-review surfaces (fix pass 01–09):**
- [ ] Tonight header account button opens **Settings** (`/settings`); Back returns.
- [ ] Account entry uses truthful local-only chips: **Saved on this device** /
      **Optional account** / **Privacy-first**; no backup/sync/shared-log promise
      appears in account/auth/settings/invite copy.
- [ ] Tonight handoff card reads **Tonight’s log is saved on this device.** and
      **Updated just now.** No sync/shared/caregiver-visibility copy appears.
- [ ] Settings shows **Account / Appearance / Privacy & data / Support / About**.
- [ ] Signed-in account/settings surfaces show **Caregiver invites / Coming later**
      and do not open an active caregiver-sharing invite flow.
- [ ] **Night mode** switch runs the theme transition cleanly.
- [ ] **Privacy Policy** and **Terms of Use** rows open live pages (or show the
      calm inline fallback with the URL, never crash).
- [ ] **Contact support** row opens mail (or shows the email inline if no mail app).
- [ ] **About** shows app version + build number and the not-medical-advice line.
- [ ] **Reassure**: subtitle reads "not medical advice, never a diagnosis";
      topic asks show the **review-pending** card (public build), the
      "Common tonight" accordion is absent, and **triage still offers the
      pediatrician call**.
- [ ] **Insights**: normal history renders; force/observe the **loading** card and,
      on a read failure, the **error card + Try again** (empty state only when
      there is genuinely no data).
- [ ] **No paywall / upgrade surface is reachable** anywhere (Pro OFF).
- [ ] *(Accounts enabled only)* Sign out returns to the account-entry surface;
      **Delete account** two-step confirm completes and lands on account entry
      (requires the migration applied).

---

## 8. References

- `docs/testflight-readiness.md` — broader QA + build guide.
- `docs/release-env.md` — env var surface and safe defaults.
- `docs/reassure-content-review.md` — clinician sign-off manifest (task 01 gate).
- `.claude-night/reports/*.status.json` — per-task machine-readable reports (01–09).
- `supabase/migrations/20260703060000_delete_account.sql` — delete-account RPC
  (apply before enabling accounts).
