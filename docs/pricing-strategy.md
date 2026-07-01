# Lullaby — Pricing, Free/Pro Split & Pro Feature Strategy

Status: APPROVED (Approach A) · Owner: product · Companion to `docs/LULLABY_STRATEGY.md`

This is the monetization north-star. It is **not** a build ticket: the only thing that
ships from it today is the phased infrastructure in §7, and **no paywall goes live until
retention is proven** (see `docs/retention-test-plan.md`). No payment, RevenueCat,
subscription, or paywall code exists in the app yet.

---

## 1. Positioning (read this first)

In code, **Lullaby is a baby-care tracker, not an audio/lullaby app** — there is no audio
engine, sound library, or white-noise anywhere (the "Reassure" tab is static, non-medical
text). The name is positioning only. So the Free/Pro model is **not** "free sounds / paid
intelligence." It is:

> **Free = "log the night and know what happened."**
> **Pro = "understand the pattern and coordinate the household."**

The two defensible moats (per `docs/LULLABY_STRATEGY.md`) are the calm, night-native design
(the orb) and the **caregiver handoff** ("what happened while you slept"). Pro is priced
around *depth + coordination*, not predictions/AI — which are the crowded, liability-heavy,
clinical-review-gated lane the strategy doc already chose to avoid.

---

## 2. Free / Pro split

Principle: **basic logging is free forever** (Nara-style — charging for it causes instant
abandonment in this category), and **you never charge to invite the first partner** (the
2-person night-shift pair the whole app is built around; charging for a spouse is the
Sprout/Talli backlash to avoid).

| Capability | Free | Pro |
|---|---|---|
| Core logging — Feed / Sleep / Diaper / Pump | ✅ | ✅ |
| Tonight (orb, quick-log, "time since last") | ✅ | ✅ |
| Timeline / history | last ~14 days | **unlimited** |
| 7-day Insights (rhythm, wake windows, sleep) | ✅ | ✅ |
| Weekly recap | descriptive summary (free) | **keepable recap + export** |
| Reassure (bounded, non-medical) | ✅ | ✅ |
| Realtime sync + handoff | ✅ | ✅ |
| Caregivers | **2** (you + partner) | **unlimited** + read-only grandparent |
| Doctor-ready export (PDF/CSV) | — | ✅ |
| Descriptive trend/projection layer (Phase 3) | — | ✅ |
| Premium night themes | — | bundled sweetener |

Pro must feel like an upgrade into a calmer, smarter companion — never like the core app
was artificially blocked.

---

## 3. Pro feature priority (evaluated against the real code)

| Rank | Pro feature | Effort | In first Pro MVP? | Notes |
|---|---|---|---|---|
| 1 | Unlimited history | S | Yes | Pure UI/query gate; data already in Supabase `events` |
| 2 | 3rd+ caregiver / read-only grandparent | S–M | Yes | The moat; no medical claims; gate the invite flow |
| 3 | Weekly recap + doctor export (PDF/CSV) | M | Yes (recap) / fast-follow (export) | Recap reuses the insights view-model |
| 4 | Descriptive trend/projection layer | M | No — Phase 3 | Extends `src/features/insights/insightSelectors.ts`; needs V2 sync + clinical-safe copy |
| 5 | Personalized sleep schedule | L | No — Phase 4 | Medical-adjacent; clinical review |
| 6 | AI sleep assistant | XL | No | Crowded, liability, contradicts strategy §7 |
| 7 | Sound library / mixes / offline audio | XL | No | Different product; net-new engine + licensing |

---

## 4. Where paywalls go (value-first, never block the core loop)

Never paywall onboarding, the first log, or the logging loop. Earn the upsell.

1. **Matured Insights (day 4–7)** — `src/features/insights/InsightsScreen.tsx` already gates
   real content at `dataDays >= 4`. Free user sees 7-day patterns; "see full history + weekly
   recap" → Pro. The natural earned moment.
2. **Inviting a 3rd caregiver** — `src/components/auth/InviteCaregiverSheet.tsx`. First partner
   is free; 3rd+ and read-only grandparent → Pro.
3. **Export / share to doctor** — a high-intent moment on Insights/History.
4. **Settings upsell + plan management** — `src/components/auth/AccountSheet.tsx` (the de-facto
   settings home, and where "Restore purchases" / "Manage plan" live).

---

## 5. Recommended pricing

