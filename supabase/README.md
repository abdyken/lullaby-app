# Supabase (optional caregiver sync)

Lullaby ships as a complete **local demo** — it runs with no backend at all. This
folder is the foundation for the eventual real caregiver-handoff sync. Nothing
here is required to run or demo the app.

## What's here

`migrations/` — ordered SQL for the four tables that mirror the app's models:

| Migration | Table | Model |
| --- | --- | --- |
| `..._create_profiles.sql` | `profiles` | `Caregiver` (one per signed-in user) |
| `..._create_babies.sql` | `babies` | `Baby` |
| `..._create_baby_caregivers.sql` | `baby_caregivers` | `BabyCaregiver` (the link table) |
| `..._create_events.sql` | `events` | `LogEvent` (the shared night log) |

**Row Level Security** is enabled on every table. A caregiver can only read or
write a baby — and that baby's events — when a `baby_caregivers` row links them.
The `is_baby_caregiver()` SECURITY DEFINER helper backs those policies (and
avoids recursive RLS on the link table itself).

## Enabling it

1. Create a Supabase project.
2. Apply the migrations (in filename order), e.g. with the Supabase CLI:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
3. Copy `.env.example` → `.env` and set:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
4. Restart the Expo dev server (env vars are inlined at build time).

With both vars set the app builds a Supabase client on launch. Until a caregiver
is signed in **and** linked to a baby, the app still uses the local flow — see
`src/sync/resolveRepository.ts`. Sign-in/onboarding and realtime are the next
slices; the `EventRepository` boundary (`src/sync/`) is shaped to absorb them
without UI changes.
