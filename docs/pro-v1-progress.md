# Pro v1 — overnight build progress

Autonomous run on branch `feat/pro-subscription-v1`. Source of truth for what has
landed and what is next. Each task is ticked ONLY when its verification passed
(typecheck + lint + check:local-interactions green) and it is committed.

Scope (locked): (0) anonymous/guest purchase, (1) premium 30-day rhythm insights
with REAL trends behind an `isPro` gate, (2) recap-export copy truth pass
("shareable weekly summary", never "PDF/CSV"; cut "Fuller history" from copy),
(3) verification + done/handoff docs. Everything else (legal pages, Paid Apps
agreement, ASC config, per-period price disclosure, sandbox device test) is the
human's track — recorded in docs/human-handoff.md / docs/pro-v1-done.md.

Integrity rule in force: a feature is either genuinely computed and reachable, or
it is cut from the paywall. No gated stubs, no hardcoded values.

## Tasks

- [x] **T0 — Anonymous/guest purchase (blocker).** *(committed: see log)*
  RevenueCat configures with an anonymous appUserID when there is no Supabase
  session; `ProProvider` stops forcing `signed_out` when `userId === null`;
  `canPurchase` no longer requires a userId; identity still switches via
  `logIn`/`logOut` when a session appears/disappears. `signed_out` paywall state
  removed end-to-end (a guest paywall can now reach `ready`).
  Self-check: `canPurchase` must be true with `userId === null` once status is
  `ready`; entitlement stays device-local; RE5 regex
  (`!hasRevenueCatConfig(platform) ? 'unconfigured'`) preserved.

- [x] **T1 — Premium rhythm insights (the real build).** *(committed: see log)*
  - Parametrize the insights window (`windowDays`, default 7) through
    `insightSelectors.ts` / `getInsightsViewModel.ts`.
  - Replace the hardcoded `delta: 'steady'` with a REAL trend computed from
    on-device logs (recent half-window vs earlier half-window, thresholded).
    The free 7-day view drops the fake delta entirely.
  - New gate `canViewExtendedInsights(isPro)` in `proGates.ts`.
  - InsightsScreen: free (enabled mode) sees the 7-day view + an "unlock 30-day
    insights" teaser that opens the paywall; Pro sees a real 30-day section with
    computed trends, loaded via `loadEventsInRange` (30 days).
  - Add smoke checks pinning: real trend math (up/down/steady from synthetic
    events), the 30-day window actually includes >7-day-old events, no hardcoded
    'steady' literal in the stats path, free path routes to paywall.
  Self-check (integrity): grep proves no hardcoded trend/window in the Pro path;
  free vs Pro genuinely differ; non-crashing from fresh/empty state.

- [x] **T2 — Copy truth pass (paywall + cards + docs).** *(committed: see log)*
  - PaywallSheet: subtitle/benefits sell ONLY the two real pillars —
    "shareable weekly summary" (text, never "PDF/CSV") + "30-day rhythm
    insights". Remove "Coming later.", remove the "Soon" badge, remove
    "Fuller history" from all live copy (UpgradeCard, ProPreviewCard).
  - Fix `proGates.ts` comment claiming "PDF/CSV".
  - Note store-metadata copy implications in the handoff doc (human applies in ASC).
  Constraints: PaywallSheet keeps required X1 strings, zero `$`, no URLs,
  no "monthly price"/"yearly price" phrases.

- [x] **T3 — Final verify + docs.** *(committed: see log)*
  typecheck ✓ · lint ✓ · check:local-interactions 414/414 ✓ ·
  `git diff --check` ✓. Wrote `docs/pro-v1-done.md` + `docs/human-handoff.md`;
  amended `docs/MONETIZATION_MODEL.md` in place (extended insights is now a
  built v1 Pro pillar) so the product doc stays in sync with the gate code.

## Per-feature self-check results

### T0 — anonymous/guest purchase ✅
- `canPurchase` with `userId === null`: TRUE once paywall is `ready` —
  `const canPurchase = proMode === 'enabled' && paywallStatus === 'ready' && !isPurchasing`
  (no userId term; pinned by new smoke check Z8).
- Guest configure path: `configureRevenueCat({ userId: null })` →
  `Purchases.configure({ apiKey, appUserID: null })` — RevenueCat mints/persists
  its own anonymous id; entitlement is device-local.
