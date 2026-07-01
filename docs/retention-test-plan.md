# Lullaby — Retention-Test Readiness & Experiment Plan

Status: APPROVED · Companion to `docs/pricing-strategy.md` and `docs/testflight-readiness.md`

Goal: get 3–5 real parent-pairs onto TestFlight and **measure activation + retention** before
any paywall is built. We are **not** building payments here. The pricing north-star lives in
`docs/pricing-strategy.md`; the operational build/QA checklist stays in
`docs/testflight-readiness.md` — this doc is the *experiment* (what changed, what to measure,
how to read the result).

The single number that should unlock a future paywall flip is **retention** (do parents come
back night after night), not a finished integration.

---

## 1. What changed (this branch)

### 1.1 Insights now works in production (the legacy/V2 split)
Production logging runs the legacy flat `LogEvent` path (`src/state/LocalEventProvider.tsx` →
`src/sync/*` → Supabase `events`). The richer V2 store is flag-gated off and local-only, and
Insights used to read only V2 — so it was empty in a real build. Fix: Insights now maps the
live, Supabase-synced legacy events into the shape the selectors expect, via the existing
`mapLegacyEvents` bridge.
- New: `src/features/insights/loadLegacyInsightsHistory.ts` (pure adapter).
- Edited: `src/features/insights/InsightsScreen.tsx` (uses it when the V2 flag is off; V2/dev
  path unchanged). No sync rewrite, no flag flip, no migration of event data.
- Smoke coverage: `IG3` in `scripts/check-local-interactions.ts`.

### 1.2 Analytics → Supabase `analytics_events`
- New: `src/lib/analytics.ts` (`trackEvent` + `useAnalytics`), `src/lib/analyticsMilestones.ts`
  (once-ever guards, **scoped by userId + babyId**).
- New migration: `supabase/migrations/20260701050347_create_analytics_events.sql`.
- Analytics is a **no-op unless the build is Supabase-configured AND a user is signed in**
  (the local/dev demo just logs to the console). So real data only flows from the sync build.
- **RLS** allows insert only when `auth.uid() = user_id AND (baby_id is null OR
  public.is_baby_caregiver(baby_id))` — a user cannot forge analytics for another family.
  No SELECT policy (analyzed via dashboard/service role).
- **Props are clean:** only coarse counts (`dataDays`), UI `source`/`surface`, and a flow
  `method`. No names, note text, feed volumes, sleep/diaper detail, or medical content.

### 1.3 Non-paid Pro preview (behind a flag)
- New: `src/components/UpgradeCard.tsx`, `src/features/insights/components/ProPreviewCard.tsx`,
  `src/lib/proPreview.ts`.
- Gated by **`EXPO_PUBLIC_PRO_PREVIEW_ENABLED`** (default **false**). `ProPreviewCard` requires
  the flag + `dataDays >= 4`; `UpgradeCard` requires the flag + a **signed-in** user (never
  shown to guest/local-only). Purely presentational — records interest, implies no charge,
  never blocks logging. No RevenueCat, no paywall.

### 1.4 Free aha
- New: `src/features/insights/components/WeeklyRecapCard.tsx` — a free, descriptive weekly recap
  built from the data Insights already loads. Always on (not behind the Pro flag).

> Full file list: `git diff --stat` on this branch. New libs/components are untracked until
> committed.

---

## 2. How to apply the analytics migration

The app writes to `public.analytics_events`; until the migration is applied, inserts fail RLS
silently (fire-and-forget swallows the error — no crash, just no rows).

1. Ensure the membership helper exists (it does, from
   `supabase/migrations/20260618000003_create_baby_caregivers.sql`:
   `public.is_baby_caregiver(p_baby_id uuid)`).
2. Apply, either:
   - `supabase db push` (CLI, applies pending migrations in filename order), or
   - paste `supabase/migrations/20260701050347_create_analytics_events.sql` into the Supabase
     SQL editor.
3. Verify the table + policy:
   ```sql
   select count(*) from public.analytics_events;            -- 0, table exists
   select polname from pg_policies where tablename = 'analytics_events';  -- analytics_insert_own
   ```
4. There is **no client SELECT policy** by design — query the funnel from the dashboard or a
   service-role job, not from the app.

Do not commit secrets; `EXPO_PUBLIC_*` are anon/publishable and inlined at build time.

---

## 3. QA checklist (specific to the retention test)

Run the standard pre-build gate from `docs/testflight-readiness.md` §2 first
(`npm run check:local-interactions`, `npx tsc --noEmit`, `npm run lint`). Then, in the **sync
build** (Supabase env set):

- [ ] Onboarding → baby setup → **first log** works one-handed; no seeded "Mia" leaks.
- [ ] Core Feed/Sleep/Diaper/Pump persists, **survives restart**, and **syncs across two phones**
      with the handoff card updating (~1s). The wedge must feel real.
