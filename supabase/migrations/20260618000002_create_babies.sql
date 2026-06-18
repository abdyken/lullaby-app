-- Lullaby · babies
--
-- One row per baby being tracked. Maps to the `Baby` model. `created_by` is the
-- caregiver (profile) who first added the baby; partners are linked through
-- baby_caregivers (next migration), which is what RLS keys off.
--
-- Membership-based read/update/delete policies live in the baby_caregivers
-- migration, because they depend on that table + the is_baby_caregiver() helper.

create table if not exists public.babies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  birth_date date not null,
  avatar_key text not null default 'default',
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.babies enable row level security;

-- The creating caregiver is the only one who can insert a baby as themselves.
create policy "babies_insert_own"
  on public.babies for insert
  with check (created_by = auth.uid());
