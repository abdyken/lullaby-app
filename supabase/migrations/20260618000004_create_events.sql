-- Lullaby · events (the shared night log)
--
-- One row per logged moment: feed | sleep | diaper | pump | note. Maps to the
-- `LogEvent` model. This is the table two caregivers must eventually see the
-- same live view of, so RLS gates every operation on baby_caregivers membership.
--
-- `id` is text (not uuid) so locally-created ids and remote ids share one column
-- without a type mismatch; it defaults to a uuid for purely-remote inserts.
-- `meta` is JSONB (the LogEventMeta object: side / kind / amountMl / etc).

create table if not exists public.events (
  id           text primary key default gen_random_uuid()::text,
  baby_id      uuid not null references public.babies (id) on delete cascade,
  caregiver_id uuid not null references public.profiles (id) on delete set null,
  type         text not null check (type in ('feed', 'sleep', 'diaper', 'pump', 'note')),
  start_at     timestamptz not null,
  end_at       timestamptz,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- Reads are "this baby's night, newest first" — index the access path.
create index if not exists events_baby_created_idx
  on public.events (baby_id, created_at desc);

alter table public.events enable row level security;

-- Read/write events only for babies you are linked to. Inserts/updates must
-- additionally be stamped with your own caregiver id.
create policy "events_select_member"
  on public.events for select
  using (public.is_baby_caregiver(baby_id));

create policy "events_insert_member"
  on public.events for insert
  with check (
    public.is_baby_caregiver(baby_id)
    and caregiver_id = auth.uid()
  );

create policy "events_update_member"
  on public.events for update
  using (public.is_baby_caregiver(baby_id))
  with check (public.is_baby_caregiver(baby_id));

create policy "events_delete_member"
  on public.events for delete
  using (public.is_baby_caregiver(baby_id));
