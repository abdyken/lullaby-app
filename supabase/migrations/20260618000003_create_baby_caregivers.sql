-- Lullaby · baby_caregivers (the link table that powers handoff)
--
-- The join between caregivers (profiles) and babies. This is the heart of the
-- security model: a caregiver can only ever read/write a baby and its events if
-- a row here links them. Maps to the `BabyCaregiver` model.

create table if not exists public.baby_caregivers (
  baby_id      uuid not null references public.babies (id) on delete cascade,
  caregiver_id uuid not null references public.profiles (id) on delete cascade,
  role         text not null check (role in ('mom', 'dad', 'other')),
  created_at   timestamptz not null default now(),
  primary key (baby_id, caregiver_id)
);

alter table public.baby_caregivers enable row level security;

-- Membership check used by every baby/event policy. SECURITY DEFINER so it
-- bypasses RLS on baby_caregivers itself — this both performs well and avoids
-- the infinite recursion you get when a baby_caregivers policy queries
-- baby_caregivers under RLS.
create or replace function public.is_baby_caregiver(p_baby_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.baby_caregivers bc
    where bc.baby_id = p_baby_id
      and bc.caregiver_id = auth.uid()
  );
$$;

-- --- baby_caregivers policies ---------------------------------------------

-- See the links for any baby you belong to (so you can see your co-caregivers).
create policy "baby_caregivers_select_member"
  on public.baby_caregivers for select
  using (public.is_baby_caregiver(baby_id));

-- Link yourself, or — if you created the baby — link a partner.
create policy "baby_caregivers_insert"
  on public.baby_caregivers for insert
  with check (
    caregiver_id = auth.uid()
    or exists (
      select 1 from public.babies b
      where b.id = baby_id and b.created_by = auth.uid()
    )
  );

-- Remove your own link, or — if you created the baby — remove a partner's link.
create policy "baby_caregivers_delete"
  on public.baby_caregivers for delete
  using (
    caregiver_id = auth.uid()
    or exists (
      select 1 from public.babies b
      where b.id = baby_id and b.created_by = auth.uid()
    )
  );

-- --- babies membership policies (depend on the helper above) ---------------

-- The creator is included explicitly so a freshly-inserted baby is readable
-- (e.g. insert().select()) BEFORE its baby_caregivers link row exists — the
-- membership helper alone can't see it yet during first-run setup.
create policy "babies_select_member"
  on public.babies for select
  using (created_by = auth.uid() or public.is_baby_caregiver(id));

create policy "babies_update_member"
  on public.babies for update
  using (public.is_baby_caregiver(id))
  with check (public.is_baby_caregiver(id));

-- Only the creator can delete the baby outright.
create policy "babies_delete_creator"
  on public.babies for delete
  using (created_by = auth.uid());
