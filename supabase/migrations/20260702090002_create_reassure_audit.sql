-- Lullaby · reassure_audit (safety-review log for every LLM interaction)
--
-- One row per Reassure backend call: the full request, the full model
-- response, the model id, stop reason, and latency — everything a clinician
-- (or an incident review) needs to reconstruct exactly what the model was
-- asked and what it said.
--
-- SERVICE-ROLE ONLY: RLS is enabled with NO client policies at all. The app
-- can never read or write this table; only the edge functions (service role,
-- which bypasses RLS) insert, and reviews happen through the dashboard /
-- scheduled exports.

create table if not exists public.reassure_audit (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  baby_id     uuid,
  -- 'night-read' (Phase 2) | 'topic-polish' (Phase 3)
  kind        text not null check (kind in ('night-read', 'topic-polish')),
  request     jsonb not null default '{}'::jsonb,
  response    jsonb not null default '{}'::jsonb,
  model       text,
  stop_reason text,
  latency_ms  integer,
  created_at  timestamptz not null default now()
);

create index if not exists reassure_audit_kind_created_idx
  on public.reassure_audit (kind, created_at desc);

alter table public.reassure_audit enable row level security;
-- Deliberately: zero policies. Nothing a client JWT can do here.
