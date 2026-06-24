# Lullaby Onboarding Plan

## Product Goal

Lullaby onboarding should help a tired new parent understand the app in seconds, feel calm enough to trust it, and reach baby setup without unnecessary friction.

The first-run flow should achieve four things:

- Explain the app quickly: Lullaby is a calm night companion for tracking feeds, sleep, diapers, and the night's handoff.
- Create calm and trust: the user should feel that this app is built for 3am, one-handed, low-light care.
- Get the user to baby setup fast: onboarding should introduce the core loop, then move directly into setup.
- Avoid unnecessary friction: no long quiz, no feature tour, no marketing wall, no fake personalization.

This plan should respect the existing product direction in `docs/MOBILE_APP_BLUEPRINT.md`: Lullaby is not a medical dashboard, analytics tool, or generic baby tracker. It should feel like a soft night-light, not a spreadsheet.

## Existing App Context To Reuse Or Respect

Onboarding must feel like part of the current app, not a separate product. Later implementation should reuse or respect these existing files and assets:

- `docs/MOBILE_APP_BLUEPRINT.md`: source of truth for the night companion promise, onboarding goal, and 3am feel.
- `docs/LULLABY_STRATEGY.md`: reinforces that first-run should set the emotional tone and avoid a marketing wall.
- `.reference/lullaby-phone-mockup.html`: approved visual reference for the orb, sky, cream surface, quick logging, and calm night flow.
- `src/theme/index.ts`: theme tokens for cream background, sky gradients, sleep/feed/diaper accents, Fredoka/Nunito fonts, radii, shadows, and low-glare night surfaces.
- `src/components/OrbHero.tsx`: the breathing orb, sky gradients, stars/clouds, progress ring, state icons, and soft pulse behavior.
- `src/components/QuickLogRow.tsx`: the large quick-action logging pattern that onboarding should preview.
- `src/components/auth/AuthGate.tsx`: later `OnboardingGate` should sit before the signed-out auth screen and before baby setup.
- `src/components/auth/AuthScreen.tsx`: account screen should remain calm and short after onboarding.
- `src/components/auth/BabySetupScreen.tsx`: baby setup should become the final onboarding step.
- `src/components/auth/AuthShell.tsx`: current full-screen cream auth/setup style should guide onboarding layout.
- `src/app/_layout.tsx`: root layout already holds the native splash until fonts and theme are ready.
- `app.json`: native splash already uses the cream background and `expo-splash-screen`.
- `assets/images/logo-glow.png`: best current visual anchor for the intro moment because it already feels orb-like.
- `assets/images/splash-icon.png` and app icon assets: should stay simple at the native splash layer unless brand assets are updated deliberately.

## Recommended Onboarding Flow

### 1. Native Splash

Keep the native splash simple and static.

- Cream background.
- Existing splash/logo asset.
- No complex animation at the native layer.
- Hide only after fonts, theme, and app readiness are resolved.

Reason: Expo SDK 56 supports splash configuration and splash visibility control, but richer motion is safer and easier to control inside React Native once the app is ready.

### 2. Logo / Orb Intro Moment

After the native splash fades, show a short branded intro moment.

- Use `assets/images/logo-glow.png` or a native orb treatment as the main visual.
- Let the glow softly scale or breathe into the orb identity.
- Keep the moment short, around 1.5 to 2.5 seconds.
- Use one calm line of copy, not a slogan-heavy hero.

Suggested copy:

> A calm night log for the half-asleep hours.

This is the place to borrow from Headspace's calm emotional entry: a gentle first breath before the app asks for anything.

### 3. Three Short Onboarding Screens

Show exactly three panels before baby setup:

1. Track the night
2. Log in one tap
3. Wake up clear

The panels should be horizontal, full-screen, and simple. Each panel should carry one idea only.

### 4. Baby Setup As The Final Onboarding Step

After the third panel, route into the existing baby setup flow.

Baby setup is not a separate cold form. It is the final onboarding step where the promise becomes personal:

- Create a new baby.
- Join with an invite code.
- Pick caregiver role.
- Start tonight.

The existing `BabySetupScreen` already has the right calm tone and should be preserved.

### 5. Enter The App

After setup, enter the main app directly on Tonight.

The first real screen should prove the onboarding promise immediately:

- Baby context is present.
- The orb is alive.
- Quick logging is visible.
- The user knows what to tap next.

## Screen-By-Screen Concept

### Screen 1: Track The Night

**Screen title:** Track the night

**Short copy:** See feeds, sleep, diapers, and who handled what without piecing it together at 3am.

**Visual idea:** Show a simplified night orb scene using the existing night sky direction: soft navy gradient, a breathing moon/orb, tiny stars, and one or two calm timeline marks below it.

**Motion/animation idea:** The orb slowly breathes. One small timeline item fades in after the title. Stars should be subtle and static or nearly static.

**Primary CTA:** Next

**What the user should feel:** Oriented. The app understands the night shift and will keep the thread for them.

### Screen 2: Log In One Tap

**Screen title:** Log in one tap

**Short copy:** Feed, sleep, diaper, and pump stay within thumb reach when you are half awake.

**Visual idea:** Preview the existing quick-log grid style from `QuickLogRow`: large rounded action tiles with the current feed, sleep, diaper, and pump colors from `src/theme/index.ts`.

