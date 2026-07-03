# Lullaby — v1 Free vs Pro monetization model

The final v1 decision on what is Free, what is Pro, and what waits. This is the
product source of truth; it is cross-referenced against the actual gate code and
must stay in sync with it.

Companion docs: `docs/pro-implementation-plan.md` (the build ticket / architecture),
`docs/release-env.md` (env postures + the "Pro off unless explicitly enabled" rule),
`docs/pricing-strategy.md` (pricing north-star), `docs/retention-test-plan.md`.

**One-line split:** Free = "log the night and know what happened." Pro =
"keep the pattern, share it, and get the gentler phrasing." Core logging and
safety are never gated.

The gate rule lives in one dependency-free leaf, `src/lib/proGates.ts`, and the
"core logging never gated" invariant is enforced by `scripts/check-local-interactions.ts`
(§W). Nothing below overrides that.

---

## 1. Final v1 Free plan

Everything a parent needs to actually run the night is free, for everyone, in
every posture:

- Onboarding and baby profile setup.
- Feed logging (breastfeeding with left/right, side-switch, and bottle volume + type).
- Sleep logging (start/stop active session).
- Diaper logging (wet / dirty / both / dry, two-tap quick log).
- Pump logging (left / right / both, timer sessions, optional volume after stop).
- Active timers for breastfeed / sleep / pump sessions (timestamp-based, survive restart).
- Home / Today ("Tonight") screen: orb, quick-log, time-since-last, handoff.
- Timeline / History: **the full timeline, all events, no depth limit today** (see the
  history note in §5 and §7).
- Insights: the 7-day analytics view (feed rhythm, longest sleep stretch, wake
  windows, weekly sleep bars, feeds/sleep/diapers per day) plus the free descriptive
  `WeeklyRecapCard`.
- Reassure: triage-first router, red-flag handling, curated answers, and the
  code-computed night recap. Safety is never behind a paywall.
- Theme switching (day / night "Tonight" theme).
- The first caregiver invite and the two-phone sync / handoff.

Free is not a crippled demo. A single-caregiver or two-caregiver household can run
Lullaby indefinitely without paying.

---

## 2. Final v1 Pro plan

Pro unlocks depth and convenience, never basic tracking. Only two Pro features are
actually built and cleanly isolated today, and those are the v1 Pro surface:

- **Weekly recap export / share** — a keepable, shareable weekly summary built from
  the Insights view-model and sent through the OS share sheet. Descriptive,
  non-medical, aggregate numbers only. Gate: `canExportWeeklyRecap(isPro)`.
- **Reassure AI night-read polish** — an LLM-phrased two-sentence night read layered
  on top of the free local recap. Gates polish, never safety. Gate:
  `canUseLlmNightRead(isPro)`. Additionally requires the server night-read to be
  enabled and explicit on-device AI consent, so it stays dormant until that backend
  is live.

That is the whole v1 Pro surface. Extended history, the pediatrician summary, and
extra caregivers have predicates reserved but no live feature behind them yet (see
§5) — they are v1.1, not v1.

---

## 3. Never gate in v1 (hard rule)

These must never be blocked by Pro, ever. Gating any of them erodes the trust the
whole category runs on and is blocked by the smoke suite (§W):

- Onboarding.
- Baby profile creation.
- Feed / Sleep / Diaper / Pump logging.
- Active timers.
- Today / Home view.
- Basic app usage.
- The first caregiver invite + realtime sync + handoff.
- Reassure safety / triage / red-flags / the local night recap.

Core-logging and first-invite source files are forbidden from importing the Pro
modules at all (`scripts/check-local-interactions.ts` §W), so this can never regress
by accident.

---

## 4. v1.1 or later

Deferred unless already trivial (none of these is trivial today):

- **Multiple babies** — single-baby only today (`AuthProvider` exposes one `baby`).
  Genuine new feature.
- **Extra caregivers (3rd+)** — `canAddExtraCaregivers` exists but returns `true`
  (open). The first invite stays free forever; only the 3rd+ would ever be gated,
  and not in v1.
- **Advanced reminders / routines / notifications** — none built (no `expo-notifications`).
- **PDF / CSV export** — today's export is share-sheet **text** only. A formatted
  PDF/CSV is later work.
- **Pediatrician / doctor summary** — `canSharePediatricianSummary` exists but no
  builder/feature behind it. Reuse the weekly-export pattern when built.
- **Full / extended history depth** — `canViewFullHistory` exists but is applied
  nowhere; History shows everything to everyone. Making history a Pro depth-gate
  means building a free-window cutoff first (a real feature), so it is v1.1.
- **Premium themes / deeper personalization.**
- **Advanced AI personalization** beyond the night-read polish.

---

## 5. Existing gate mapping

Cross-referenced against the code as it stands. "Gate" = the predicate in
`src/lib/proGates.ts`.

