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
| `..._realtime_and_shared_profiles.sql` | — | realtime + cross-caregiver profile reads |
| `..._create_baby_invites.sql` | `baby_invites` | `BabyInvite` (partner invite / join) |

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
- **Undo is caregiver-scoped in shared mode.** Undo removes only the signed-in
  caregiver's own most recent event (`undoLastOwnEvent`), never a partner's — so
  if your partner logs something newer over realtime, your Undo still takes back
  *your* last entry, not theirs. (Local-only mode keeps removing the newest event
  overall — correct on a single-caregiver device.)
- **A realtime channel** (`events:<baby_id>`, filtered to this baby) re-reads the
  night on any INSERT/UPDATE/DELETE and hands a fresh state to the UI. The
  `LocalEventProvider` adopts the shared events but keeps the local `orbView`,
  and an echo guard stops a device's own write from looping back out.
- **A quiet status line** on the handoff card shows `Syncing…` / `Synced just
  now` / `Offline · will retry` (calm + honest — an unsynced change is held in
  memory and re-pushed on the next change/reconnect, not durably saved to disk).

### Migrations this needs

`..._realtime_and_shared_profiles.sql` (apply it like the others):
- `profiles_select_shared` policy + `shares_any_baby()` helper, so caregivers can
  read each other's name/color (the "own profile" policy is untouched).
- `alter table public.events replica identity full` so DELETE/UPDATE realtime
  payloads carry `baby_id` for the channel filter.
- adds `public.events` to the `supabase_realtime` publication (idempotent).

Also confirm **Realtime is enabled** for the project (Database → Replication /
Realtime) — Supabase projects have it on by default.

## Partner invite / join (no SQL needed)

A second caregiver joins from the app — no manual `baby_caregivers` insert.

- **Create an invite** (caregiver already set up): tap the baby header → **Invite
  caregiver** → pick the partner's role → **Create invite code** → **Share code**
  (or read the code aloud). Codes are short, single-use, and **expire in 7 days**.
- **Join with a code** (signed-in caregiver, no baby yet): on the setup screen,
  switch to **Join with code**, enter your name + role + the code → **Join baby**.

### Migration this needs

`..._create_baby_invites.sql` (apply with the others):
- `baby_invites` table + RLS (only a baby's caregivers can create/read/revoke its
  invites).
- `validate_invite(code)` / `accept_invite(code, role)` **SECURITY DEFINER** RPCs
  — the joiner needs no read access to the baby before accepting, and the link is
  created idempotently (`on conflict do nothing`) and the code consumed.
- **Tightens** `baby_caregivers` insert: a direct self-link is now allowed only
  for a baby you created; all other joins go through `accept_invite`. (This closes
  the prior "self-link to any baby_id" gap.)

Nothing is exposed about the baby before acceptance — `validate_invite` returns
only validity + the role hint. Expired / already-used / unknown codes return calm
copy ("This invite has expired…", "…already been used", "That code doesn't
match…").

### Two-phone demo script (end to end)

The full path, from a clean project to a live two-caregiver night. A = phone 1,
B = phone 2 (different email).

1. **Apply migrations** — `supabase link --project-ref <ref> && supabase db push`
   (in filename order). Enable the **Email** auth provider; for the smoothest
   demo turn **Confirm email = off**. Confirm **Realtime** is on (default).
2. **Set env** — copy `.env.example` → `.env`, fill `EXPO_PUBLIC_SUPABASE_URL`
   and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, then restart the dev server (env is
   inlined at build time).
3. **A signs up** — open the app on phone A → email + password → **sign up**.
4. **A sets up the baby** — **New baby** → A's name + role, baby name (e.g. Mia),
   age in weeks → **Start tonight**. A lands in the app (a soft success haptic
   fires).
5. **A invites B** — tap the baby header → **Invite caregiver** → pick B's role
   → **Create invite code** (success haptic) → **Share code** / read it aloud.
6. **B signs up** — on phone B, sign up with a *different* email (confirm it if
   confirmation is on).
7. **B joins with the code** — on setup, **Join with code** → B's name + role +
   the code → **Join baby** (success haptic). B lands on the same baby; both
   phones now show the baby name and both caregiver chips.
8. **Log an event on A** — tap Feed (pick a side) → Save. A feels a light save
   haptic; the orb + timeline update.
9. **Verify B sees the realtime update** — within ~1s the event appears on B,
   attributed to A, and B's handoff card leads with a factual catch-up line
   (e.g. "Mom logged 1 feed. Sleep is running."). The status line reads
   `Synced just now`.
10. **B marks caught up** — tap **Mark caught up** (success haptic) → the card
    becomes "Nothing new since you last checked." The cursor is **device-local**,
    so A is unaffected.
11. **Undo behavior (A vs B):**
    - On **A**, the save toast's **Undo** removes **A's own** most recent
      event — even if B logged something newer in between. A partner's newer
      event is never deleted by your Undo.
    - On **B**, Undo likewise only takes back **B's own** most recent event.
    - Each Undo replicates to the other phone within ~1s (one row deleted).
12. **Re-use guard** — entering the same (now-used) code again shows
    "…already been used."

> Shortcut: signing into the **same account** on two devices also shares the baby
> (no invite needed) and is the quickest realtime smoke test.

## Known limitations (after handoff summary)

- **One baby per caregiver** — `resolveRepository` / setup use the first linked
  baby; multi-baby switching isn't built.
- **No invite management list** — the sheet reuses the most recent open code and
  can mint a fresh one, but there's no revoke/list UI (revoke is possible via the
  `baby_invites` delete policy / SQL).
- **No copy-to-clipboard** — the code is shown for reading aloud and shareable via
  the OS share sheet (no clipboard dependency added this slice).
- **Full re-read on change** (not payload reconciliation) — simple and correct at
  newborn-night volume.
- **`orbView` is local** — if a partner ends a sleep while your orb shows the
  sleep view, your orb keeps its view until your next interaction (timeline /
  status reflect the shared truth immediately).
- **Handoff cursor is device-local** — marking caught up on one phone does not
  mark another phone caught up, because "have I seen this?" is personal reading
  state rather than shared baby data.
- **Supabase mode is not offline-persistent** — unsynced changes live in memory
  until reconnect (local-only mode still caches to AsyncStorage). The status line
  says `Offline · will retry` (not "saved"), and the change re-pushes on the next
  edit / reconnect; closing the app while offline drops the in-memory change.
- **Haptics are best-effort** — a light tap on save, a soft tap on Undo, a
  success buzz on Mark caught up / invite created / join. They are silent (never
  an error) on web, simulators, in Low Power Mode, or where the Taptic engine is
  unavailable.