**Motion/animation idea:** A single tile gives a soft press/pulse preview, then a small saved state appears. Use motion like confirmation, not entertainment.

**Primary CTA:** Next

**What the user should feel:** Capable. Logging will not require thinking, typing, or two hands.

### Screen 3: Wake Up Clear

**Screen title:** Wake up clear

**Short copy:** Wake up to a simple night recap, with reassurance close by when worry starts looping.

**Visual idea:** Show a calm recap card and a small Reassure hint. If showing caregiver handoff, keep it factual and avoid implying real-time sync unless that feature is actually enabled in the build.

**Motion/animation idea:** A recap card rises slightly into place. Keep the movement slow and grounded. Avoid confetti, bouncing, or reward-style animation.

**Primary CTA:** Set up baby

**What the user should feel:** Relieved. The app will help them wake up with context instead of a foggy memory.

## Visual Direction

The onboarding should use Lullaby's existing visual language:

- Cream background remains the default surface.
- The feeling should be soft night-light, not toy-like or clinical.
- The breathing orb is the main identity anchor.
- Stars and clouds are allowed only when they match the current `OrbHero` sky design.
- Use the existing sleep, feed, diaper, pump, mom, and dad colors from `src/theme/index.ts`.
- Use Fredoka for display and Nunito for body, matching the app.
- Use warm shadows and rounded surfaces from the current theme.
- Keep copy short and emotionally reassuring.

Avoid:

- Generic mascot characters unless a future mascot is deliberately designed around the orb language.
- Loud gradients that fight the current sky gradients.
- Bright, saturated, childish baby-app visuals.
- Stock illustration style.
- Heavy cards inside cards.
- Feature-grid marketing composition.

Tiimo can inspire the clarity and gentle sequencing. Headspace can inspire the calm emotional pacing. Neither should be copied visually.

## Motion Direction

Motion should feel like the app is breathing with the parent, not performing for them.

Use:

- Slow, soft, calm movement.
- Logo/glow gently transitioning into the orb.
- Subtle breathing or pulse motion, similar to the existing orb.
- Smooth horizontal page transitions.
- Small fade/translate entrances for copy and preview elements.
- Press feedback that feels tactile and quiet.

Avoid:

- Heavy animation.
- Fast bouncing.
- Confetti or gamified celebration.
- Complex choreography before the user understands the product.
- Motion that blocks setup or makes returning users wait.

Respect reduced-motion settings later. If reduced motion is enabled, keep the sequence usable with fades or static states.

## UX Constraints

These constraints should be strict:

- Onboarding should be completed in around 20 to 30 seconds.
- No more than 3 onboarding panels before baby setup.
- No long quiz.
- Do not ask personalization questions unless the answer changes the app experience immediately.
- Must be usable one-handed.
- Must feel good at night and avoid bright visual shocks.
- Should not block returning users.
- Should not block signed-in users with an existing baby.
- Must include a skip or direct route to setup if the user wants to move fast.
- Copy should fit on small phones without crowding controls.
- Every primary action should be large enough for tired, one-handed use.

## Implementation Notes For Later

Do not implement these now. This is the recommended technical direction for the future build.

- Add an `OnboardingGate` before `AuthScreen` and `BabySetupScreen`.
- Persist completion with AsyncStorage.
- Use a versioned key such as `lullaby.onboarding.v1.complete`.
- Treat onboarding completion as best-effort local state, similar to existing local persistence behavior.
- Keep native splash simple and static through `expo-splash-screen`.
- Put richer animation inside React Native after app, theme, and fonts are ready.
- Reuse `colors`, `sky`, `fonts`, `radii`, `shadows`, and `surfaces` from `src/theme/index.ts`.
- Reuse or adapt `OrbHero` behavior instead of introducing a separate visual system.
- Reuse `AuthShell` layout principles for full-screen cream onboarding surfaces.
- Route completion into the existing auth/setup state machine:
  - signed-out new user sees onboarding before account creation
  - signed-in user without baby goes to baby setup
  - ready user skips onboarding and enters the app
  - local-only demo mode can either skip onboarding or expose a dev reset for testing
- Keep onboarding reset/debug controls dev-only if added later.

## Risks / What Not To Do

- Do not copy Tiimo or Headspace directly. Use them only as references for pacing, clarity, and emotional calm.
- Do not make onboarding too playful. Lullaby is warm, but the parent may be exhausted and anxious.
- Do not make onboarding too long. More panels will make the app feel like work before it has helped.
- Do not introduce a new visual language that conflicts with the orb, cream surface, and current sky system.
- Do not add personalization if the answer is fake or unused.
- Do not overpromise partner sync, handoff, or recap behavior that is not real in the current build.
- Do not make the intro animation mandatory on every launch.
- Do not bury baby setup behind account education or feature marketing.
- Do not use medical reassurance language in onboarding. Keep reassurance bounded and non-diagnostic.
- Do not use bright white screens or high-glare transitions at night.

## Final Recommendation

For MVP, implement the minimal version first:

**Splash -> soft logo/orb intro -> 3 onboarding panels -> baby setup -> app.**

Keep it short, emotionally clear, and visually native to Lullaby. The onboarding should not explain every feature. It should make the parent feel: "This app understands the night, and I can set it up quickly."
