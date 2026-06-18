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

## Realtime sync (live shared night)

Once `ready`, the app shows the **real baby name + caregivers** (header, handoff
chips, attribution) and the night log is **live**:

- **Writes are per-event** (`src/sync/supabaseRepository.ts` `applyChanges`): a
  tap upserts one row (idempotent by `id`), Undo deletes one row. No whole-night
  upsert, so a deletion is never resurrected.
- **A realtime channel** (`events:<baby_id>`, filtered to this baby) re-reads the
  night on any INSERT/UPDATE/DELETE and hands a fresh state to the UI. The
  `LocalEventProvider` adopts the shared events but keeps the local `orbView`,
  and an echo guard stops a device's own write from looping back out.
- **A quiet status line** on the handoff card shows `Syncing…` / `Synced just
  now` / `Offline · saved on this device`.

### Migrations this needs

`..._realtime_and_shared_profiles.sql` (apply it like the others):
- `profiles_select_shared` policy + `shares_any_baby()` helper, so caregivers can
  read each other's name/color (the "own profile" policy is untouched).
- `alter table public.events replica identity full` so DELETE/UPDATE realtime
  payloads carry `baby_id` for the channel filter.
- adds `public.events` to the `supabase_realtime` publication (idempotent).

Also confirm **Realtime is enabled** for the project (Database → Replication /
Realtime) — Supabase projects have it on by default.

### Testing two-device sync (before invite UI exists)

There is no partner-invite screen yet, so link the second caregiver one of two
ways:

**Option A — same account, two devices (simplest):**
1. Sign in with the same email + password on two devices/simulators.
2. Both resolve to the same linked baby.
3. Log a Feed/Diaper/Note/Sleep on one → it appears on the other within a second,
   no restart. Undo on one → it disappears on the other.

**Option B — two accounts sharing one baby (true handoff):**
1. Device 1: sign up, complete setup → creates baby `B` and links caregiver `A`.
2. Device 2: sign up as caregiver `C` and complete setup (creates a throwaway
   baby). Note `C`'s `id` from the `profiles` table.
3. In the Supabase SQL editor, link `C` to baby `B`:
   ```sql
   insert into public.baby_caregivers (baby_id, caregiver_id, role)
   values ('<baby B id>', '<caregiver C id>', 'dad');
   ```
4. Restart device 2's app. It now resolves baby `B`; both devices see the same
   live night and each other's caregiver chips. (The throwaway baby from step 2
   is harmless — `resolveRepository` picks the first linked baby.)

## Known limitations (before partner invite)

- **No invite UI** — a second caregiver is linked manually (above). The link
  table + RLS already support it.
- **Full re-read on change** (not payload reconciliation) — simple and correct at
  newborn-night volume; revisit only if event volume grows.
- **`orbView` is local** — if a partner ends a sleep while your orb is showing the
  sleep view, your orb keeps its view until your next interaction (the timeline /
  status cards reflect the shared truth immediately).
- **Supabase mode is not offline-persistent** — unsynced changes live in memory
  until reconnect; they are not cached to AsyncStorage (local-only mode still is).
