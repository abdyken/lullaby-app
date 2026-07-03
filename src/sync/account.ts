/**
 * Account deletion (Apple 5.1.1(v): in-app account deletion).
 *
 * One call: the self-scoped `delete_account` definer RPC
 * (supabase/migrations/20260703060000_delete_account.sql) removes the caller's
 * auth.users row and cascades their account data (profile, created babies +
 * shared history, authored events, invites). It can only ever delete the
 * calling user — the function reads auth.uid(), never a parameter.
 *
 * Throws on any failure (including the migration not being applied yet) so the
 * UI can stay honest: deletion either verifiably happened, or the caller shows
 * the manual "email us and we'll remove it" fallback — never a fake success.
 */
import { supabase } from '@/lib/supabase';

export async function deleteAccountRemote(): Promise<void> {
  if (!supabase) throw new Error('Account service is not available in this build.');
  const { error } = await supabase.rpc('delete_account');
  if (error) throw error;
}