| Feature | Current file / gate | Free behavior | Pro behavior | Gate now / later / never | Risk | Notes |
|---|---|---|---|---|---|---|
| Feed / Sleep / Diaper / Pump logging | `src/features/logging/*` (no Pro import) | Full, unlimited | Same | **Never** | n/a | Enforced free by §W |
| Active timers | logging session use-cases | Full | Same | **Never** | n/a | Timestamp-based, restart-safe |
| Today / Home | `src/app/(tabs)/index.tsx` | Full | Same | **Never** | n/a | The nightly habit loop |
| Timeline / History | `src/app/(tabs)/log.tsx` (`loadAllEvents`, unbounded) | **Full history, all events** | Same today | **Later** | Low | `canViewFullHistory` defined but **not applied**; gating needs a free-window cutoff (v1.1) |
| Insights (7-day) | `src/features/insights/InsightsScreen.tsx` | Full 7-day view + free `WeeklyRecapCard` | Same (7-day) | **Never (free) for v1** | Low | Insights is inherently 7-day; no longer window is built to unlock |
| Weekly recap export | `ProPreviewCard.tsx` + `shareWeeklyExport.ts` / `buildWeeklyExportText.ts`, gate `canExportWeeklyRecap` | View free recap; export CTA opens paywall | Real share-sheet weekly recap | **Now** | Low | Fully built + isolated. The v1 Pro anchor |
| Reassure triage + recap | `src/features/reassure/*` (no gate import) | Full | Same | **Never** | n/a | Safety is never gated |
| Reassure AI night-read | `src/features/reassure/application/nightRead.ts`, gate `canUseLlmNightRead` | Local computed read | LLM-phrased read | **Now (dormant)** | Low | Isolated; needs server night-read on + on-device consent, so lights up only when backend is live |
| Pediatrician summary | `canSharePediatricianSummary` (predicate only) | n/a | n/a | **Later** | Med | No feature behind the gate yet |
| Extended history depth | `canViewFullHistory` (predicate only) | Full history free | n/a | **Later** | Med | Needs the cutoff feature first |
| Extra caregivers (3rd+) | `canAddExtraCaregivers` → `true` | First invite free | n/a | **Later** | Med | Must stay open; first invite free forever |
| Multiple babies | not implemented | Single baby | n/a | **Later** | High | Greenfield feature |
| Reminders / notifications | not implemented | none | n/a | **Later** | High | Nothing to gate yet |
| Premium themes / personalization | not implemented | Full theme toggle | n/a | **Later** | Low | Theme toggle stays free |

---

## 6. Final recommendation

**Free in v1:** onboarding, baby profile, all four logging flows, active timers,
Today/Home, the full timeline, the 7-day Insights view + free weekly recap card,
Reassure triage/recap/local night read, theme switching, the first caregiver invite
and sync.

**Pro in v1:** the weekly recap export (`canExportWeeklyRecap`) as the anchor, plus
the AI night-read polish (`canUseLlmNightRead`) which only activates once its server
backend and consent are in place.

**Waits until v1.1+:** extended/full history depth, pediatrician summary, multiple
babies, extra caregivers, reminders/notifications, PDF/CSV export, premium themes,
deeper AI personalization.

**Gates safe to enable now:** `canExportWeeklyRecap` — fully built, isolated, and the
free path degrades to viewing the recap. `canUseLlmNightRead` is also safe to leave
on because it stays dormant without its server + consent; it never blocks the free
local read.

**Gates that must stay disabled / unwired for release safety:**
`canViewFullHistory` (enabling the predicate does nothing today, and a naive cutoff
would hide data parents expect to see — build the feature first),
`canSharePediatricianSummary` (no feature behind it, so a live gate would dead-end),
and `canAddExtraCaregivers` (must remain open — never gate the first invite pair).

**Does the current code already match this model?** Yes. With
`EXPO_PUBLIC_PRO_ENABLED` off (the default), everything resolves free for everyone.
The only wired paid features are weekly export and the LLM night-read, both cleanly
isolated behind their predicates. History is free (ungated), which matches "basic
history is free." No code change is needed to match this model.

---

## 7. Code safety check (mismatch report)

Prefer documentation over implementation: **no code change was made for this
document, and none is required.** One thing to name explicitly so it is not read as
a bug:

- `canViewFullHistory` and `canSharePediatricianSummary` are **predicates with no
  live wiring**, and `canAddExtraCaregivers` intentionally returns `true`. This is by
  design — they are stable seams reserved for v1.1 features, documented as such in
  `proGates.ts`. It is a docs/intent alignment note, not a defect, and applying any
  of them in v1 would require building the underlying feature first. So there is **no
  code/doc mismatch that warrants a code edit** right now.

If a future change wants history to be a Pro depth-gate, that is a v1.1 feature
(add a free-window cutoff in `log.tsx` and wire `canViewFullHistory`), not a flip of
an existing switch.

---

## 8. Before turning `EXPO_PUBLIC_PRO_ENABLED=1`

The model matches the code; going live is external setup plus a deliberate flag flip
(all four required, per `docs/release-env.md`):

1. **RevenueCat dashboard:** entitlement `pro`, offering `default` with Monthly +
   Annual packages attached to the store products; copy the public SDK keys.
2. **App Store Connect / Google Play:** auto-renewable products (clean names
   `lullaby_pro_monthly` / `lullaby_pro_yearly`) in one subscription group; a sandbox
   tester (iOS) and internal testing track (Android).
3. **Env:** `EXPO_PUBLIC_PRO_ENABLED=1` + real `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
   (and/or Android) + `ENTITLEMENT_ID=pro` + `OFFERING_ID=default`, with
   `EXPO_PUBLIC_PRO_DEV_ENTITLEMENT=0`. Empty keys with `PRO_ENABLED=1` is the
   "unconfigured" state — never ship it on purpose.
4. **Legal:** the paywall now shows Terms of Use + Privacy Policy links via
   `src/lib/appLinks.ts` (`EXPO_PUBLIC_TERMS_URL` / `EXPO_PUBLIC_PRIVACY_POLICY_URL`).
   Host real pages (or set those vars) before submission.
5. **Sandbox test:** purchase, cancel, restore, already-subscribed, missing-keys,
   signed-out, on iOS and Android.
6. **EAS per-profile env:** add `env` blocks in `eas.json` so the shipped Pro mode is
   a profile decision, not leftover machine `.env` state.

Until all of the above are in place, keep `EXPO_PUBLIC_PRO_ENABLED=0`; the app is
fully functional and review-safe with Pro off.
