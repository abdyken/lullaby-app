/**
 * Local data models for Lullaby (P0).
 *
 * Shapes follow §7 of MOBILE_APP_BLUEPRINT.md and are intentionally designed
 * for multi-caregiver from day one, so the eventual Supabase layer can sit
 * behind the same interface without a UI rewrite. For this foundation stage
 * the data is in-memory only (see ./mock).
 */

export type CaregiverRole = 'mom' | 'dad' | 'other';

/** type: feed | sleep are intervals (startAt + endAt); diaper is instant. */
export type LogEventType = 'feed' | 'sleep' | 'diaper' | 'pump';

export interface Baby {
  id: string;
  name: string;
  /** ISO date string (birth date) */
  birthDate: string;
  avatarKey: string;
  /** caregiver id who created the baby */
  createdBy: string;
}

export interface Caregiver {
  id: string;
  displayName: string;
  /** brand caregiver color, e.g. mom #FF9E5E / dad #5560C6 */
  colorHex: string;
  role: CaregiverRole;
}

/** Join table — enables partner sync later without reshaping events. */
export interface BabyCaregiver {
  babyId: string;
  caregiverId: string;
  role: CaregiverRole;
}

/** Per-type extra detail. feed: side; diaper: kind; pump: amount. */
export interface LogEventMeta {
  side?: 'L' | 'R';
  kind?: 'wet' | 'dirty' | 'both';
  amountMl?: number;
}

export interface LogEvent {
  id: string;
  babyId: string;
  caregiverId: string;
  type: LogEventType;
  /** ISO timestamp the event began */
  startAt: string;
  /** ISO timestamp the event ended; null for instant events (diaper) or while running */
  endAt: string | null;
  meta: LogEventMeta;
  /** ISO timestamp the row was created */
  createdAt: string;
}
