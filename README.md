# Lullaby

React Native / Expo app for the Lullaby newborn night-shift companion.

## Local development

Install dependencies:

```bash
npm install
```

Copy the public local defaults:

```bash
cp .env.example .env
```

The `EXPO_PUBLIC_` values in `.env.example` are not secrets. Leave the Supabase values blank for the local-only demo.

Build and install the Android development app:

```bash
npm run android
```

After the dev build is installed, start the local dev server:

```bash
npm run dev
```

When Metro or Expo cache acts weird:

```bash
npm run dev:clear
```

## Checks

```bash
npm run lint
npx tsc --noEmit
npm run check:local-interactions
```
