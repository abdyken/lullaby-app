-- analytics_events — lightweight product analytics for the TestFlight retention
-- test (activation funnel + nightly retention + monetization-interest signals).
-- Insert-only from the app; query funnels/retention from the dashboard or a
-- service-role job. No client SELECT (keeps one caregiver from reading another's
-- raw event stream). Rows are best-effort and non-authoritative.

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  -- Who fired it. user_id is the auth user; baby_id/caregiver_id give product scope.
  user_id uuid references auth.users (id) on delete set null,
  baby_id uuid references public.babies (id) on delete set null,
  caregiver_id uuid,
  event text not null,
  props jsonb not null default '{}'::jsonb,
  platform text,
  created_at timestamptz not null default now()
);

alter table public.analytics_events enable row level security;

-- Authenticated users may insert only their OWN events (auth.uid() = user_id) and
-- only for a baby they belong to (public.is_baby_caregiver), mirroring the events
-- table's membership model so analytics can't be forged for another family. A null
-- baby_id (pre-link events such as account-less milestones) is allowed. No select/
-- update/delete policies → clients write but never read back (analyzed via service role).
drop policy if exists analytics_insert_own on public.analytics_events;
create policy analytics_insert_own on public.analytics_events
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (baby_id is null or public.is_baby_caregiver(baby_id))
  );

create index if not exists analytics_event_created_idx
  on public.analytics_events (event, created_at);

create index if not exists analytics_baby_created_idx
  on public.analytics_events (baby_id, created_at);
