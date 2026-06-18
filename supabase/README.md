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
3. **Enable the Email auth provider** (Auth → Providers → Email). For the
   smoothest first run, **turn off "Confirm email"** (Auth → Providers → Email →
   Confirm email = off) so sign-up returns a session immediately. If you leave
   confirmation on, the app shows a calm "check your email, then sign in" note
   and the user signs in after confirming.
4. Copy `.env.example` → `.env` and set:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
5. Restart the Expo dev server (env vars are inlined at build time).

## First-run flow (configured builds)

With both env vars set the app builds a Supabase client on launch and the
`AuthProvider` resolves one of these states (see `src/state/AuthProvider.tsx`):

1. **Signed-out** → a calm email + password **sign-in / sign-up** surface
   (`AuthScreen`). Email+password is used deliberately — no deep-link/OAuth
   plumbing needed for this slice.
2. **Needs setup** → signed in but no baby linked → the one-time **baby setup**
   (`BabySetupScreen`): your name + role (sets the brand color), baby name, and
   age in weeks (converted to a birth date). "Start tonight" provisions, in one
   idempotent step (`src/sync/provisioning.ts`):
   - a `profiles` row (upserted by `id = auth.uid()`),
   - a `babies` row (`created_by = auth.uid()`),
   - a `baby_caregivers` link.
3. **Ready** → session + linked baby → the normal tab app mounts and the
   **Supabase repository** owns the night log. Tap the baby header for a minimal
   account sheet (sign out / switch account).

**Idempotency:** reopening the app never duplicates rows — the profile is
upserted, and the baby + link are only created when the caregiver isn't already
linked to one (a second setup run resumes the existing baby). The `babies`
SELECT policy includes `created_by = auth.uid()` so a freshly-inserted baby is
readable before its link row exists.

Until a caregiver is signed in **and** linked to a baby, the app uses the local
flow — see `src/sync/resolveRepository.ts`.

## Notes for the realtime slice (next)

- **`subscribe` is the seam.** `EventRepository.subscribe?()` is still unset; the
  Supabase repo (`src/sync/supabaseRepository.ts`) will add a `events` realtime
  channel filtered by `baby_id` and call back with a fresh `TonightState`. No
  caller changes — `LocalEventProvider` already tolerates an optional subscribe.
- **Writes are whole-night upserts** today; narrow to per-event writes when
  realtime lands to avoid echoing a partner's rows back over the channel.
- **The Tonight header/handoff still render the seeded `baby`/`caregivers`
  labels** (from `src/data/mock.ts`) even in Supabase mode — loading the real
  baby + co-caregivers into the UI (so chips show real names/colors) is part of
  the realtime/invite slice. Event *sync* already uses the real `baby_id` and
  `caregiver_id`.
- **Partner invite** (a second `baby_caregivers` row for another account) is not
  built yet; the link table + RLS already support it.
