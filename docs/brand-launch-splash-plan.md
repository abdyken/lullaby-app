# Lullaby Brand Launch Splash Implementation Plan

## Goal

Implement a calm, premium app launch experience for Lullaby, inspired by Tiimo-style smooth entry.

When the user opens the app, they should briefly see:

```text
Lavender background
→ centered Lullaby logo
→ subtle logo reveal
→ smooth fade into onboarding or main app
```

This should feel like a branded product entrance, not a loading screen.

## Product Intent

Lullaby is a calm newborn night-shift companion. The launch experience should match that feeling:

- soft
- quiet
- premium
- non-distracting
- fast
- usable at night

Avoid playful, bouncy, loud, or long animations.

## Desired User Flow

```text
Native app launch
→ native splash screen with lavender background and logo
→ React Native BrandSplashGate overlay
→ overlay fades out smoothly
→ existing OnboardingGate/AuthGate flow continues
```

The feature must not change the existing onboarding, auth, baby setup, or tab navigation logic.

---

## Step 1 — Prepare the Logo Asset

Create or export a local logo mark asset based on the Lullaby landing hero logo.

Recommended file:

```text
assets/images/lullaby-logo-mark.png
```

Asset requirements:

- PNG format
- transparent background
- high resolution, ideally 1024×1024
- centered logo mark
- no remote URL usage
- should look clean on lavender background

Do not fetch the logo from the landing page at runtime. The splash screen must work before internet access and before JavaScript is ready.

---

## Step 2 — Define Shared Brand Values

Create a small constants file if one does not already exist.

Suggested file:

```text
src/theme/brandLaunch.ts
```

Suggested values:

```ts
export const BRAND_LAUNCH = {
  backgroundColor: '#EFE8FF',
  logoSize: 132,
  minDurationMs: 900,
  logoFadeInMs: 220,
  logoScaleInMs: 420,
  overlayFadeOutMs: 320,
} as const;
```

Notes:

- `#EFE8FF` is the recommended lavender launch background.
- Keep the intro short: around 900–1200ms total.
- Do not make this feel like a forced intro.

---

## Step 3 — Configure Native Expo Splash Screen

Use Expo's native splash screen configuration so the user immediately sees the branded background before React Native loads.

Update `app.json` or `app.config.ts`.

Example for `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#EFE8FF",
          "image": "./assets/images/lullaby-logo-mark.png",
          "imageWidth": 170,
          "resizeMode": "contain",
          "dark": {
            "backgroundColor": "#EFE8FF",
            "image": "./assets/images/lullaby-logo-mark.png"
          }
        }
      ]
    ]
  }
}
```

If the project already has an `expo-splash-screen` plugin entry, update it instead of adding a duplicate.

Important:

- Any native splash config change requires a native rebuild.
- `expo start` alone is not enough for this part.
- Rebuild with:

```bash
npx expo run:android
```

---

## Step 4 — Add a React Native BrandSplashGate

Create a React Native overlay that appears immediately after JS loads.

Suggested file:

```text
src/components/boot/BrandSplashGate.tsx
```

Implementation requirements:

- Render children immediately underneath the overlay.
- Overlay should cover the full screen.
- Background should match native splash lavender.
- Logo should be centered.
- Animate only:
  - opacity
  - subtle scale from `0.96` to `1.0`
- Then fade the whole overlay out.
- Use `pointerEvents="none"` so it does not block after fade.
- Respect Reduce Motion.

Example implementation:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

const BACKGROUND_COLOR = '#EFE8FF';
const LOGO_SIZE = 132;

const MIN_DURATION_MS = 900;
const LOGO_FADE_IN_MS = 220;
const LOGO_SCALE_IN_MS = 420;
const OVERLAY_FADE_OUT_MS = 320;

type BrandSplashGateProps = {
  children: React.ReactNode;
};

export function BrandSplashGate({ children }: BrandSplashGateProps) {
  const [visible, setVisible] = useState(true);
  const reduceMotion = useReducedMotion();

  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const logoScale = useRef(new Animated.Value(reduceMotion ? 1 : 0.96)).current;

  useWindowDimensions();

  useEffect(() => {
    if (reduceMotion) {
      const timer = setTimeout(() => {
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }).start(() => setVisible(false));
      }, 350);

      return () => clearTimeout(timer);
    }

    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: LOGO_FADE_IN_MS,
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: LOGO_SCALE_IN_MS,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: OVERLAY_FADE_OUT_MS,
        useNativeDriver: true,
      }).start(() => setVisible(false));
    }, MIN_DURATION_MS);

    return () => clearTimeout(timer);
  }, [logoOpacity, logoScale, overlayOpacity, reduceMotion]);

  return (
    <View style={styles.root}>
      {children}

      {visible ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.overlay, { opacity: overlayOpacity }]}
        >
          <Animated.View
            style={{
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            }}
          >
            <Image
              source={require('../../../assets/images/lullaby-logo-mark.png')}
              style={styles.logo}
              resizeMode="contain"
              accessible
              accessibilityLabel="Lullaby"
            />
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BACKGROUND_COLOR,
    zIndex: 999,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});
