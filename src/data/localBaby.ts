/**
 * The active local baby — a pure factory + (de)serialization for the real,
 * onboarding-created local baby/caregiver (onboarding Phase 0b).
 *
 * Deliberately free of React and AsyncStorage so it stays runnable under plain
 * Node/tsx (the smoke test exercises it). The actual AsyncStorage I/O lives in
 * `@/state/AuthProvider` (the layer above the onboarding gate that owns this
 * store), which reads/writes it under `LOCAL_BABY_STORAGE_KEY`.
 *
 * Until onboarding actually creates a baby (Phase 1A), the seed demo baby (Mia /
 * Mom from `./mock`) remains the default fallback; this module only produces the
 * record onboarding will persist to replace it.
 */
import type { Baby, Caregiver, CaregiverRole } from './models';

/**
 * AsyncStorage key for the persisted local baby/caregiver. Versioned so a future
 * shape change can bump `/v2`. Separate from `lullaby/local-events/v1` (the night
 * loop) — identity and events persist independently.
 */
export const LOCAL_BABY_STORAGE_KEY = 'lullaby/local-baby/v1';

/**
 * There is only ever one local baby/caregiver, so their ids are fixed constants.
 * That keeps `createLocalBaby` pure (no random/uuid) and gives logged events a
 * stable owner across restarts. Distinct from the seed ids (`baby-mia`/`cg-mom`)
 * so a real local night never collides with the demo seed.
 */
export const LOCAL_BABY_ID = 'local-baby';
export const LOCAL_CAREGIVER_ID = 'local-caregiver';

/** Used when onboarding is skipped / the name is left blank (honest, not cute). */
export const DEFAULT_LOCAL_BABY_NAME = 'Your baby';
export const DEFAULT_LOCAL_CAREGIVER_NAME = 'Mom';

/** Generic age for the skip / "Set up later" path (newborn → today's date). */
export const DEFAULT_LOCAL_BABY_AGE_WEEKS = 0;

/**
 * Role → brand color. Mirrors the theme tokens (`colors.mom`/`colors.dad`/
 * `colors.diaper`) and the seed caregivers in `./mock`; kept inline so this stays
 * a dependency-free pure leaf. Only used as a fallback — the live setup flow
 * passes the role color explicitly via `colorHex` (Phase 1A's RolePicker).
 */
const ROLE_COLOR: Record<CaregiverRole, string> = {
  mom: '#FF9E5E',
  dad: '#5560C6',
  other: '#23B79E',
};

function colorForRole(role: CaregiverRole): string {
  return ROLE_COLOR[role] ?? ROLE_COLOR.mom;
}

