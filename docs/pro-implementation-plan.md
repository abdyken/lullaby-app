# Lullaby — Pro Implementation Plan (technical build ticket)

Status: DRAFT (plan only — nothing in this doc is implemented) · Branch: `plan/pro-implementation`
Companion to `docs/pricing-strategy.md` (the monetization north-star), `docs/retention-test-plan.md`
(the experiment that must clear before a live paywall), and `docs/beta-distribution-and-caregiver-qa.md`.

This is the concrete build plan that turns today's **fake-door** Pro surfaces into a real,
entitlement-backed subscription. Today `UpgradeCard` and `ProPreviewCard` only fire interest
analytics and show "coming soon" behind `EXPO_PUBLIC_PRO_PREVIEW_ENABLED`; they gate nothing, and
there is **no** `react-native-purchases`, no `subscriptions`/`pro_entitlements` table, no paywall,
and no export in the codebase. Every anchor below was verified against the current tree.

> **Scope of this document:** planning only. No RevenueCat code, no migrations, no paywall, no
> pricing hardcoded (only documented placeholders). See §12.

---

## 1. Product decision

The split is not "free sounds / paid intelligence" (there is no audio engine — see
`pricing-strategy.md §1`). It is:

> **Free = "log the night and know what happened."**
> **Pro = "understand the pattern and coordinate the household."**

**Never gate (hard rule — gating these erodes the trust the whole category runs on):**
- Core logging — Feed / Sleep / Diaper / Pump.
- Onboarding, baby setup, and the **first log**.
- Tonight (orb, quick-log, "time since last").
- The **first caregiver invite** (the 2-person night-shift pair the app is built around).
- Realtime sync + the caregiver **handoff** ("what happened while you slept").
- 7-day Insights, the free descriptive `WeeklyRecapCard`, and bounded non-medical Reassure.

**Can be gated (earned upgrades, never the core loop):**
- History depth beyond the free window.
- Weekly recap **export / share** and the pediatrician summary.
- Extra caregivers (3rd+, read-only grandparent) — *later*, see `canAddExtraCaregivers`.
- Descriptive trend/projection depth — *Phase 3*, out of v1.

**Why Pro must be household/baby-scoped, not device-local.** The product value — the shared log,
the handoff, the weekly recap — is consumed by **every caregiver on the baby**. If entitlement
were device-local or per-user, a paying parent's partner would still see a locked app on their own
phone, and you'd be charging a spouse to unlock what the household already paid for (the
Sprout/Talli backlash `pricing-strategy.md §2` calls out). Baby-scoped entitlement means one
purchase unlocks Pro for the whole caregiver set on that baby, and it survives reinstall and phone
swaps because the truth lives server-side, not on a device.

---

## 2. Pro features v1

Priced around **depth + coordination**, not predictions/AI (the crowded, liability-heavy,
clinical-review-gated lane the strategy doc deliberately avoids).

| # | Pro v1 feature | What it unlocks | Reuses |
|---|---|---|---|
| 1 | **Full history beyond 7 days** | Timeline/Insights past the free window; data already in Supabase `events` | Pure query/UI gate |
| 2 | **Weekly export / shareable recap** | A keepable weekly recap (PDF/CSV/share sheet) built from the insights view-model | `WeeklyRecapCard` + `src/features/insights/insightSelectors.ts` |
| 3 | **Clean pediatrician summary** | A doctor-ready descriptive summary (sleep totals, feed rhythm, diaper counts) — *descriptive, not diagnostic* | Same view-model, print/share layout |
| 4 | **Saved weekly reports** *(maybe / fast-follow)* | Persist generated recaps for later reference | Extends #2; may need a `weekly_reports` store — defer decision |

**Explicitly excluded from v1 (and from this doc):**
- **AI predictions / sleep forecasting** — deferred (`pricing-strategy.md §3` rank 6).
- **Sleep training schedules / any medical or prescriptive advice** — clinical-review-gated,
  `pricing-strategy.md §8 Phase 4`. All Pro copy stays descriptive and non-medical.

---

## 3. Architecture

Two systems with a clear division of trust:

- **RevenueCat = the purchase/restore mechanism.** Wraps StoreKit (iOS) + Play Billing (Android),
  handles receipts, trials, restore, and emits webhooks. It is *not* the source of truth for
  cross-caregiver unlock.
- **Supabase `pro_entitlements` = the source of truth.** A RevenueCat webhook writes the
  entitlement row keyed by `baby_id`; every caregiver on that baby reads it through RLS. This is
  what makes Pro household-shared and reinstall-proof.
- **Local cache = fast, offline-tolerant UX.** The resolved entitlement is cached in AsyncStorage
  so the app knows `isPro` at cold start without a round-trip.

