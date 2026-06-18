/**
 * Data-access layer — the mapping between the app's TypeScript models and the
 * Supabase row shapes.
 *
 * The existing models in '@/data/models' are the SOURCE OF TRUTH. Postgres
 * columns are snake_case; the app is camelCase. These row types + converters are
 * the single place that bridges the two, so the rest of the sync layer (and the
 * UI) only ever sees the existing model shapes. Nothing here imports Supabase or
 * React Native — it is pure data, runnable under plain Node.
 *
 * Tables mirror the local model set one-for-one:
 *   babies          ↔ Baby
 *   profiles        ↔ Caregiver   (a profile row is one signed-in caregiver)
 *   baby_caregivers ↔ BabyCaregiver
 *   events          ↔ LogEvent
 */
import type {
  Baby,
  BabyCaregiver,
  Caregiver,
  CaregiverRole,
  LogEvent,
  LogEventMeta,
  LogEventType,
} from '@/data/models';

/** `public.babies` row. `birth_date` is a DATE; the rest are plain columns. */
export interface BabyRow {
  id: string;
  name: string;
  birth_date: string;
  avatar_key: string;
  created_by: string;
}

/**
 * `public.profiles` row — one per signed-in caregiver (id = auth.users.id). This
 * is the "caregivers or profiles" table from the migration spec; we name it
 * `profiles` so it joins cleanly to Supabase auth.
 */
export interface ProfileRow {
  id: string;
  display_name: string;
  color_hex: string;
  role: CaregiverRole;
}

/** `public.baby_caregivers` join row — links a caregiver to a baby. */
export interface BabyCaregiverRow {
  baby_id: string;
  caregiver_id: string;
  role: CaregiverRole;
}

/**
 * `public.events` row. `meta` is JSONB (the LogEventMeta object verbatim);
 * `start_at`/`end_at`/`created_at` are timestamptz ISO strings.
 */
export interface EventRow {
  id: string;
  baby_id: string;
  caregiver_id: string;
  type: LogEventType;
  start_at: string;
  end_at: string | null;
  meta: LogEventMeta;
  created_at: string;
}

/* ----------------------------- row → model ----------------------------- */

export function babyFromRow(row: BabyRow): Baby {
  return {
    id: row.id,
    name: row.name,
    birthDate: row.birth_date,
    avatarKey: row.avatar_key,
    createdBy: row.created_by,
  };
}

export function caregiverFromRow(row: ProfileRow): Caregiver {
  return {
    id: row.id,
    displayName: row.display_name,
    colorHex: row.color_hex,
    role: row.role,
  };
}

export function babyCaregiverFromRow(row: BabyCaregiverRow): BabyCaregiver {
  return { babyId: row.baby_id, caregiverId: row.caregiver_id, role: row.role };
}

export function eventFromRow(row: EventRow): LogEvent {
  return {
    id: row.id,
    babyId: row.baby_id,
    caregiverId: row.caregiver_id,
    type: row.type,
    startAt: row.start_at,
    endAt: row.end_at,
    // meta is stored as JSONB; default to {} so a null column never breaks the UI.
    meta: row.meta ?? {},
    createdAt: row.created_at,
  };
}

/* ----------------------------- model → row ----------------------------- */

export function babyToRow(baby: Baby): BabyRow {
  return {
    id: baby.id,
    name: baby.name,
    birth_date: baby.birthDate,
    avatar_key: baby.avatarKey,
    created_by: baby.createdBy,
  };
}

export function caregiverToRow(caregiver: Caregiver): ProfileRow {
  return {
    id: caregiver.id,
    display_name: caregiver.displayName,
    color_hex: caregiver.colorHex,
    role: caregiver.role,
  };
}

export function babyCaregiverToRow(link: BabyCaregiver): BabyCaregiverRow {
  return { baby_id: link.babyId, caregiver_id: link.caregiverId, role: link.role };
}

export function eventToRow(event: LogEvent): EventRow {
  return {
    id: event.id,
    baby_id: event.babyId,
    caregiver_id: event.caregiverId,
    type: event.type,
    start_at: event.startAt,
    end_at: event.endAt,
    meta: event.meta,
    created_at: event.createdAt,
  };
}
