-- Lullaby · baby_invites (partner / caregiver invite + join)
--
-- A caregiver linked to a baby mints a short code; a second signed-in caregiver
-- redeems it to join the SAME baby — no manual SQL, no exposing baby data before
-- the code is accepted. Single-use, expiring codes.
--
-- Security model:
--  - Only members of a baby can create/read/delete its invites (RLS below).
--  - Redeeming is done via SECURITY DEFINER RPCs (validate_invite / accept_invite)
--    so the joiner needs NO read access to babies/invites first, and the link is
--    gated by holding a valid code — not by knowing a baby_id.
--  - The baby_caregivers self-insert hole is closed (see policy swap at the end):
--    you may only insert a link for a baby you created; all other links come from
--    accept_invite (definer), which is what actually authorizes a join.

create table if not exists public.baby_invites (
  id           uuid primary key default gen_random_uuid(),
  baby_id      uuid not null references public.babies (id) on delete cascade,
  created_by   uuid not null references public.profiles (id) on delete cascade,
  -- canonical code: uppercase, unambiguous alphabet, no separators
  code         text not null unique,
  role_hint    text not null check (role_hint in ('mom', 'dad', 'other')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid references public.profiles (id) on delete set null
);

create index if not exists baby_invites_baby_idx on public.baby_invites (baby_id);

alter table public.baby_invites enable row level security;

-- Only caregivers linked to the baby can see / create / revoke its invites.
create policy "baby_invites_select_member"
  on public.baby_invites for select
  using (public.is_baby_caregiver(baby_id));

create policy "baby_invites_insert_member"
  on public.baby_invites for insert
  with check (public.is_baby_caregiver(baby_id) and created_by = auth.uid());

create policy "baby_invites_delete_member"
  on public.baby_invites for delete
  using (public.is_baby_caregiver(baby_id));

-- --- redeem RPCs (SECURITY DEFINER) ----------------------------------------
-- The joiner is authenticated but NOT yet a member, so these run as definer.
-- Both normalize the code (uppercase, strip non-alphanumerics) and require a
-- signed-in caller.

-- Check a code without exposing any baby data — returns validity + role hint.
create or replace function public.validate_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.baby_invites;
  v_norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;
  select * into v_invite from public.baby_invites where code = v_norm;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if v_invite.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_invite.accepted_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'accepted');
  end if;
  return jsonb_build_object('ok', true, 'reason', null, 'role_hint', v_invite.role_hint);
end;
$$;

-- Redeem a code: link the caller to the baby (idempotent) and consume the
-- invite. p_role is the joiner's chosen role; falls back to the invite's hint.
create or replace function public.accept_invite(p_code text, p_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.baby_invites;
  v_norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_role text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  select * into v_invite from public.baby_invites where code = v_norm for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if v_invite.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  -- Already consumed: idempotent success only if the SAME user is already linked.
  if v_invite.accepted_at is not null then
    if v_invite.accepted_by = v_uid
       and exists (
         select 1 from public.baby_caregivers
         where baby_id = v_invite.baby_id and caregiver_id = v_uid
       ) then
      return jsonb_build_object('ok', true, 'baby_id', v_invite.baby_id,
                                'role_hint', v_invite.role_hint);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'accepted');
  end if;

  v_role := coalesce(nullif(p_role, ''), v_invite.role_hint, 'other');
  if v_role not in ('mom', 'dad', 'other') then
    v_role := 'other';
  end if;

  -- Link the caregiver (never duplicates the link).
  insert into public.baby_caregivers (baby_id, caregiver_id, role)
  values (v_invite.baby_id, v_uid, v_role)
  on conflict (baby_id, caregiver_id) do nothing;

  -- Consume the invite (single-use).
  update public.baby_invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_invite.id and accepted_at is null;

  return jsonb_build_object('ok', true, 'baby_id', v_invite.baby_id,
                            'role_hint', v_invite.role_hint);
end;
$$;

-- Only authenticated users may redeem (auth first, then invite).
revoke all on function public.validate_invite(text) from public;
revoke all on function public.accept_invite(text, text) from public;
grant execute on function public.validate_invite(text) to authenticated;
grant execute on function public.accept_invite(text, text) to authenticated;

-- --- tighten baby_caregivers insert ----------------------------------------
-- Previously a signed-in user could self-link to ANY baby_id. Now a direct
-- insert is only allowed for a baby you created (first-run setup); every other
-- link is authorized by accept_invite (definer), which requires a valid code.
drop policy if exists "baby_caregivers_insert" on public.baby_caregivers;
create policy "baby_caregivers_insert"
  on public.baby_caregivers for insert
  with check (
    exists (
      select 1 from public.babies b
      where b.id = baby_id and b.created_by = auth.uid()
    )
  );
