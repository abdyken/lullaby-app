/**
 * Local data models for Lullaby (P0).
 *
 * Shapes follow §7 of MOBILE_APP_BLUEPRINT.md and are intentionally designed
 * for multi-caregiver from day one, so the eventual Supabase layer can sit
 * behind the same interface without a UI rewrite. For this foundation stage
 * the data is in-memory only (see ./mock).
 */

export type CaregiverRole = 'mom' | 'dad' | 'other';

/** type: feed | sleep are intervals (startAt + endAt); diaper and note are instant. */
export type LogEventType = 'feed' | 'sleep' | 'diaper' | 'pump' | 'note';

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

/** A short, expiring code that lets a second caregiver join an existing baby. */
export interface BabyInvite {
  id: string;
  babyId: string;
  /** caregiver id who created the invite */
  createdBy: string;
  /** canonical (uppercase, alphanumeric) invite code */
  code: string;
  /** the role the inviter expects the joiner to take (a hint, not enforced) */
  roleHint: CaregiverRole;
  createdAt: string;
  expiresAt: string;
  /** ISO timestamp the invite was redeemed, or null if still open */
  acceptedAt: string | null;
  /** caregiver id who redeemed the invite, or null */
  acceptedBy: string | null;
}

/** Per-type extra detail. feed: side/duration/amount; diaper: kind; pump: amount; note: label/note. */
export interface LogEventMeta {
  side?: 'L' | 'R';
  kind?: 'wet' | 'dirty' | 'both';
  amountMl?: number;
  /** nursing duration in minutes (optional, from the feed detail flow) */
  durationMin?: number;
  /** preset note chip, e.g. "Fussy" | "Cried" | "Settled" */
  label?: string;
  /** free-text note */
  note?: string;
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
