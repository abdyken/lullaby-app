-- Lullaby · reassure_night_reads (Phase 2 — the cached LLM night read)
--
-- One row per baby per night: the Claude-phrased two-sentence read over the
-- code-computed tallies. The primary key doubles as the rate limit — one
-- uncached model call per baby per night, ever.
--
-- Caregivers may SELECT their baby's rows; ONLY the edge function's service
-- role writes (no client insert/update/delete policies exist on purpose).

create table if not exists public.reassure_night_reads (
  baby_id    uuid not null references public.babies (id) on delete cascade,
  night_key  date not null,
  read       text not null,
  model      text not null,
  -- the code-computed tallies the read was grounded in (audit + client reuse)
  tallies    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (baby_id, night_key)
);

alter table public.reassure_night_reads enable row level security;

create policy "reassure_night_reads_select_member"
  on public.reassure_night_reads for select
  using (public.is_baby_caregiver(baby_id));

-- No insert/update/delete policies: writes happen exclusively through the
-- service-role client inside supabase/functions/reassure-night-read.
