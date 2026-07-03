# Lullaby — Ship v1 with a working Pro subscription (plan)

## Context

Goal: ship Lullaby v1 to the App Store **fast**, with a **working paid subscription (Pro ON)**, for a **local-only** app (data on-device, no backend sync). RevenueCat is already integrated (entitlement `pro`, offering `default`, products `lullaby_pro_monthly` / `lullaby_pro_yearly`). The reviewer WILL sandbox-purchase and tap into every advertised Pro feature, so everything behind the paywall must actually work (Apple 2.1) and the subscription must give ongoing value (3.1.2 — the weekly recap, regenerated each week, is that value).

This plan is the result of a code-truth readiness audit (3 explore passes + the team's `docs/MONETIZATION_MODEL.md`). **Headline: only ONE advertised Pro feature actually works today (weekly recap export). The paywall currently advertises two features that are vaporware or free, still says "Coming later.", and — critically — a local/guest user cannot purchase at all.** No code has been changed; this is plan-only, pending your confirmation.

---

## STEP 1 — Pro readiness audit (code truth)

| Feature | State | Where in code | What's missing to *actually work* | Est |
|---|---|---|---|---|
| **Weekly recap export** (anchor) | **DONE** | `ProPreviewCard.tsx:78-106` (gate + `runExport`) → `shareWeeklyExport.ts:19-33` (RN `Share`) → `buildWeeklyExportText.ts:42-73`; real data chain `insightSelectors.ts:21-75` ← `LoggingProvider.tsx:605-614` ← `loggingStorage.ts` (AsyncStorage) | Nothing functional — real 7-day aggregation of on-device logs, native share sheet, fully offline, no missing dep. (Text only; proGates comment says "PDF/CSV" but output is text — copy overclaim only.) | 0h |
| **Already-Pro state** | **DONE** | `PaywallSheet.tsx:42,254`; `UpgradeCard.tsx:51-52`; `ProPreviewCard.tsx:37` | Nothing | 0h |
| **Restore** | **DONE** | `PaywallSheet.tsx:288-309` → `ProProvider.tsx:232-266` → `Purchases.restorePurchases()`; reachable in every non-Pro state | Nothing | 0h |
| **Premium rhythm insights / fuller pattern interpretation** | **STUB (real but FREE, ungated)** | `insightSelectors.ts:187-269` (feed rhythm / longest sleep / wake windows — real math, shown to everyone at `InsightsScreen.tsx:315-324`); window hardcoded 7d (`:89-102`); trend `delta` hardcoded `'steady'` (`:280,296,304`) | Not a Pro feature at all — no `isPro` branch, no deeper/longer variant. Needs a genuine Pro differentiator (extended window + real trends) or it must be pulled from the paywall. | 8–12h (build) / 0h (cut) |
| **Fuller history** | **MISSING (dead gate)** | `canViewFullHistory` `proGates.ts:22` has **zero consumers**; History (`log.tsx:172,196`) shows unbounded full history to everyone | Needs a free-window cutoff + gate wiring + teaser. Team doc marks it **v1.1**. Recommend **CUT** from v1 paywall. | 6–10h (build) / 0h (cut) |
| **Local/guest purchase** | **BROKEN — blocker** | `ProProvider.tsx:138-166` forces `paywallStatus:'signed_out'` when `userId===null`; `canPurchase` `:271` requires `userId`; `revenueCat.ts:82` configures `appUserID = supabase user.id` | The app is fully usable locally with **no account**, but a guest opening the paywall dead-ends at *"Sign in to subscribe."* Needs **anonymous RevenueCat** (configure without a Supabase id) so local users can buy. | 4–8h |
| **Paywall copy / states** | **BROKEN — blocker** | `PaywallSheet.tsx:29` subtitle `"…Coming later."`; `:38`/`:283` `"Subscriptions are not configured in this build yet."`; `:173,225-239` `"Soon"` badge (shows in every non-`ready` state); `ProPreviewCard.tsx:109` `'Soon'` chip | Rewrite subtitle + benefits to real features; remove/relabel "Soon"; guarantee the prod build reaches `ready` so the unconfigured state never shows | 2–4h |
| **Per-period price disclosure** | **MISSING — 3.1.2** | `PaywallSheet.tsx:124-157` renders only `planLabel` + `priceString`; no per-period math in `revenueCat.ts:127-135` | Add period length + per-period price ("$X/month") beside each CTA | 3–5h |
| **Legal links (ToS/PP/support)** | **BROKEN — blocker** | `appLinks.ts:21-23` default to `lullaby.app/*` — **verified live: the whole domain 307-redirects to a GoDaddy "for sale" page** | Host real Privacy Policy + Terms/EULA on a domain you own; set `EXPO_PUBLIC_*` URLs; set ASC Privacy URL; add links to the store description | M (mostly hosting) |

**Explicit confirmation of the two strings you asked about:**
- **"Coming later."** → `PaywallSheet.tsx:29` `SUBTITLE` — a hardcoded constant with **no `getProMode()` branch**, so it renders verbatim on a live, purchasable paywall. (The card-level copies at `ProPreviewCard.tsx:35` / `UpgradeCard.tsx:44` *are* mode-branched off in `enabled` mode, so those are safe.)
- **Unconfigured paywall** → `PaywallSheet.tsx:38` `UNAVAILABLE = 'Subscriptions are not configured in this build yet.'`, rendered as the else-fallback (`:283-284`) whenever `proMode !== 'enabled'` **or** the RC key is missing — i.e. it leaks if you ship `PRO_ENABLED=1` with empty keys (the state the repo docs say to "never ship").

---

## STEP 2 — Minimum shippable Pro

**What actually works and is safe to sell today: the weekly recap export (+ already-Pro + Restore).** That alone satisfies 3.1.2 (a fresh weekly summary each week = ongoing value). But a one-line paywall is thin, and your approved plan wants a second pillar. The fastest honest way to get a real second pillar reuses code that's already ~80% done:

**Recommended v1 sell-list:**
1. **Weekly recap export** — DONE (optionally enrich the text with the already-computed rhythm / longest-sleep / wake-window numbers to make it feel substantial). *The anchor.*
2. **Full rhythm insights** — free = the existing **7-day** preview; Pro = an **extended 30-day** insights view with **real trend deltas** (replacing the hardcoded `'steady'`). Reuses `insightSelectors.ts` verbatim over a longer window. *This is the honest, buildable version of "premium baby rhythm insights / fuller weekly pattern interpretation."*
3. **Already-Pro state + Restore** — DONE.

**Pulled from the v1 paywall (copy + metadata) — do NOT advertise:**
- **Fuller history** — dead gate, v1.1 (team doc). Remove from `BENEFITS`/subtitle.
- Pediatrician/share summary — no feature behind the gate.
- Reassure/AI night read — stays gated + dormant (server kill-switch off); not sold, not advertised.
- Multiple babies, extra caregivers, premium themes, deeper AI personalization — not built.

**Fallback (fastest possible ship):** if the extended-insights pillar can't land in time, **cut it too** and ship **export-only** — enrich the export text so the single Pro feature is genuinely valuable, and reduce the paywall to that one promise. Still 3.1.2-compliant. (Saves ~8–12h.)

**What we actually sell in v1 (CONFIRMED):** *Weekly recap export* + *Full 30-day rhythm insights* (two pillars — you approved building the insights pillar). Nothing else appears in the paywall or the App Store description. Purchase works **without an account** (anonymous RevenueCat — confirmed). Export-only is retained only as a schedule-risk fallback, not the plan.

---

## STEP 3 — Implementation plan (ordered; each ends in a working feature)

> Order is by blocker-first. Tasks 0–3 are mandatory for ANY Pro ship; Task 4 is the second pillar; Task 5 optional polish; Tasks 6–7 are release wiring.

**Task 0 — Anonymous purchase (unblock local/guest buying).** *4–8h.*
- `src/lib/revenueCat.ts`: configure RevenueCat with an **anonymous app user id** when there's no Supabase session (call `Purchases.configure({ apiKey })` without `appUserID`, letting RC mint/persist its own anonymous id; keep the `logIn(user.id)` path for signed-in users). Preserve `logOut` on sign-out.
- `src/state/ProProvider.tsx`: in `computeProSnapshot` (`:138-166`) stop forcing `'signed_out'` when `userId===null`; allow configure + `getOfferings` for anonymous users so `paywallStatus` can reach `'ready'`. Drop `userId !== null` from `canPurchase` (`:271`).
- **Gate by** `pro` entitlement exactly as today (`hasActiveRevenueCatEntitlement`); nothing else changes.
- **Verify:** launch in guest/"Continue locally" mode → open paywall from Insights → packages render → sandbox purchase → `isPro` true → export unlocks → kill/reopen app → still Pro (CustomerInfo persists).

**Task 1 — Paywall copy + kill the blocker states.** *2–4h.*
- `PaywallSheet.tsx`: rewrite `SUBTITLE` (`:29`) and `BENEFITS` (`:31-35`) to only the real sell-list ("Weekly recap export", "Full 30-day rhythm insights"); remove "Coming later.", remove "Fuller history"/"Gentle weekly recaps" claims. Remove or relabel the `'Soon'` badge (`:173,225-239`) and `ProPreviewCard.tsx:109`. Keep the unconfigured/unavailable states in code (safe fallback) but ensure prod never hits them (Task 6).
- Use soft, non-medical wording only: "baby rhythm insights", "weekly recap export", "gentle summaries", "patterns from your logs". Forbid: diagnosis, treatment, guarantee sleep, medical advice.
- **Verify:** in a configured build, paywall shows title + real benefits + packages, no "Soon"/"Coming later"/"not configured".

**Task 2 — Per-period price + period length (3.1.2 disclosure).** *3–5h.*
- `src/lib/revenueCat.ts` (`toProPackageViews` `:127-135`): carry a per-period string (from `pkg.product.pricePerMonthString`/`subscriptionPeriod`, or compute) and an explicit period label ("1 month"/"1 year").
- `PaywallSheet.tsx` `PackageButton` (`:124-157`): render period length + billed price + "(~$X/month)" subordinate to the billed amount (billed amount stays the most prominent element — skill rule `misleading_pricing.md`).
- **Verify:** yearly row shows e.g. "1 year · $44.99 (~$3.75/month)"; billed amount is largest.

**Task 3 — Live legal pages + support (unblock 3.1.2 / 5.1.1 / 1.5).** *1–2h code, hosting external.*
- Host real **Privacy Policy** + **Terms/EULA** on a domain you own; stand up a working support mailbox. Set `EXPO_PUBLIC_PRIVACY_POLICY_URL` / `_TERMS_URL` / `_SUPPORT_EMAIL` for the prod build; set the Privacy Policy URL in ASC; add both links to the App Store description.
- **Verify:** `curl -sI` each URL → `200` to real content (not a 3xx to a parked host); tap both on the paywall + Settings.

**Task 4 — Second pillar: Full 30-day rhythm insights.** *8–12h.* *(CONFIRMED — building this pillar)*
- Parametrize the window: add a `windowDays` param through `getInsightsViewModel.ts` / `insightSelectors.ts` (replace the hardcoded `getLast7LocalDays`), and load a longer history for Pro via `LoggingProvider.loadEventsInRange` (the repo already supports arbitrary ranges).
- Add a Pro-only "Full insights (30 days)" section in `InsightsScreen.tsx`, gated by `isPro`; keep the free 7-day preview intact for everyone. Replace the hardcoded `delta:'steady'` with a real 7-day-vs-prior-7-day trend.
- **Gate:** reuse a proGate (repurpose `canViewFullHistory` → or add `canViewExtendedInsights(isPro)`); free path opens the paywall.
- **Verify:** free user sees 7-day insights + an "Unlock 30-day insights" teaser → paywall; Pro user sees the 30-day section with real trend arrows computed from their logs; offline.

**Task 5 — (optional) Enrich the export text.** *2–3h.* Add the already-computed rhythm / longest-sleep / wake-window lines to `buildWeeklyExportText.ts`. Verify the shared text contains them.

**Task 6 — Env / flags / EAS profile.** *1–2h.* Set `EXPO_PUBLIC_PRO_ENABLED=1`, real `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`, `ENTITLEMENT_ID=pro`, `OFFERING_ID=default`, `EXPO_PUBLIC_PRO_DEV_ENTITLEMENT=0`, legal URLs. Add an `env` block to the `production` profile in `eas.json` so Pro mode is a profile decision, not leftover machine `.env`. **Verify:** a production build reaches `paywallStatus:'ready'`.

**Task 7 — App Privacy re-declaration.** *~1h (ASC).* Re-answer the App Privacy questionnaire: RevenueCat collects **Purchase History** + **Device ID / identifiers** → no longer "no data collected". (Also keep the earlier audit's health-adjacent + email declarations.)

**Estimated dev effort:** recommended path (with pillar 2) ≈ **21–36h (~3–5 dev-days)** of code, plus external setup. Export-only fallback ≈ **11–21h (~1.5–3 days)**.

---

## STEP 4 — Paywall + compliance (via the preflight skill)

Checked against skill rules `subscription_iap.md`, `missing_tos_pp.md`, `misleading_pricing.md`, `subscription_metadata.md`:

- [ ] Paywall shows **before** purchase: subscription title, **period** (monthly/yearly), **billed price**, **per-period price**, **auto-renew-until-cancelled** disclosure (present ✓ `PaywallSheet.tsx:53-54`), and **what's included** — *per-period price is the one gap (Task 2)*.
- [ ] **Live** Privacy Policy + Terms/EULA links **on the purchase screen** (present in code ✓; URLs must go live — Task 3).
- [ ] **Restore** works in every state (✓ already).
- [ ] Remove the **unconfigured / "Coming later." / "Soon"** states from the live paywall (Task 1) and ship real keys so `ready` is reached (Task 6).
- [ ] Paywall copy **and** the App Store description/screenshots mention **only features that actually work** (export + 30-day insights) — no "fuller history", no medical wording.
- [ ] **App Privacy** re-declared: RevenueCat = purchase data + identifiers (Task 7).
- [ ] **Paid Apps agreement** (bank + tax details in ASC) **active** — without it IAP cannot sell at all. *Blocking external dependency.*

---

## STEP 5 — Release runbook (exact order)

1. **App Store Connect products:** create `lullaby_pro_monthly` + `lullaby_pro_yearly` (auto-renewable) in **one subscription group**; add localized name, price, and a review screenshot; mark "Ready to Submit" so they review **with** the app.
2. **Paid Apps agreement active** (bank + tax) — *else IAP won't sell; do this first, it can take time.*
3. **RevenueCat dashboard:** entitlement `pro`, offering `default`, attach both products; copy the **public iOS SDK key**.
4. **Host legal pages** (Privacy Policy + Terms/EULA) on your own domain + a working support mailbox.
5. **Env / flags:** `EXPO_PUBLIC_PRO_ENABLED=1` + real RC key + `ENTITLEMENT_ID=pro` + `OFFERING_ID=default` + `PRO_DEV_ENTITLEMENT=0` + legal URLs; add the `eas.json` production `env` block.
6. **EAS production build.**
7. **Review notes:** demo the paywall + **sandbox** instructions; state **"local-only, no account required, not medical advice"**; list external services (**RevenueCat**); note the app is fully usable without login and the reviewer can buy as a guest.
8. **Sandbox purchase on a real device:** price + per-period render → purchase completes → **Pro unlocks** → **tap every advertised feature** (export shares real text; 30-day insights render) → **Restore** returns entitlement → already-Pro state shows.
9. **App Privacy questionnaire** updated (Task 7).
10. **Submit** (exclude China mainland in Availability — Claude AI stays dormant, but keep China deselected per the earlier audit).

**Outside code (own these in parallel):** hosting the legal pages + support mailbox; **bank + tax / Paid Apps agreement**; ASC product creation + approval; a sandbox tester account; deselecting China. (AI night-read stays dormant, so no clinician sign-off is needed for the v1 *sale*.)

---

## Risk register (what else can still get us rejected, and how to close it)

| Risk | Guideline | Close it |
|---|---|---|
| An advertised Pro feature dead-ends when the reviewer taps it | **2.1** | Sell-list = only working features (Step 2); tap-test all in sandbox (Step 5.8) |
| "Fuller history" / "gentle weekly recaps" still on the paywall (vaporware / free) | 2.3.2 / 2.1 | Remove from `BENEFITS`, subtitle, and store description (Task 1) |
| Local/guest reviewer can't buy → "Sign in to subscribe" dead-end | 2.1 | Anonymous RevenueCat (Task 0) |
| Per-period price missing / monthly-price more prominent than billed | 3.1.2 | Add per-period, keep billed amount most prominent (Task 2) |
| ToS/PP links point to a for-sale domain | 3.1.2 / 5.1.1 / 1.5 | Host real pages + set env + ASC (Task 3) |
| `PRO_ENABLED=1` shipped with empty keys → "not configured" paywall | 2.1 | Verify real keys reach `ready` in the prod build (Task 6) |
| Paid Apps agreement not active | 3.1.1 | Complete bank + tax before submit (Step 5.2) — *hard blocker* |
| Products not approved / not attached → paywall "unavailable" | 2.1 / 3.1.2 | Submit products with the app; test via sandbox (Step 5.1/5.8) |
| App Privacy says "no data collected" but RevenueCat collects | 5.1.1 | Re-declare purchase data + identifiers (Task 7) |
| Medical wording in paywall/metadata | 1.4.1 | Keep "not medical advice"; ban diagnosis/treatment/"guarantee sleep" |
| Reviewer stumbles on the dormant AI night-read Pro gate | 2.1 / 1.4.1 | Keep server kill-switch off so it degrades to the free local read; not advertised; confirm no broken state |
| Entitlement is device-local, not household-shared | — | Don't advertise cross-caregiver Pro; fine for local-only v1 |
| China gets the dormant Claude AI as unlicensed DST | 5 | Deselect China mainland in ASC (Step 5.10) |

---

**Scope locked:** two-pillar Pro (export + Full 30-day insights) with anonymous no-account purchase. Confirmed decisions are baked into Tasks 0 and 4. Nothing will be coded until you approve this plan.
