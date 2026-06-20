/**
 * Completes a pump session — transitions status from 'active' to 'completed'.
 * Two variants: with volume or without.
 * Pure functions — no I/O.
 */
import type { PumpEvent, PumpVolumeDraft, ISODateTime } from '../domain/types';
import { validatePumpVolumes } from '../domain/types';

interface SavePumpVolumeParams {
  event: PumpEvent;
  draft: PumpVolumeDraft;
  savedAt: ISODateTime;
}

export function buildSavePumpEvent(params: SavePumpVolumeParams): PumpEvent {
  const { event, draft, savedAt } = params;
  const details = {
    side: event.details.side,
    leftVolumeMl: draft.leftVolumeMl > 0 ? draft.leftVolumeMl : null,
    rightVolumeMl: draft.rightVolumeMl > 0 ? draft.rightVolumeMl : null,
  };
  validatePumpVolumes(details);
  return {
    ...event,
    status: 'completed',
    updatedAt: savedAt,
    version: event.version + 1,
    details,
  };
}

export function buildSavePumpWithoutVolume(params: {
  event: PumpEvent;
  savedAt: ISODateTime;
}): PumpEvent {
  const { event, savedAt } = params;
  return {
    ...event,
    status: 'completed',
    updatedAt: savedAt,
    version: event.version + 1,
    details: {
      ...event.details,
      leftVolumeMl: null,
      rightVolumeMl: null,
    },
  };
}