```

Adjust imports if the project does not use `react-native-reanimated` for reduced motion. If there is already a project-level reduce-motion helper, use that instead.

---

## Step 5 — Place the Gate Above Existing App Flow

The gate should wrap the existing root flow.

Correct placement:

```text
BrandSplashGate
└── existing AuthGate / OnboardingGate / RootNavigator
```

Example:

```tsx
<BrandSplashGate>
  <AuthGate />
</BrandSplashGate>
```

or:

```tsx
<BrandSplashGate>
  <RootNavigator />
</BrandSplashGate>
```

The exact location depends on the current app structure.

Important:

- Do not put this inside onboarding slides.
- Do not put this inside tab navigation.
- Do not change onboarding copy.
- Do not change auth logic.
- Do not change baby setup logic.
- Do not change logging state hydration logic.

The overlay should be purely visual.

---

## Step 6 — Handle App Readiness Safely

The app should not reveal a blank or unhydrated screen behind the overlay.

If the project already waits for fonts, theme, storage, or auth hydration before rendering the app, keep that logic unchanged.

Recommended behavior:

```text
Native splash remains while critical app readiness completes
→ BrandSplashGate appears after React tree is ready
→ BrandSplashGate fades away
→ user sees the correct first screen
```

Avoid this:

```text
Native splash hides
→ blank white screen
→ logo overlay appears late
```

If the app manually calls `SplashScreen.hideAsync()`, make sure it only happens after core app readiness is complete.

---

## Step 7 — Animation Timing

Recommended timing:

```text
0ms      lavender background visible
0–220ms  logo fades in
0–420ms  logo gently scales from 0.96 to 1.0
900ms    overlay starts fading out
1220ms   app is fully visible
```

Recommended values:

```ts
const MIN_DURATION_MS = 900;
const LOGO_FADE_IN_MS = 220;
const LOGO_SCALE_IN_MS = 420;
const OVERLAY_FADE_OUT_MS = 320;
```

Do not exceed 1500ms unless there is a strong reason.

This should feel smooth, not slow.

---

## Step 8 — Reduce Motion Support

If Reduce Motion is enabled:

- skip the scale animation
- keep logo static
- use a shorter fade
- or transition almost immediately

Expected reduced motion flow:

```text
lavender logo screen
→ short fade
→ app
```

No zoom, bounce, or movement.

---

## Step 9 — Android Testing Checklist

Run:

```bash
npx expo run:android
```

Then test:

```bash
npm run lint
npx tsc --noEmit
npm run check:local-interactions
```

Manual Android checks:

- cold launch shows lavender background immediately
- logo is centered
- no white flash before or after splash
- overlay fades smoothly
- onboarding still appears for first-time users
- signed-in users still go to the correct app screen
- local-only users still work
- app does not get stuck on the splash
- back button behavior is unchanged
- dark mode does not create a black flash
- reduce motion does not use scale animation

---

## Step 10 — iOS / Preview Build Notes

If testing on iOS later:

- verify the native splash separately
- verify the logo size does not look too large
- verify safe-area and status bar do not create visible color mismatch

For final confidence, test in a preview or production build. Development builds can behave slightly differently around splash timing.

---

## Step 11 — Files Expected to Change

Likely files:

```text
app.json or app.config.ts
assets/images/lullaby-logo-mark.png
src/components/boot/BrandSplashGate.tsx
src/theme/brandLaunch.ts
app/_layout.tsx or src/components/auth/AuthGate.tsx
```

Only add `src/theme/brandLaunch.ts` if shared constants are useful.

Do not modify unrelated files.

---

## Step 12 — Acceptance Criteria

The feature is complete when:

- app launch starts with a lavender background
- Lullaby logo appears centered
- the logo reveal is subtle and calm
- the overlay fades into the existing app flow
- there is no blank white flash
- onboarding/auth/baby setup behavior is unchanged
- reduce motion is respected
- Android build works
- TypeScript passes
- lint passes
- local interaction checks pass

---

## Non-Goals

Do not implement:

- loading spinner
- progress bar
- bouncing logo
- rotating logo
- long intro animation
- sound
- remote asset loading
- onboarding redesign
- tab navigation changes
- auth flow changes

---

## Recommended Commit Message

```text
feat: add branded launch splash
```

---

## Summary

This feature should make Lullaby feel more polished from the first second.

The user should open the app and immediately feel:

```text
calm
soft
night-friendly
premium
Lullaby-branded
```

The implementation should be small, isolated, and safe.
