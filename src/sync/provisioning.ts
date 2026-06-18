/**
 * First-run provisioning — turning a fresh Supabase session into the three rows
 * the night log needs: a caregiver profile, a baby, and the link between them.
 *
 * Every operation is IDEMPOTENT so reopening the app (or a retried setup) never
 * duplicates records:
 *  - the profile is upserted by id (id == auth.users.id)
 *  - a baby + link are only created when the caregiver has no linked baby yet
 *
 * This module owns the read-side helpers too (linked baby, profile) so both the
 * auth layer and repository resolution share one query path.
 */
import type { Caregiver, CaregiverRole } from '@/data/models';
import { supabase } from '@/lib/supabase';

import { caregiverFromRow, type ProfileRow } from './schema';

/** The first baby the caregiver is linked to via baby_caregivers, or null. */
export async function getLinkedBabyId(caregiverId: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('baby_caregivers')
      .select('baby_id')
      .eq('caregiver_id', caregiverId)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { baby_id: string }).baby_id;
  } catch {
    return null;
  }
}

/** The caregiver's own profile row as a Caregiver, or null if not created yet. */
export async function getCaregiverProfile(caregiverId: string): Promise<Caregiver | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', caregiverId)
      .maybeSingle();
    if (error || !data) return null;
    return caregiverFromRow(data as ProfileRow);
  } catch {
    return null;
  }
}

/** Everything the setup step collects, plus the session's caregiver id. */
export type CaregiverSetupInput = {
  caregiverId: string;
  displayName: string;
  role: CaregiverRole;
  colorHex: string;
  babyName: string;
  /** ISO date (YYYY-MM-DD) — derived from the age-in-weeks input. */
  birthDate: string;
};

/**
 * Ensure the caregiver has a profile + baby + link. Returns the active baby id.
 *
 * Idempotency: the profile is upserted; the baby + link are created only if the
 * caregiver isn't already linked to one (a second run resumes the existing baby
 * instead of making another). Throws on a hard failure so the UI can show a calm
 * retry — callers run this behind a busy state.
 */
export async function ensureCaregiverSetup(
  input: CaregiverSetupInput,
): Promise<{ babyId: string }> {
  if (!supabase) throw new Error('Supabase is not configured');

  // 1. Upsert the caregiver's own profile (id == auth uid → re-run is a no-op).
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

  // 2. Already linked to a baby? Resume it — never create a duplicate.
  const existing = await getLinkedBabyId(input.caregiverId);
  if (existing) return { babyId: existing };

  // 3. Create the baby. Readable back immediately via the creator SELECT policy.
  const { data: babyRow, error: babyError } = await supabase
    .from('babies')
    .insert({
      name: input.babyName,
      birth_date: input.birthDate,
      avatar_key: 'default',
      created_by: input.caregiverId,
    })
    .select('id')
    .single();
  if (babyError || !babyRow) throw babyError ?? new Error('Could not create baby');
  const babyId = (babyRow as { id: string }).id;

  // 4. Link the caregiver to the baby (this is what unlocks all RLS membership).
  const { error: linkError } = await supabase.from('baby_caregivers').insert({
    baby_id: babyId,
    caregiver_id: input.caregiverId,
    role: input.role,
  });
  if (linkError) throw linkError;

  return { babyId };
}
