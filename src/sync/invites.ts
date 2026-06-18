/**
 * Partner invite / join helpers.
 *
 * A caregiver linked to a baby mints a short, expiring code (createInvite); a
 * second signed-in caregiver redeems it (validateInvite / acceptInvite) to join
 * the SAME baby. Redeeming runs through SECURITY DEFINER RPCs so the joiner
 * needs no read access to the baby before accepting, and the link is created
 * exactly once (never duplicated). All helpers are defensive — they degrade to
 * a calm result rather than throwing, except acceptInvite/createInvite which
 * surface a mapped message so the UI can show a retry.
 */
import type { BabyInvite, CaregiverRole } from '@/data/models';
import { supabase } from '@/lib/supabase';

import { inviteFromRow, type BabyInviteRow } from './schema';

/** Unambiguous alphabet (no I/L/O/0/1) so a tired parent can read it aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const INVITE_TTL_DAYS = 7;
/** Postgres unique-violation SQLSTATE — a (rare) code collision to retry. */
const UNIQUE_VIOLATION = '23505';

/** Canonicalize a typed/pasted code: uppercase, strip spaces/dashes. */
export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Pretty, readable form: ABCD-EFGH. */
export function formatInviteCode(code: string): string {
  const c = normalizeInviteCode(code);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Mint a new invite for a baby with a role hint. RLS allows this only for a
 * caregiver linked to the baby. Retries a handful of times on the (astronomically
 * rare) code collision. Returns null only when Supabase isn't configured.
 */
export async function createInvite(
  babyId: string,
  roleHint: CaregiverRole,
): Promise<BabyInvite | null> {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('Please sign in first.');

  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateInviteCode();
    const { data, error } = await supabase
      .from('baby_invites')
      .insert({
        baby_id: babyId,
        created_by: uid,
        code,
        role_hint: roleHint,
        expires_at: expiresAt,
      })
      .select('*')
      .single();
    if (!error && data) return inviteFromRow(data as BabyInviteRow);
    if (error && error.code !== UNIQUE_VIOLATION) throw error;
  }
  throw new Error('Could not create an invite code. Please try again.');
}

/** Open (unexpired, unaccepted) invites for a baby, newest first. */
export async function getActiveInvites(babyId: string): Promise<BabyInvite[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('baby_invites')
      .select('*')
      .eq('baby_id', babyId)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return (data as BabyInviteRow[]).map(inviteFromRow);
  } catch {
    return [];
  }
}

/** Why an invite can't be used (calm-copy keys). */
export type InviteReason = 'invalid' | 'expired' | 'accepted' | 'unauthenticated' | 'error';

export type InviteValidation = { valid: boolean; reason?: InviteReason; roleHint?: CaregiverRole };

/**
 * Check a code without exposing any baby data (definer RPC). Returns validity +
 * the role hint so the join form can pre-select a role.
 */
export async function validateInvite(code: string): Promise<InviteValidation> {
  if (!supabase) return { valid: false, reason: 'error' };
  try {
    const { data, error } = await supabase.rpc('validate_invite', {
      p_code: normalizeInviteCode(code),
    });
    if (error || !data) return { valid: false, reason: 'error' };
    const r = data as { ok: boolean; reason?: InviteReason; role_hint?: CaregiverRole };
    return r.ok
      ? { valid: true, roleHint: r.role_hint }
      : { valid: false, reason: r.reason ?? 'invalid' };
  } catch {
    return { valid: false, reason: 'error' };
  }
}

export type AcceptInviteInput = {
  caregiverId: string;
  code: string;
  displayName: string;
  role: CaregiverRole;
  colorHex: string;
};

/** Calm, honest copy for a failed redeem. */
export function inviteReasonMessage(reason?: InviteReason | string): string {
  switch (reason) {
    case 'expired':
      return 'This invite has expired. Ask your caregiver for a new code.';
    case 'accepted':
      return 'This invite has already been used. Ask for a fresh code.';
    case 'invalid':
      return "That code doesn't match an invite. Check it and try again.";
    case 'unauthenticated':
      return 'Please sign in first, then enter your invite code.';
    default:
      return 'Could not join with that code. Please try again.';
  }
}

/**
 * Redeem a code to join its baby. Upserts the joiner's profile first (so the
 * link FK + caregiver chips have data), then calls the definer RPC, which links
 * the caregiver idempotently and consumes the invite. Returns the joined baby id.
 */
export async function acceptInvite(input: AcceptInviteInput): Promise<{ babyId: string }> {
  if (!supabase) throw new Error('Supabase is not configured');

  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      id: input.caregiverId,
      display_name: input.displayName,
      color_hex: input.colorHex,
      role: input.role,
    },
    { onConflict: 'id' },
  );
  if (profileError) throw profileError;

  const { data, error } = await supabase.rpc('accept_invite', {
    p_code: normalizeInviteCode(input.code),
    p_role: input.role,
  });
  if (error) throw error;
  const r = data as { ok: boolean; reason?: InviteReason; baby_id?: string };
  if (!r?.ok || !r.baby_id) throw new Error(inviteReasonMessage(r?.reason));
  return { babyId: r.baby_id };
}
