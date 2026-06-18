/**
 * Repository resolution — picks the backend that owns the night state.
 *
 * The decision is conservative and fail-safe: the app uses the local
 * AsyncStorage repository UNLESS every condition for real sync is met —
 * Supabase configured, a live session, and a baby the caregiver is linked to.
 * Any missing piece (or any error) falls back to local-only, so the demo always
 * works and a half-configured backend never breaks the night.
 *
 * Onboarding (creating/choosing a baby, inviting a partner) is the next task;
 * here we simply adopt the FIRST baby the caregiver is already linked to.
 */
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

import { localRepository } from './localRepository';
import { getLinkedBabyId } from './provisioning';
import { getSupabaseSession } from './session';
import { createSupabaseRepository } from './supabaseRepository';
import type { EventRepository } from './types';

/**
 * Resolve the active EventRepository. Returns the local repository whenever real
 * sync isn't fully available; otherwise a Supabase repository scoped to the
 * caregiver's first linked baby.
 */
export async function resolveRepository(): Promise<EventRepository> {
  if (!isSupabaseConfigured || !supabase) return localRepository;

  const session = await getSupabaseSession();
  if (!session) return localRepository;

  const babyId = await getLinkedBabyId(session.user.id);
  if (!babyId) return localRepository;

  return createSupabaseRepository(supabase, {
    babyId,
    caregiverId: session.user.id,
  });
}
