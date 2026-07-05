# Release & beta environment reference

The single source of truth for which env vars a Lullaby build needs, per
posture. Companion to `.env.example` (safe defaults) and pinned by the §RE
smoke checks in `scripts/check-local-interactions.ts`.

Every `EXPO_PUBLIC_*` variable is inlined into the JS bundle at build time and
is **public**. `.env` is gitignored and never committed; whatever machine (or
EAS profile) produces a build decides these values, so set them deliberately —
a leftover dev flag on a build machine silently rides into the bundle.

## The beta rule for Pro

> **Pro is OFF unless a build explicitly enables it AND provides real
> RevenueCat keys.** `EXPO_PUBLIC_PRO_ENABLED=1` with empty RevenueCat keys is
> an *unconfigured* state: the app does not crash (Pro surfaces degrade and the
> paywall shows a calm "not configured" notice), but it shows upsells that
> dead-end. Treat that combination as **not beta-ready** — never ship it on
> purpose, and never read "it built fine" as "Pro is ready".

## Postures

### Normal QA / beta / release (Pro off — current default)

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_FORCE_ONBOARDING` | `false` (or unset) |
| `EXPO_PUBLIC_PRO_ENABLED` | `0` (or unset) |
| `EXPO_PUBLIC_PRO_PREVIEW_ENABLED` | `0` (or unset) |
| `EXPO_PUBLIC_PRO_DEV_ENTITLEMENT` | `0` (or unset) |
| `EXPO_PUBLIC_REVENUECAT_*_API_KEY` | empty |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | real project values (anon key only) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | real web client id |

Core logging, Reassure (including safety/triage and the local night read), and
caregiver invites are fully functional in this posture — none of them is
Pro-gated, ever.

### Local Pro QA (dev builds only)

```
EXPO_PUBLIC_PRO_ENABLED=1
EXPO_PUBLIC_PRO_DEV_ENTITLEMENT=1
```

`EXPO_PUBLIC_PRO_DEV_ENTITLEMENT` grants `isPro = true` without a purchase so
Pro-gated surfaces (weekly export, AI night-read polish — the polish still
additionally requires local consent and the server kill switch) can be
exercised. It is resolved through `resolveDevProEntitlement(__DEV__)` in
`src/lib/proConfig.ts`, so **a release binary always ignores it** — but keep it
`0` outside active Pro QA anyway so it never lingers on a build machine.
**Beta and release builds must not set it.**

### Real Pro (deferred — requires deliberate setup)

Enabling real purchases requires **all** of:

1. `EXPO_PUBLIC_PRO_ENABLED=1`
2. `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` and/or
   `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` set to the real public SDK keys for
   the platforms being shipped
3. `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` and
   `EXPO_PUBLIC_REVENUECAT_OFFERING_ID` matching the RevenueCat dashboard
   (code defaults: `pro` / `default`)
4. Store products created and attached to that offering in RevenueCat
   (not covered here — separate task)

If any key is missing for a shipped platform, that platform is unconfigured —
see the beta rule above. Missing keys must be treated as "Pro is not ready",
never silently accepted.

`EXPO_PUBLIC_PRO_PREVIEW_ENABLED` (fake-door, no payment) is a separate,
mutually-exclusive-by-precedence mode: real Pro supersedes preview, and both
default off.

## Onboarding

`EXPO_PUBLIC_FORCE_ONBOARDING` is a dev-only QA flag (`__DEV__`-gated; inert in
release binaries). It must be `false`/unset for normal QA and every beta or
release build. On a dev build it replays the onboarding intro for no-session
users on every launch, and a guest completing the replay re-creates the local
baby — use it only on disposable installs for targeted onboarding QA.

## Settings links (privacy / terms / support)

`EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_TERMS_URL` and
`EXPO_PUBLIC_SUPPORT_EMAIL` override the destinations behind the Settings
screen's Privacy Policy, Terms of Use and Contact support rows. Unset or blank
falls back to the placeholders documented in `src/lib/appLinks.ts`
(`https://lullaby.app/privacy`, `https://lullaby.app/terms`,
`support@lullaby.app`), so the rows always render and never crash — but a
placeholder that isn't actually hosted is itself an App Store review risk.
Before submission, either host real pages at the placeholder URLs or set these
vars to the real hosted URLs and monitored mailbox (§SL smoke checks pin the
fallback behavior).

## Server-side variables (never Expo env)

These live in Supabase (edge-function secrets / project config), **never** in
`.env`, `.env.example`, or any `EXPO_PUBLIC_*` variable:

- `REASSURE_NIGHT_READ_ENABLED` — server kill switch for the AI night-read
- `ANTHROPIC_API_KEY` — LLM key for the Reassure edge functions
- `REASSURE_MODEL` — pinned model id for the Reassure edge functions
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; the client uses the anon key

Putting any of these in an `EXPO_PUBLIC_` variable would ship the secret inside
the app bundle. The §RE smoke checks fail if one ever appears in
`.env.example`.

## Release checklist (env portion)

- [ ] Build source (machine `.env` or EAS profile env) matches one posture
      above — no mixed leftovers
- [ ] `EXPO_PUBLIC_FORCE_ONBOARDING` false/unset
- [ ] `EXPO_PUBLIC_PRO_DEV_ENTITLEMENT` `0`/unset
- [ ] Pro either explicitly OFF, or explicitly ON with real keys + store
      products verified
- [ ] No `EXPO_PUBLIC_AUTH_DEBUG` set
- [ ] Supabase auth redirect allowlist covers the build's OAuth callback URL
      (dashboard setting; not code-verifiable)
