# Pro v1 — overnight build: what shipped, what was cut, what remains

Run of 2026-07-04 on branch `feat/pro-subscription-v1`. Everything below is
committed; nothing was pushed (repo rule: no push). Final verification:
`npm run typecheck` ✓ · `npm run lint` ✓ · `npm run check:local-interactions`
**414/414** ✓ · `git diff --check` ✓.

## Shipped as Pro (all genuinely working — no stubs, no hardcoded values)

1. **Guest purchase with no account** (`f217926`) — the blocker.
   RevenueCat configures with an **anonymous appUserID** when there is no
   Supabase session; `canPurchase` no longer requires a userId; the
   "Sign in to subscribe" dead end is deleted end-to-end. Sign-in/out still
   maps to `logIn`/`logOut` so entitlement never leaks between accounts.
   Entitlement is device-local for guests (+ their store account via Restore).
   Pinned by smoke Z8.

2. **Premium 30-day rhythm insights** (`fe7d0ba`) — the real build.
   - The insights window is parametrized (`windowDays`, free default 7,
     Pro 30 via the shared `EXTENDED_INSIGHTS_WINDOW_DAYS` constant).
   - The hardcoded `delta: 'steady'` stub is **deleted**. Trends are computed
     from on-device logs: recent half of the window vs the earlier half, ±10%
     steady band, and honestly omitted when a half has <2 logged days or no
     baseline. Up, down, and steady are all reachable from data alone
     (smoke EI2/EI3 prove it; EIG1 pins that the single `'steady'` literal
     lives inside `computeTrend`).
   - Free vs Pro genuinely differ: free keeps the unchanged 7-day view with
     **no** trend chips (the old chip was fake); Pro gets a real "Last 30 days"
     section (rhythm cards + per-day stats with trend chips) behind the new
     `canViewExtendedInsights(isPro)` gate. Free users in a live build see a
     teaser that opens the paywall (`pro_gate_seen` gate:'extended_insights').

3. **Weekly recap export — copy truth** (`b43b7ee`).
   The feature was already real (7-day on-device aggregation + native share).
   All sale copy now describes it as a **shareable weekly TEXT summary** —
   never PDF/CSV. Paywall subtitle/benefits rewritten to exactly the two real
   pillars; "Coming later." and the "Soon" badge removed from the purchasable
   surface. Pinned by smoke X9 + rescoped W7b (strictly stronger ban list).

## Cut from the v1 paywall (deliberate, per plan)

- **Fuller history** (`canViewFullHistory`) — dead gate, no feature behind it;
  deferred to v1.1. Removed from ALL sale copy and now on the smoke ban list so
  it cannot silently reappear. The gate predicate remains in code, unwired.
- **Reassure / AI night read** — untouched, stays gated + dormant
  (server kill-switch off), not advertised, not sold.
- Pediatrician summary, multiple babies, extra caregivers, premium themes —
  never advertised, unchanged.

## Integrity check (per-feature, before each commit)

- Free vs Pro genuinely differ for both pillars — yes (see above; smoke-pinned).
- Pro output really computed — yes: no hardcoded trend or window in the Pro
  path; grep + smoke guards (EIG1/EIG2) enforce it permanently.
- Reachable + non-crashing from fresh state — yes: teaser needs no data;
  entitled-but-loading and sparse-data states render calm copy; empty-event
  view models covered by existing IG1.
- `canPurchase` true with `userId === null` — yes (Z8).

## Remaining — human-only (see docs/human-handoff.md for detail)

Paid Apps agreement · ASC subscription products + review screenshot ·
RevenueCat dashboard config + real iOS SDK key · hosted Privacy/Terms pages +
support mailbox + ASC privacy URL · prod env/EAS `production` env block
(`PRO_ENABLED=1` + real keys) · App Privacy re-declaration (RevenueCat =
purchase history + identifiers) · store listing copy per the rules in the
handoff doc · **per-period price disclosure on the paywall (ship-plan Task 2 —
a small dev task, deliberately outside tonight's locked scope)** · on-device
sandbox purchase + Restore test.
