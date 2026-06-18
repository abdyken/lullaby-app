/**
 * Sync layer barrel — the single import surface for the state layer.
 *
 * The UI talks to the state layer; the state layer talks to this. Neither ever
 * imports a concrete backend (Supabase) directly — they get an EventRepository
 * and a SyncStatus from here.
 */
export type {
  EventRepository,
  SyncMode,
  SyncStatus,
  SyncStatusKind,
} from './types';
export { LOCAL_ONLY_STATUS } from './types';
export { localRepository } from './localRepository';
export { resolveRepository } from './resolveRepository';
export { getSupabaseSession, onSupabaseAuthChange } from './session';
export {
  ensureCaregiverSetup,
  getCaregiverProfile,
  getLinkedBabyId,
  type CaregiverSetupInput,
} from './provisioning';
