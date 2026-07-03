-- Lullaby · delete_account — self-service account deletion (Apple 5.1.1(v))
--
-- One definer RPC the signed-in caregiver calls to permanently delete their
-- own account. Strictly self-scoped: the only row it can ever remove from
-- auth.users is auth.uid()'s own, so a caregiver can never delete anyone else.
--
-- Deletion order matters:
--   1. events they authored are deleted explicitly first. events.caregiver_id
--      is NOT NULL with ON DELETE SET NULL, so for an invited caregiver who
--      logged on a partner's baby the profile cascade alone would abort with a
--      not-null violation. Events on babies they created die with the baby
--      cascade anyway, so this only really affects shared-baby events — and
--      "my logs leave with me" is the privacy-correct reading of deletion.
--   2. reassure_audit rows are unlinked (user_id -> null): the safety audit
--      trail survives, the personal identifier does not.
--   3. the auth.users row goes last; ON DELETE CASCADE walks
--      profiles -> babies (created_by) -> baby_caregivers / events /
--      baby_invites / reassure_night_reads. analytics_events.user_id and
--      baby_invites.accepted_by detach via SET NULL.
--
-- Consequence the UI must state plainly: a baby CREATED by this caregiver is
-- deleted for every linked caregiver, shared history included.

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'delete_account requires an authenticated caller';
  end if;

  delete from public.events where caregiver_id = v_uid;
  update public.reassure_audit set user_id = null where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

-- Signed-in self-service only — never anonymous, never PUBLIC.
revoke all on function public.delete_account() from public;
revoke all on function public.delete_account() from anon;
grant execute on function public.delete_account() to authenticated;
