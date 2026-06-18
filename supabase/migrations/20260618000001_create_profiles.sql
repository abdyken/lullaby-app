-- Lullaby · caregiver profiles
--
-- One row per signed-in caregiver. id == auth.users.id, so a profile is the
-- public, app-facing identity (display name + brand color + role) for an
-- authenticated user. Maps to the `Caregiver` model.
--
-- Scope note: this is a NIGHT-SHIFT caregiver-handoff foundation. No daytime,
-- medical, or analytics columns — just who the caregiver is.

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  color_hex    text not null,
  role         text not null check (role in ('mom', 'dad', 'other')),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A caregiver can read and edit their OWN profile.
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
