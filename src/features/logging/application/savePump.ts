/**
 * Logging v2 — save a finished pump with its (optional) volume (plan Phase 7.3).
 *
 * Takes the finished pump (the `pumpVolumeDraft`'s underlying active event) and
 * completes it: it writes the per-side volumes and flips `status = 'completed'`.
 * The volumes are validated by `validatePumpVolumes` — a recorded volume is
 * positive, "no volume" is `null` (not 0), and a single-side pump cannot carry
 * the other side's volume (plan §7.3).
 *
 * "Save without volume" is the same use-case with both volumes `null`: it stores
 * a valid duration-only record (the only way zero volume is allowed, plan §7.3).
 * The TOTAL is never stored — it is derived by `pumpTotalVolumeMl` in a selector
 * (plan §7.3 "Calculate Total; do not store it as an independent field").
 */
import { validatePumpVolumes } from '../domain/rules';
import type { PumpEvent } from '../domain/types';
import type { LoggingUseCaseDeps, UseCaseResult } from './types';

export interface SavePumpInput {
  /** The finished pump being completed (from `pumpVolumeDraft` / `activePump`). */
  event: PumpEvent;
  /** Recorded left volume in ml, or null for "not recorded". */
  leftVolumeMl: number | null;
  /** Recorded right volume in ml, or null for "not recorded". */
  rightVolumeMl: number | null;
}

export async function savePump(
  deps: LoggingUseCaseDeps,
  input: SavePumpInput,
): Promise<UseCaseResult<PumpEvent>> {
  const { repo } = deps;
  const { event } = input;

  const details = {
    side: event.details.side,
    leftVolumeMl: input.leftVolumeMl,
    rightVolumeMl: input.rightVolumeMl,
  };
  const check = validatePumpVolumes(details);
  if (!check.ok) return check;

  const next: PumpEvent = { ...event, status: 'completed', details };
  await repo.updateEvent(next);
  await repo.enqueueSync(next.id);
  return { ok: true, event: next };
}
