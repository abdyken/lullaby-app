# Reassure v2 — Build Summary

Branch: `feat/reassure-v2` (not pushed). All work committed in small chunks;
`npx tsc --noEmit`, `npm run lint`, and `npm run check:local-interactions`
(332 checks) all pass at HEAD.

## What was built

### Phase 1 — the local, bounded core (fully wired, runnable offline)

- **Triage-first router** — `src/features/reassure/domain/router.ts`. Every
  input (voice / chip / text) resolves through one `route()` into exactly one
  of `triage | topic | oos`. The red-flag check runs before any topic regex;
  that ordering is enforced twice in the smoke runner: behaviorally (X3:
  "green vomit after a feed" and "gasping between feeds" triage even though
  they contain topic triggers) and structurally (X13 source-scan: the
  `matchesRedFlag` call must precede the first topic regex). The router and
  every domain/content module are pure, RN-import-free leaves (X14) and are
  forbidden from importing Pro gating (safety is structurally unpaywallable).
- **Screen** — `src/app/(tabs)/reassure.tsx` rewritten in place: night-sky
  hero (reuses the existing `sky.night` token — identical hexes to the demo
  gradient) with the demo's six stars, the voice orb, safety-promise line,
  typed ask + six example chips (two ⚑ triage demos), the bounded AnswerCard
  (calm indigo header for topic/oos, red gradient + call actions for triage),
  the windowed recap card, the "Common tonight" accordion (replaces the five
  static P0 cards), and the persistent disclaimer. Day/night surface aware;
  reduce-motion gates every loop and entrance.
- **Night-window recap** — `domain/nightWindow.ts` + `domain/recap.ts` over
  the LIVE legacy event store (`useLocalEvents().events`). Window: 18:00 →
  now while the night is live (incl. the 2am case), yesterday 18:00 → 10:00
  as the morning recap. Spit-ups count via the new `Spit-up` note preset on
  Tonight's note sheet (`SPITUP_NOTE_LABEL` shared constant, drift-guarded by
  X16; zero schema change). `recapReadText` is strictly descriptive — X12
  fails the build if judgement vocabulary (normal/typical/…) ever creeps in.
- **Voice (on-device STT)** — `expo-speech-recognition@~56.0.1` installed +
  config plugin in `app.json` (permission strings verified via
  `npx expo config --type prebuild`). `application/speech.ts` lazy-requires
  the native module so every failure mode (module absent on the current dev
  client, no speech service, permission denied) collapses into a degraded orb
  state that focuses the text input — never a crash. `useVoiceInput` pins
  en-US, mirrors interim transcripts, hard-aborts at 10s, and feeds the final
  transcript into the SAME `ask()` as every other input.
- **Analytics** — nine `reassure_*` events in the typed union. Privacy rule:
  props are coarse enums only (source / route_kind / topic / action); the raw
  ask or transcript text is never sent to analytics.
- **Theme** — `alert / alert2 / alertTint` tokens (+ tailwind mirror);
  `useReduceMotion` extracted from BrandSplashGate into `src/lib/`.

### Phase 2 — LLM night read (built end-to-end, dark until deploy)

- **Edge function** `supabase/functions/reassure-night-read/index.ts`:
  JWT → `baby_caregivers` authz → cache → events read under RLS → tallies
  computed IN CODE → red-flag scan over every string entering the prompt →
  Claude (`REASSURE_MODEL` env, default `claude-opus-4-8`; structured JSON
  output, `stop_reason === 'refusal'` handled, 8s timeout, 0 retries) →
  full audit insert → cache upsert. Every failure returns
  `source: 'fallback'`.
- **Tables** (migration files only): `reassure_night_reads` (PK
  `(baby_id, night_key)` doubles as the once-per-night rate limit; caregivers
  select, service-role writes) and `reassure_audit` (full request/response;
  RLS with zero client policies — service-role only).
- **Client** `application/nightRead.ts` + `canUseLlmNightRead` in
  `src/lib/proGates.ts`: Pro-gated, AsyncStorage per-night cache, 3s fetch
  ceiling, silent fallback. The local descriptive read always renders first;
  free users keep the complete recap (the gate covers polish, never safety).

### Phase 3 — topic polish (server built, client wiring deferred)

