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

- [ ] **T1 — Premium rhythm insights (the real build).**
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

- [ ] **T2 — Copy truth pass (paywall + cards + docs).**
  - PaywallSheet: subtitle/benefits sell ONLY the two real pillars —
    "shareable weekly summary" (text, never "PDF/CSV") + "30-day rhythm
    insights". Remove "Coming later.", remove the "Soon" badge, remove
    "Fuller history" from all live copy (UpgradeCard, ProPreviewCard).
  - Fix `proGates.ts` comment claiming "PDF/CSV".
  - Note store-metadata copy implications in the handoff doc (human applies in ASC).
  Constraints: PaywallSheet keeps required X1 strings, zero `$`, no URLs,
  no "monthly price"/"yearly price" phrases.

- [ ] **T3 — Final verify + docs.**
  `npm run typecheck` + `npm run lint` + `npm run check:local-interactions`
  green; `git diff --check` clean. Per-feature self-checks recorded below.
  Write `docs/pro-v1-done.md` (shipped / cut / human-remaining) and
  `docs/human-handoff.md` for anything external hit along the way.

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

## Log

- Run started 2026-07-04. Plan grounded in `docs/pro-v1-ship-plan.md` +
  `docs/MONETIZATION_MODEL.md`; smoke-guard constraints surveyed
  (X1/X2/X3/Z4–Z7/RE5 pins identified before editing).