- [ ] **Insights shows real 7-day data** after ~4 days of logs (backdate to test), plus the
      free `WeeklyRecapCard`.
- [ ] A row lands in `analytics_events` for a real event (check the dashboard).
- [ ] Milestone events (`first_log_created`, `reached_4_data_days`) fire **once** per account —
      and again for a *different* account on the same device (keys are userId+babyId scoped).
- [ ] `baby_profile_created` / `caregiver_invite_accepted` rows carry a real `baby_id`.
- [ ] **Pro preview:** with `EXPO_PUBLIC_PRO_PREVIEW_ENABLED` unset, `UpgradeCard` and
      `ProPreviewCard` are **hidden**; set to `1`, `UpgradeCard` shows only when signed in and
      `ProPreviewCard` only at `dataDays >= 4`. Neither blocks logging or implies a charge.
- [ ] Reassure clinical-review gate honored (closed internal TestFlight, or signed-off content)
      — see `docs/testflight-readiness.md` §7.

---

## 4. Events to verify (final names)

13 events. `props` shown are the only fields sent.

| Event | Fires when | Props | Once-ever? |
|---|---|---|---|
| `onboarding_completed` | onboarding marked complete | — | per device (pre-auth → usually no-ops) |
| `baby_profile_created` | account setup creates the baby | `method` | on success |
| `first_log_created` | first event of any type | — | **once / account+baby** |
| `feed_log_created` | a feed is saved | — | per feed |
| `sleep_log_created` | a sleep session is completed | — | per completed sleep |
| `caregiver_invited` | an invite code is minted | — | per mint |
| `caregiver_invite_accepted` | an invite is redeemed | — | on success |
| `handoff_has_new_on_open` | Tonight opened with new caregiver activity | — | per focus |
| `insights_opened` | Insights tab focused | — | per open |
| `reached_4_data_days` | view model first hits `dataDays >= 4` | `dataDays` | **once / account+baby** |
| `insights_recap_available` | Insights opened at `dataDays >= 4` (recap surface present) | `dataDays` | per qualifying open |
| `upgrade_card_tapped` | a Pro preview CTA tapped | `source` | per tap |
| `export_tapped` | "Export this week" tapped (fake-door) | `surface` | per tap |

Naming honesty: `handoff_has_new_on_open` and `insights_recap_available` are **open/focus +
condition** signals, not viewport-confirmed impressions. `export_tapped` is a deliberate
fake-door (records intent; shows "coming soon").

**Known measurement gaps:** pre-auth events (`onboarding_completed`, guest baby creation) don't
store without a `userId`, so the funnel effectively starts at sign-in. `role` is intentionally
**not** sent on `caregiver_invited`.

---

## 5. TestFlight experiment design

- **Build:** sync build (Supabase env as EAS env vars per `docs/testflight-readiness.md` §6).
  Local-only builds can't measure anything (analytics no-op).
- **Cohorts (optional, via the flag):**
  - *Control:* `EXPO_PUBLIC_PRO_PREVIEW_ENABLED` unset → no Pro messaging. Measures pure
    logging retention.
  - *Pro-preview:* `EXPO_PUBLIC_PRO_PREVIEW_ENABLED=1` → measures interest
    (`upgrade_card_tapped` / `export_tapped`) without biasing the core habit.
  - The flag is build-time inlined, so cohorts are separate builds, not a runtime split.
- **Recruits:** 3–5 real parent-pairs (two phones each, to exercise the handoff wedge).
- **Window:** ≥ 2 weeks so the 7-day Insights + weekly recap actually appear and a return
  pattern can form.
- **Watch them use it at night** (the activation truth is behavioral, not survey).

---

## 6. Success metrics

**Activation funnel (per signed-in user):**
`onboarding_completed → baby_profile_created → first_log_created → reached_4_data_days`.

**Retention (the number that gates a future paywall flip):**
distinct calendar days with ≥1 `feed_log_created` / `sleep_log_created` per baby across the
window. Proposed bar to revisit pricing: a meaningful share of pairs logging **4+ nights/week**
for **2+ consecutive weeks**.

**Wedge working:** `caregiver_invited → caregiver_invite_accepted`, and
`handoff_has_new_on_open` recurring (parents returning to new activity).

**Monetization-intent (leading indicators, Pro-preview cohort only):**
`insights_opened`, `insights_recap_available`, `upgrade_card_tapped`, `export_tapped`.

**Bugs that invalidate the test:** any data loss on restart/reinstall/sync; Insights empty in
the sync build; realtime handoff not updating across phones; a Pro card blocking logging or
implying a charge; `analytics_events` not writing or milestone events double-firing; broken
auth; a bright screen at 3am.

---

## 7. After the test

If retention clears the bar, proceed to `docs/pricing-strategy.md` §7–§8 (Phase 1 entitlement
infrastructure), and only then flip a real paywall. If it doesn't, the data tells you which
funnel step leaks — fix the product, not the price.