- **Edge function** `supabase/functions/reassure-topic-polish/index.ts`:
  re-runs the SHARED red-flag scan on the parent's raw text FIRST and returns
  `{kind:'triage'}` before any model call; unknown topics return `oos`
  without a model call; otherwise Claude rephrases ONLY the clinician-owned
  KB line (length-bounded, refusal-aware, audited).
- **Deliberately not wired into the app yet:** sending the parent's raw text
  off-device needs the consent line added to the disclaimer + clinician
  sign-off of the system prompt (manifest items #10/#13). The curated KB
  answer is already complete without it, so nothing is missing functionally.

## Stubbed / placeholder (the one allowed exception)

- **All medical copy is `PLACEHOLDER — pending clinician review`:** the
  red-flag list, all four KB topics, triage/oos copy, chips, hero/safety/
  disclaimer lines, the emergency-info line, and both LLM system prompts.
  `REASSURE_CONTENT.status === 'draft'`; the full sign-off checklist is
  `docs/reassure-content-review.md`. Smoke X15 asserts the placeholder tags
  survive while draft.
- **`ANTHROPIC_API_KEY` / `REASSURE_MODEL`** are read from Supabase function
  env — not set anywhere by me. Without the key the function audits the miss
  and returns `fallback`.

## Decisions made along the way (assumptions, not blockers)

1. **Pre-existing uncommitted work:** `main` had an uncommitted startup-
   diagnostics WIP touching 10 files. Committed as-is in its own first commit
   on this branch so the feature diff stays reviewable.
2. **Deno content sharing:** went straight to the mirror-plus-drift-guard
   (smoke X17 deep-equals `REDFLAGS`/`KB`/normalization across the app and
   `supabase/functions/_shared/reassureContent.ts`) instead of gambling on
   the bundler following cross-tree relative imports. `tsconfig.json` now
   excludes `supabase/functions` from the app's typecheck (Deno globals).
3. **Emergency actions:** "Call pediatrician" opens the dialer (`tel:`) —
   no number is stored anywhere in the app yet; "Local emergency number"
   shows an info line and never auto-dials (region-specific). A settings
   field for the pediatrician's number is the natural follow-up.
4. **"Typical night" chip from the demo** is an interpretive claim, so the
   shipped chip is the neutral "From tonight's logs" until clinician-approved
   Phase-2 output can carry judgement.
5. **Voice ships without an env flag** — the lazy seam already degrades
   cleanly on clients without the native module, which is what a flag would
   have simulated.
6. **Accordion animation** uses LayoutAnimation + a chevron timing (jump-cut
   under reduce-motion) rather than reanimated worklets — matches the
   codebase's dominant RN-Animated pattern.
7. **Pump events are excluded from the recap** (caregiver-owned, not part of
   the baby's night read).

## Not done here (needs a device / your account)

- **Dev-client rebuild** for the native speech module: `npm run android`
  locally / an EAS iOS build. Until then the orb shows "Type instead".
- **Applying the two migrations and deploying the two functions** (project
  rules: no deploys, no production migrations from this session). Sequence
  when ready: `supabase db push` (or apply via dashboard) → set
  `ANTHROPIC_API_KEY` (+ optionally `REASSURE_MODEL`) in function secrets →
  `supabase functions deploy reassure-night-read reassure-topic-polish` →
  QA the timeout/fallback/refusal paths in staging.
- **Manual device checklist** (plan §Verification): day/night toggle across
  the new surfaces, reduce-motion pass, voice grant/deny/revoke, airplane
  mode, TalkBack/VoiceOver labels, 4-chip note-sheet wrap on narrow screens.

## Open questions

1. Who owns the clinician review, and by when? (Launch-blocking.)
2. Store a pediatrician phone number in settings so the triage button dials
   for real?
3. Logging v2 has no `note` type — spit-up counting needs a v2 design before
   `EXPO_PUBLIC_LOGGING_V2` flips on (the recap currently reads the live
   legacy store, mirroring every other screen).
4. Model choice: `claude-opus-4-8` is the default; `claude-haiku-4-5` at
   $1/$5 per MTok is the cheap knob via `REASSURE_MODEL` (a night read is
   ~500 in / ~150 out tokens — well under a cent either way).