Priced as an honest tracker-plus-coordination tool (not an AI coach that isn't built), with the
realtime caregiver sync as the genuine differentiator. Category anchors: Huckleberry ~$69/yr,
Glow $59.99/yr, Pebbi £19.99/yr.

- **Monthly: $6.99**
- **Annual: $44.99** (the hero; ~46% off monthly-equivalent; ~$3.75/mo)
- **Free trial: 14 days on annual** — Pro value (trends, weekly recap, longer history) only
  becomes visible after a week of logging, and the strategy is retention-first.
- **Lifetime: no, not at launch** — Lullaby has ongoing realtime-sync server cost (unlike a
  local-only one-time app), and lifetime→sub migrations have caused category backlash.
- **Pro+: later** — reserve for a true coaching/schedule tier once it exists and is clinically
  reviewed. Do not fragment pricing pre-revenue.

---

## 6. When to actually turn the paywall on

**Build the architecture now; flip the paywall live only after a retention signal** — a
TestFlight cohort logging multiple nights/week. This honors the documented "no paywall before
retention" decision while giving the team monetization readiness. The retention bar and the
experiment that proves it live in `docs/retention-test-plan.md`.

---

## 7. Architecture: RevenueCat with a household-scoped entitlement

The product value is shared across caregivers, so **entitlement is per-family, not per-user**:
if one parent subscribes, every caregiver on that baby gets Pro. You never charge a spouse to
unlock what the household already paid for.

**Provider — RevenueCat.** Expo + RN, iOS + Android, App Store + Play. (Stripe cannot sell
digital subscriptions inside an iOS app; the static web export is not the product surface.)
RevenueCat wraps StoreKit + Play Billing and handles receipts, restore, trials, and webhooks.
It needs a config plugin + the existing custom dev client (not Expo Go).

**Household flow:**
1. Each caregiver authenticates to RevenueCat with `appUserID = supabase user.id`.
2. On purchase, a **RevenueCat webhook → Supabase Edge Function** writes a `subscriptions` row
   keyed by the purchaser's `baby_id` (resolved via `baby_caregivers`).
3. The app reads **family entitlement from Supabase** (the source of truth for cross-caregiver
   unlock), with RevenueCat as the purchase/restore mechanism + a fast local cache.

**New table (future migration), mirroring the `events` RLS/membership model:**

```
public.subscriptions
  baby_id uuid PK references babies(id)   -- family-scoped
  status text         -- 'free' | 'trialing' | 'active' | 'grace' | 'expired'
  plan text           -- 'monthly' | 'annual'
  entitlements text[]
  rc_app_user_id text -- RevenueCat appUserID of the purchaser (= supabase user id)
  current_period_end timestamptz
  platform text       -- 'ios' | 'android'
  updated_at timestamptz
  -- RLS: select if is_baby_caregiver(baby_id); writes only via service-role (webhook)
```

**Entitlement keys (trimmed to what's real):** `pro` (master), `unlimited_history`,
`unlimited_caregivers`, `readonly_caregivers`, `data_export`, `weekly_recap`,
`advanced_insights` (Phase 3). Explicitly dropped: any audio/AI/predictions/multi-baby keys.

**State seam:** a future `src/state/SubscriptionProvider.tsx` mounted under `AuthProvider`
(it needs `useAuth()`'s baby/caregivers/session), exposing `useEntitlements()` → `{ isPro,
has(key), status }`, degrading to free in local-only mode and failing **open to free** offline
(never lock out logging). UI gate component: `FeatureGate`. Client checks are UX only; the
`subscriptions` RLS + webhook are the trust boundary.

**Reusable UI (build-on map):** `PaywallModal` → model on `src/components/LogSheet.tsx`,
host in `AccountSheet.tsx`; `UpgradeCard` → `src/components/HandoffCard.tsx`;
`LockedFeatureCard` → `src/features/insights/components/InsightsSectionCard.tsx`; CTA →
`src/components/PrimaryActionButton.tsx`. Tokens from `src/theme/index.ts`. No new design system.

> A **non-paid** preview of the Pro surfaces already exists behind
> `EXPO_PUBLIC_PRO_PREVIEW_ENABLED` (default off) — `UpgradeCard` and `ProPreviewCard`. They
> record interest analytics only and imply no charge. See `docs/retention-test-plan.md`.

---

## 8. Rollout phases

**Phase 1 — Pricing foundation (no live paywall).** RevenueCat + `react-native-purchases`,
`subscriptions` migration + RLS, the webhook Edge Function, `SubscriptionProvider` /
`useEntitlements`, `PaywallModal`, Restore + manage in `AccountSheet`. Behind a kill-switch.
Outcome: purchase/restore works in sandbox; nothing gated for real users.

**Phase 2 — First real gates (ride existing synced data).** `unlimited_history` (window gate),
caregiver cap, the Insights paywall + `UpgradeCard`. Never blocks core logging.

**Phase 3 — Depth + descriptive intelligence.** Prerequisite: unify/sync the V2 logging model
(today the rich V2 store is local-only; Supabase holds the legacy model). Then weekly recap
export and the descriptive trend layer, with clinical-safe copy.

**Phase 4 — Coaching tier (Pro+ candidate).** Personalized schedule / sleep-problem mini-plans,
only after clinical sign-off and proven Pro demand.

---

## 9. Do NOT build yet

AI assistant · sleep-training schedules / predictions · multiple babies · reminders/push ·
lifetime pricing · audio of any kind · a live paywall before retention.

---

## 10. Approaches considered

- **A — Coordination + depth first, intelligence later (CHOSEN).** Monetize history, export, and
  caregivers; descriptive insights Phase 3; AI/schedules deferred. Build infra now, flip after
  retention. Ships value without selling vapor; fits the code and the strategy doc.
- **B — Intelligence-first.** Lead Pro with predictions/AI. Requires V2-sync unification,
  clinical review, and contradicts strategy §7. Right destination, wrong first step.
- **C — Architecture-now, fundraising framing.** Same build as A, but nothing turned on; the
  deliverable is the narrative. Pick if "add pricing" means "a credible plan," not "revenue now."
