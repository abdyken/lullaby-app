-- Lullaby · realtime + shared-profile reads (slice 3)
--
-- Two things the live-handoff slice needs:
--  1. Caregivers must see each OTHER's name/color (for handoff labels + chips),
--     not just their own profile. We add a SELECT policy for profiles you share
--     a baby with — without weakening the "own profile" policy.
--  2. The events table must broadcast changes over realtime, and DELETE/UPDATE
--     payloads must carry baby_id so the client filter matches.

-- Shared-baby membership for the *other* caregiver. SECURITY DEFINER so it can
-- read baby_caregivers without tripping that table's own RLS (no recursion).
create or replace function public.shares_any_baby(p_other uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.baby_caregivers mine
    join public.baby_caregivers theirs on theirs.baby_id = mine.baby_id
    where mine.caregiver_id = auth.uid()
      and theirs.caregiver_id = p_other
  );
$$;

-- Additive: a second permissive SELECT policy (OR'd with profiles_select_own),
-- so you can read the profile of anyone you co-care a baby with.
drop policy if exists "profiles_select_shared" on public.profiles;
create policy "profiles_select_shared"
  on public.profiles for select
  using (public.shares_any_baby(id));

-- DELETE/UPDATE realtime payloads include the full old row (so baby_id is
-- present for the client-side channel filter), not just the primary key.
alter table public.events replica identity full;

-- Broadcast events over the default Supabase realtime publication (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;
