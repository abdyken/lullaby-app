/**
 * Logging v2 — save a note/spit-up side-log.
 *
 * Notes are instant events. `noteType` is the stable semantic bit used by
 * Reassure; labels remain UI copy and legacy compatibility only.
 */
import type { ISODateTime, NoteEvent, NoteType } from '../domain/types';
import { newCareEventBase, type LoggingUseCaseDeps, type UseCaseResult } from './types';

export interface SaveNoteInput {
  noteType?: NoteType;
  label?: string;
  note?: string;
  clientEventId?: string;
  occurredAt?: ISODateTime;
}

export async function saveNote(
  deps: LoggingUseCaseDeps,
  input: SaveNoteInput = {},
): Promise<UseCaseResult<NoteEvent>> {
  const { repo, clock, actor } = deps;
  const occurredAt = input.occurredAt ?? clock.nowIso();
  const base = newCareEventBase(actor, clock, {
    clientEventId: input.clientEventId,
    occurredAt,
    startedAt: null,
    endedAt: null,
    status: 'completed',
  });
  const label = input.label?.trim();
  const note = input.note?.trim();
  const event: NoteEvent = {
    ...base,
    type: 'note',
    childId: actor.childId,
    status: 'completed',
    details: {
      noteType: input.noteType ?? 'general',
      ...(label ? { label } : {}),
      ...(note ? { note } : {}),
    },
  };

  await repo.createEvent(event);
  await repo.enqueueSync(event.id);
  return { ok: true, event };
}
