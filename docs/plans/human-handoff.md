# Human handoff — Pro v1 external / human-owned items

Items the overnight build touched conceptually but deliberately did NOT do,
because they are external services, App Store Connect state, or physical-device
work. Nothing here blocks the code; the code degrades calmly until each lands.

## Hard blockers before Pro can sell

1. **Paid Apps agreement** (App Store Connect → Agreements): bank + tax details
   active. Without it IAP cannot sell at all (3.1.1). Can take days — start first.
2. **App Store Connect products:** create `lullaby_pro_monthly` +
   `lullaby_pro_yearly` (auto-renewable, ONE subscription group), localized
   name/price + review screenshot, mark "Ready to Submit" so they review with
   the app binary.
3. **RevenueCat dashboard:** entitlement `pro`, offering `default`, attach both
   products, copy the **public iOS SDK key** into the prod env
   (`EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`).
4. **Legal pages:** the default `lullaby.app` URLs 307-redirect to a parked
   GoDaddy page. Host a real Privacy Policy + Terms/EULA on a domain you own,
   set `EXPO_PUBLIC_PRIVACY_POLICY_URL` / `EXPO_PUBLIC_TERMS_URL` /
   `EXPO_PUBLIC_SUPPORT_EMAIL`, set the ASC Privacy URL, and add both links to
   the store description. Stand up the support mailbox.

## Build/release wiring (config, not feature code — decide and flip deliberately)

5. **Prod env / EAS profile:** `EXPO_PUBLIC_PRO_ENABLED=1`, real RC key,
   `ENTITLEMENT_ID=pro`, `OFFERING_ID=default`,
   `EXPO_PUBLIC_PRO_DEV_ENTITLEMENT=0`, legal URLs — add an `env` block to the
   `production` profile in `eas.json` so Pro mode is a profile decision, not
   leftover machine `.env`. Verify a production build reaches
   `paywallStatus: 'ready'` (never ship PRO_ENABLED=1 with empty keys).
6. **Per-period price disclosure (ship-plan Task 2, NOT built tonight —
   out of the overnight scope):** the paywall currently shows the plan name +
   the store's billed `priceString` only. Before submission, add period length
   and an approximate per-month line for the yearly plan (billed amount stays
   most prominent). This is a code task (`revenueCat.ts` `toProPackageViews` +
   `PaywallSheet.tsx` `PackageButton`); assign it to a dev pass.
7. **App Privacy questionnaire (ASC):** re-declare — RevenueCat collects
   Purchase History + Device identifiers, so "no data collected" is no longer
   true. Keep the earlier health-adjacent + email declarations.

## Store metadata copy rules (write the listing to match the code)

- Advertise ONLY: "shareable weekly summary" (it is TEXT via the share sheet —
  never say PDF/CSV/document) and "30-day rhythm insights with real trends".
- Do NOT mention: fuller/extended history (cut to v1.1), pediatrician summary,
  AI night read (dormant, review-pending), multiple babies, extra caregivers,
  premium themes.
- No medical wording: no diagnosis/treatment/"guarantee sleep"; keep
  "not medical advice".
- Review notes: local-only app, fully usable with **no account**; reviewer can
  purchase as a guest (anonymous RevenueCat); sandbox instructions; external
  service = RevenueCat. Keep China mainland deselected (dormant Claude AI).

## Physical-device verification (cannot be done in this environment)

8. **Sandbox purchase on a real iOS device:** guest (no sign-in) → Insights →
   paywall shows both pillars + packages → purchase → Pro unlocks → weekly
   summary shares real text → 30-day insights render with trend chips → kill +
   reopen → still Pro → delete + reinstall → Restore returns Pro **without
   signing in** (same store account) → already-Pro state shows.