**State seam (new, mirrors the existing provider convention):**
- `src/state/SubscriptionProvider.tsx`, mounted **under `AuthProvider`** (it needs
  `useAuth()`'s `session` / `baby` / `caregiver`). Nesting: `AuthProvider › AuthGate ›
  SubscriptionProvider › LocalEventProvider › …`.
- `useEntitlements()` → `{ isPro, has(key), status, refresh() }`. Client checks are **UX only**;
  the `pro_entitlements` RLS + webhook are the real boundary (§4, §6).
- `FeatureGate` component (presentational) wraps a gated surface and renders the free fallback +
  `UpgradeCard` when locked. Model its tokens on `src/theme/index.ts` — no new design system.

**Behavior matrix:**

| Situation | Entitlement behavior |
|---|---|
| **Offline** | **Fail open to the last cached state, defaulting to free.** Never lock logging or the core loop on a network/entitlement failure. |
| **Guest / local-only** (`supabase === null`, no session) | Treated as **free**; no network, no paywall purchase possible (no account to attach the RC `appUserID` to). |
| **Signed-in, no entitlement row** | Free. |
| **Signed-in caregiver on a Pro baby** | Pro, **inherited** via `is_baby_caregiver(baby_id)` — even if a *different* caregiver purchased. |
| **Signed-in, entitlement expired** | Free fallback; history collapses to the free window (no data deleted). |

---

## 4. Entitlement model

- Each caregiver authenticates to RevenueCat with **`appUserID = supabase user.id`** (stable,
  already the identity `useAnalytics` uses).
- On a purchase/renewal/cancel, the **RevenueCat webhook → Supabase Edge Function** (service role)
  resolves the purchaser's `user_id` → their `baby_id` via `baby_caregivers`, then **upserts one
  `pro_entitlements` row keyed by `baby_id`**.
- **Sharing:** the row's SELECT RLS is `public.is_baby_caregiver(baby_id)`
  (`supabase/migrations/20260618000003_create_baby_caregivers.sql:21-34`, SECURITY DEFINER). Any
  caregiver linked to that baby in `baby_caregivers` reads the row and inherits Pro. This is the
  same membership predicate that already scopes `babies`, `events`, `baby_invites`, and
  `analytics_events` — so entitlement sharing is *identical* to how the shared log already works.
- **Isolation:** a user who is **not** in `baby_caregivers` for that baby fails the predicate and
  sees nothing — Pro never leaks to unrelated babies or accounts.

**Single-baby assumption (documented).** The app is one-baby-per-household today, so "the
purchaser's `baby_id`" is unambiguous. When multi-baby lands, the webhook's purchaser→baby
resolution becomes ambiguous (which baby did they pay for?) and must be revisited — likely by
passing `baby_id` through RevenueCat purchase metadata. Flagged here so it isn't silently assumed.

---

## 5. Database plan (propose — **do not create the migration in this task**)

Canonical table **`public.pro_entitlements`** (this refines and supersedes the loose
`subscriptions` sketch in `pricing-strategy.md §7`; that doc now points here). Proposed shape:

```sql
-- FUTURE migration (not created yet): supabase/migrations/<ts>_create_pro_entitlements.sql
create table public.pro_entitlements (
  id                       uuid primary key default gen_random_uuid(),
  baby_id                  uuid not null unique references public.babies(id) on delete cascade,
  purchaser_user_id        uuid references auth.users(id) on delete set null,
  provider                 text not null default 'revenuecat',
  provider_customer_id     text,          -- RevenueCat appUserID (= supabase user id) / RC customer id
  provider_entitlement_id  text,          -- e.g. 'pro'
  status                   text not null default 'free'
                             check (status in ('free','trialing','active','in_grace','expired','paused')),
  current_period_end       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
```

- `baby_id` is **unique** → one entitlement row per household (upsert target for the webhook).
- Optional documented extensions (add only if needed, not in v1 core): `plan text` ('monthly' |
  'annual'), `platform text` ('ios' | 'android'), `entitlements text[]` for fine-grained keys.
- `updated_at` maintained by a trigger (mirror whatever `updated_at` convention the existing
  migrations use, or a simple `before update` trigger).

**RLS (mirrors the membership model, inverted from `analytics_events`):**

```sql
alter table public.pro_entitlements enable row level security;

-- Client may READ its household's entitlement; caregivers inherit via the shared predicate.
create policy pro_entitlements_select_member on public.pro_entitlements
  for select to authenticated
  using (public.is_baby_caregiver(baby_id));

-- No client insert/update/delete policies. All writes happen via the service-role webhook,
-- which bypasses RLS. The client can never forge or self-grant an entitlement.
```

- **Write path (trust boundary):** RevenueCat webhook → Supabase Edge Function using the
  **service-role key** → `upsert` into `pro_entitlements` on `baby_id`. Never client-writable.
- **Read path:** the app `select`s the row for its current `baby_id`;
  `isPro = status in ('trialing','active','in_grace')`.
- Contrast with `analytics_events` (`20260701050347_create_analytics_events.sql:26-33`), which is
  **INSERT-only for the client, no SELECT**. `pro_entitlements` is the mirror image:
  **SELECT-only for the client, no client writes.**

---

## 6. RevenueCat integration plan

**Package & build.**
- Add `react-native-purchases` (+ its Expo config plugin). RevenueCat needs native modules, so it
  runs in the **custom dev client / EAS build**, not Expo Go (the project already uses a custom dev
  client — `scripts/dev-client.mjs`).

**Env vars (build-time `EXPO_PUBLIC_*`, following `src/lib/proPreview.ts` conventions):**
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
- `EXPO_PUBLIC_PRO_ENABLED` — master real-paywall kill-switch (default off; see §11).
- Server-side (NOT `EXPO_PUBLIC_`, lives in the Edge Function / Supabase secrets): the RevenueCat
  **webhook auth token** and the Supabase **service-role key**.

**Store products & RevenueCat config (placeholders — finalize in the dashboards):**
- Product IDs: `lullaby_pro_monthly`, `lullaby_pro_annual` (App Store Connect + Play Console).
- RevenueCat **entitlement ID:** `pro`. **Offering:** `default` (packages: `$rc_monthly`,
  `$rc_annual`). Pricing ($6.99/mo, $44.99/yr, 14-day annual trial) is set in the stores per
  `pricing-strategy.md §5` — **never hardcoded in the app** beyond documented placeholders.

**Flows.**
1. **Configure:** on sign-in, `Purchases.configure({ apiKey, appUserID: session.user.id })`.
2. **Purchase:** paywall → `Purchases.purchasePackage(pkg)` → on success, optimistically reflect Pro
   in the local cache, then `useEntitlements().refresh()` (which re-reads Supabase once the webhook
   has written the row).
3. **Restore:** `Purchases.restorePurchases()` → same refresh path.
4. **Webhook:** RevenueCat → Supabase Edge Function → verify token → resolve `user_id → baby_id` →
   `upsert pro_entitlements`.

**Do not trust client state alone.** The RevenueCat SDK result is used for **immediate UX** only.
The authoritative unlock — the one that shares across caregivers and survives reinstall — is the
Supabase `pro_entitlements` row written by the webhook and read under RLS. A tampered client can
flip a local boolean; it cannot write the row.

---

## 7. Feature gates

Defined on `useEntitlements()`; each has a **non-blocking free fallback**.

| Gate | Pro unlocks | Free fallback |
|---|---|---|
| `canViewFullHistory` | Timeline/Insights beyond the free window | Show **7-day** history + a "see full history" teaser → `UpgradeCard` |
| `canExportWeeklyRecap` | Export/share the weekly recap (PDF/CSV/share) | Show the free descriptive `WeeklyRecapCard` + an export teaser |
| `canSharePediatricianSummary` | Generate/share the doctor summary | Show a teaser card → paywall |
| `canAddExtraCaregivers` *(later)* | Invite 3rd+ / read-only grandparent | First caregiver stays free; extra-invite CTA → paywall |

**Universal fallback rules:**
- **Never block logging** or the Tonight loop — a locked gate only hides *depth/export*, never
  input.
- Locked state = teaser + `UpgradeCard`, styled with existing tokens; layout stays stable.
- Guest/offline resolve to the free fallback (§3), never a hard lock.

---

## 8. UI plan (keep existing visual layout stable)

- **`src/components/UpgradeCard.tsx`** — turn the fake-door into a **real paywall entry**. Today its
  `onPress` fires `upgrade_card_tapped` and shows "coming soon"; change it to fire
  `paywall_opened` and open the `PaywallSheet`. Keep the same card visuals and `{source}` prop.
- **`src/features/insights/components/ProPreviewCard.tsx`** — same: its "See what's included" opens
  the paywall; its "Export this week" becomes a **real export** entry (gated by
  `canExportWeeklyRecap`, firing `export_started`/`export_completed` instead of the fake-door
  `export_tapped`).
- **New `PaywallSheet`** (`src/components/PaywallSheet.tsx`) — bottom-sheet modal modeled on
  `src/components/LogSheet.tsx`; lists the RevenueCat `default` offering (monthly/annual, trial),
  a purchase CTA (model on `PrimaryActionButton`), and a restore link. Fires `paywall_opened` on
  present, `purchase_*` on the flow.
- **`src/components/auth/AccountSheet.tsx`** — in the **signed-in branch** (after the "Sign out"
  pressable, ~`AccountSheet.tsx:136`), add two rows: **"Manage subscription"** (opens the native
  App Store / Play manage-subscription URL) and **"Restore purchases"** (`Purchases.restorePurchases`).
  `session`, `caregiver`, `busy` are already destructured there. The guest branch has no account,
  so restore-for-guest is out of scope for v1 (documented gap).

---

## 9. Analytics (privacy-safe — extend the existing leaf)

Add 9 events to the `AnalyticsEvent` union in `src/lib/analytics.ts` (which no-ops unless
`supabase && identity.userId`, and writes to `analytics_events` under the existing RLS):

`paywall_opened` · `purchase_started` · `purchase_completed` · `purchase_failed` ·
`restore_started` · `restore_completed` · `pro_gate_seen` · `export_started` · `export_completed`

**Allowed props only:** `source` / `surface` (which UI surfaced it), `plan` (`'monthly'` |
`'annual'`), and a **coarse** `error_code` on failures. **Never** send names, note text, medical
or freeform content, feed volumes, or diaper detail (same rule as the retention events —
`retention-test-plan.md §4`).

**Migration of the fake-door event:** the current `export_tapped` (fake-door intent) is replaced by
the real `export_started` → `export_completed` pair once export ships. Keep `upgrade_card_tapped`
as an alias or retire it in favor of `paywall_opened` — decide at implementation, and document in
`retention-test-plan.md §4` so the event table stays honest.

---

## 10. Testing plan

- **Source / smoke checks** — extend `scripts/check-local-interactions.ts` with Pro-gate
  invariants. **Rescope the V7 anti-paywall guard** (`check-local-interactions.ts:~4302`, which
  fails if `/RevenueCat/i`, `/\bPurchases\b/`, `/paywall/i`, or `/subscription/i` appears in the
  guarded files) so *intentional* Pro code in the new files is allowlisted while still catching
  *accidental* introduction elsewhere. Run `npm run lint` and `npx tsc --noEmit` (no `typecheck`
  script exists).
- **Supabase RLS checks** — a caregiver on the baby can SELECT the row (inherits Pro); a user not
  in `baby_caregivers` cannot; no client INSERT/UPDATE/DELETE succeeds (all 403/no-op).
- **Sandbox purchases** — StoreKit (iOS) + Play (Android) sandbox: buy monthly + annual, confirm
  the webhook writes `pro_entitlements`, confirm the app reflects Pro after `refresh()`.
- **Restore purchases** — fresh install / second device: restore re-grants Pro from the store
  receipt and/or the Supabase row.
- **Caregiver inherited access** — parent A buys; parent B (same baby, different device) sees Pro
  without purchasing.
- **Guest behavior** — local-only/guest resolves to free, no crash, no paywall purchase path.
- **Free-user gates** — each gate shows its fallback + teaser; **logging still works**.
- **Pro-user gates** — each gate unlocks; export/share produces output.
- **No regressions** — logging, Insights (incl. the legacy-mapped 7-day path), the free
  `WeeklyRecapCard`, and caregiver invite/two-phone sync all still pass their existing checks.

---

## 11. Rollout plan

- **`EXPO_PUBLIC_PRO_ENABLED`** (default **off**) is the **master real-paywall switch**, kept
  **separate** from `EXPO_PUBLIC_PRO_PREVIEW_ENABLED`. The two are distinct states:
  - `PRO_PREVIEW_ENABLED` → fake-door preview (interest analytics only) — for the retention cohort.
  - `PRO_ENABLED` → real RevenueCat paywall + live feature gates.
- **Precedence during transition:** if `PRO_ENABLED` is on, the **real paywall/gates supersede**
  the preview surfaces (don't show both a fake-door and a real paywall). Keep the preview available
  for the ongoing retention build until the test window closes, then retire it.
- **Sequence:**
  1. Internal sandbox testing first (both stores), `PRO_ENABLED` off for real users.
  2. The **parent retention test finishes** (`retention-test-plan.md`) — the paywall does **not**
     go live during it, so it can't bias the core habit.
  3. Flip `PRO_ENABLED` for a **staged rollout** only after retention data clears the bar
     (a meaningful share of pairs logging 4+ nights/week for 2+ weeks — `retention-test-plan.md §6`).

---

## 12. Explicit non-goals (this document)

- **No real implementation** — this is a plan.
- **No RevenueCat code**, no `react-native-purchases` install.
- **No migrations created** — `pro_entitlements` is proposed (§5), not applied.
- **No live paywall.**
- **No hardcoded pricing** beyond documented placeholders.
- **No AI / sleep prediction.**
- **No medical or prescriptive advice** — all Pro copy stays descriptive.