- Identity hygiene kept: sign-in mid-session → `logIn(user.id)` once; sign-out →
  `logOut()` back to anonymous (never leaks entitlement between accounts);
  `logOut` no-ops when already anonymous (SDK errors otherwise).
- `signed_out` paywall state removed end-to-end (type union, provider, sheet) —
  no "Sign in to subscribe" dead end remains (Z8 pins its absence).
- RE5 unconfigured-state pin preserved; verification: typecheck ✓, lint ✓,
  smoke 407/407 ✓ (was 406, +Z8), `git diff --check` ✓.

### T1 — premium 30-day rhythm insights ✅ (integrity check passed)
- **Free vs Pro genuinely differ:** free = the unchanged 7-day view, now with NO
  trend chips at all (the fake `delta: 'steady'` stub is deleted); Pro = a real
  "Last 30 days" section (rhythm cards + per-day stats) computed over 30 days of
  on-device logs via `loadEventsInRange`.
- **Pro output really computed:** trends come from `buildWindowTrends` /
  `computeTrend` — recent half of the window vs the earlier half, ±10% steady
  band, and NO trend at all when a half has <2 logged days or the baseline is
  zero (never a made-up chip). Smoke EIG1 pins that exactly one `'steady'`
  literal exists and it lives inside `computeTrend`; EI2/EI3 prove up/down/steady
  are all reachable from data alone; EI1 proves the 30-day window genuinely
  includes >7-day-old events; EI4 proves free carries no chip.
- **Gate:** new `canViewExtendedInsights(isPro)` in proGates; free (enabled
  mode) sees a teaser → `pro_gate_seen` gate:'extended_insights' +
  `paywall_opened` + openPaywall; teaser shows no premium data. Card renders only
  when `getProMode() === 'enabled'` and `dataDays >= 4` (EIG2 pins all of this).
- **Non-crashing from fresh state:** entitled-but-loading shows a calm line;
  sparse 30-day data shows a calm fill-in line; empty events already covered by
  IG1. Extended load failure keeps the last good view and never blocks the free
  path.
- Verification: typecheck ✓, lint ✓, smoke 413/413 ✓ (+EI1–EI4, EIG1–EIG2),
  `git diff --check` ✓.

### T2 — copy truth pass ✅
- PaywallSheet now sells exactly the two BUILT pillars: "Shareable weekly
  summary — a calm text recap you can keep or send" + "30-day rhythm insights
  with real trends from your logs". "Coming later." subtitle, the "Soon" badge,
  and "Fuller history" are gone from the purchasable paywall.
- UpgradeCard / ProPreviewCard live sublines match the same sell-list; the
  non-paid fake-door (preview mode) keeps its honest "Coming later." framing.
  ProPreviewCard's corner label in a live build is now "Pro", not "Soon".
- The export is described as a TEXT summary everywhere; the `proGates.ts`
  comment no longer implies a PDF/CSV exists.
- Smoke: new X9 pins the honest sell-list (no fuller-history/coming-later/
  Soon/PDF/CSV on the paywall; both real pillars named). W7b RESCOPE (not a
  weakening): it previously asserted the presence of the old future-facing
  copy ("Fuller history…") — that copy is now an Apple 2.3.2 liability on a
  live paywall, so the check now asserts the new truthful sell-list AND bans
  all the old claims outright (strictly stronger ban list).
- Verification: typecheck ✓, lint ✓, smoke 414/414 ✓, `git diff --check` ✓.

## Log

- Run started 2026-07-04. Plan grounded in `docs/pro-v1-ship-plan.md` +
  `docs/MONETIZATION_MODEL.md`; smoke-guard constraints surveyed
  (X1/X2/X3/Z4–Z7/RE5 pins identified before editing).
- T0 landed as `f217926` (guest/anonymous purchase; +Z8; 407 checks).
- T1 landed as `fe7d0ba` (30-day insights + real trends; +EI1–EI4, EIG1–EIG2;
  413 checks).
- T2 landed as `b43b7ee` (honest sell-list copy; +X9, W7b rescoped stronger;
  414 checks).
- T3: done + handoff docs written; monetization model amended. Run complete —
  nothing pushed (repo rule). Remaining items are human-only
  (docs/human-handoff.md).