/** Trimmed non-empty string, or null (so blank inputs fall back to a default). */
function nonBlank(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Convert a whole-week age into an ISO birth date (YYYY-MM-DD). Mirrors the
 * private helper in `BabySetupScreen` (extracted/shared in Phase 1A) but takes an
 * explicit `now` so it is deterministic under the smoke test. Non-finite or
 * negative weeks clamp to 0 (a newborn born "today").
 */
export function birthDateFromWeeks(weeks: number, now: number = Date.now()): string {
  const safeWeeks = Number.isFinite(weeks) && weeks > 0 ? Math.floor(weeks) : 0;
  const ms = now - safeWeeks * 7 * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Parse a whole-week age from free text (the age field). Returns a clamped whole
 * number of weeks, or null for blank / non-numeric / out-of-range input so the
 * caller can keep the submit button disabled. Single source for the setup screen
 * and the onboarding flow (extracted from `BabySetupScreen` in Phase 1A).
 */
export function parseWeeks(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 260) return null;
  return Math.floor(n);
}

/**
 * Inverse of `birthDateFromWeeks`: recover a whole-week age from an ISO birth date
 * (YYYY-MM-DD) so a persisted onboarding draft can prefill the "Age in weeks"
 * field of BabySetupScreen. Returns null for blank/invalid input; clamps a future
 * date to 0. Deterministic given `now`.
 */
export function weeksFromBirthDate(
  birthDate: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (typeof birthDate !== 'string' || birthDate.trim() === '') return null;
  const parsed = Date.parse(birthDate);
  if (!Number.isFinite(parsed)) return null;
  const weeks = Math.round((now - parsed) / (7 * 24 * 60 * 60 * 1000));
  return Number.isFinite(weeks) && weeks > 0 ? weeks : 0;
}

/** Inputs onboarding collects (all optional → a valid baby is always producible). */
export type CreateLocalBabyInput = {
  /** Baby's name; blank/omitted → `DEFAULT_LOCAL_BABY_NAME`. */
  babyName?: string | null;
  /** ISO birth date (YYYY-MM-DD), from the age control via `birthDateFromWeeks`. */
  birthDate?: string | null;
  /** Primary caregiver display name; blank/omitted → `DEFAULT_LOCAL_CAREGIVER_NAME`. */
  caregiverName?: string | null;
  /** Primary caregiver role; omitted → 'mom' (role step is deferred in v1). */
  role?: CaregiverRole;
  /** Explicit caregiver color; omitted → the role's brand color. */
  colorHex?: string | null;
};

/** The local identity onboarding persists: one baby + its first caregiver. */
export type LocalBabyRecord = {
  baby: Baby;
  caregiver: Caregiver;
};

/**
 * Build the local baby/caregiver from onboarding inputs. Pure and deterministic
 * for a given `(input, now)` — no persistence, no side effects; the caller
 * (`AuthProvider`) owns writing it to AsyncStorage. Every field has a calm
 * fallback so the skip / "Set up later" path still yields a fully valid baby.
 */
export function createLocalBaby(
  input: CreateLocalBabyInput = {},
  now: number = Date.now(),
): LocalBabyRecord {
  const role: CaregiverRole = input.role ?? 'mom';
  const caregiver: Caregiver = {
    id: LOCAL_CAREGIVER_ID,
    displayName: nonBlank(input.caregiverName) ?? DEFAULT_LOCAL_CAREGIVER_NAME,
    colorHex: nonBlank(input.colorHex) ?? colorForRole(role),
    role,
  };
  const baby: Baby = {
    id: LOCAL_BABY_ID,
    name: nonBlank(input.babyName) ?? DEFAULT_LOCAL_BABY_NAME,
    birthDate: nonBlank(input.birthDate) ?? birthDateFromWeeks(DEFAULT_LOCAL_BABY_AGE_WEEKS, now),
    avatarKey: 'default',
    createdBy: LOCAL_CAREGIVER_ID,
  };
  return { baby, caregiver };
}

/** Serialize the record for persistence (baby + caregiver only). */
export function serializeLocalBaby(record: LocalBabyRecord): string {
  return JSON.stringify({ baby: record.baby, caregiver: record.caregiver });
}

const CAREGIVER_ROLES: readonly CaregiverRole[] = ['mom', 'dad', 'other'];

function isBaby(value: unknown): value is Baby {
  if (typeof value !== 'object' || value === null) return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.id === 'string' &&
    typeof b.name === 'string' &&
    typeof b.birthDate === 'string' &&
    typeof b.avatarKey === 'string' &&
    typeof b.createdBy === 'string'
  );
}

function isCaregiver(value: unknown): value is Caregiver {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.displayName === 'string' &&
    typeof c.colorHex === 'string' &&
    typeof c.role === 'string' &&
    (CAREGIVER_ROLES as readonly string[]).includes(c.role)
  );
}

/**
 * Parse + validate a stored string into a `LocalBabyRecord`. Returns null for
 * anything we don't fully trust (not JSON, not an object, missing/invalid baby or
 * caregiver) so the caller can fall back to the seed without crashing.
 */
export function parseLocalBaby(raw: string | null | undefined): LocalBabyRecord | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  if (!isBaby(obj.baby) || !isCaregiver(obj.caregiver)) return null;
  return { baby: obj.baby, caregiver: obj.caregiver };
}
