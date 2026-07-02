/**
 * Voice transcript helpers for Reassure.
 *
 * Speech recognition is probabilistic; Reassure routing is not. This pure
 * leaf cleans up common baby-care mishears, then scores recognition
 * alternatives by running the existing local route() over each candidate.
 * Triage candidates always win over topics.
 */

import { EXAMPLE_CHIPS, KB, TOPIC_ORDER } from '../content/kb';
import { REDFLAGS } from './redflags';
import { normalizeAsk, route } from './router';
import type { RouteResult } from './types';

export type VoiceTranscriptCandidate = {
  transcript: string;
  confidence?: number | null;
};

export type VoiceTranscriptSelection = {
  /** Normalized/corrected text sent into the existing local ask path. */
  transcript: string;
  rawTranscript: string;
  route: RouteResult;
  confidence: number;
};

export const REASSURE_VOICE_MAX_ALTERNATIVES = 5;

export const REASSURE_VOICE_REQUIRED_CONTEXTUAL_STRINGS = [
  'hiccups',
  'spit-up',
  'spit up',
  'grunting',
  'squirming',
  'crying',
  'fussy',
  'soothe',
  'screaming',
  'burp',
  'burping',
  'belch',
  'belching',
  'burping after feeds',
  'needs to burp',
  "won't settle",
  'hard to wake',
  'feels hot',
  'temperature',
  'trouble breathing',
  'green vomit',
  'feed',
  'bottle',
  'breastfeed',
  'diaper',
  'gas',
  'sleep',
  'awake',
] as const;

export const REASSURE_VOICE_CONTEXTUAL_STRINGS = Array.from(
  new Set([
    ...REASSURE_VOICE_REQUIRED_CONTEXTUAL_STRINGS,
    ...TOPIC_ORDER.flatMap((key) => [key, KB[key].title]),
    ...EXAMPLE_CHIPS.flatMap((chip) => [chip.label, chip.ask]),
    ...REDFLAGS,
  ]),
);

const VOICE_NORMALIZATION_REPLACEMENTS: [RegExp, string][] = [
  [/\bhick\s+ups\b/g, 'hiccups'],
  [/\bhic\s+ups?\b/g, 'hiccup'],
  [/\bspit\s+(out|app)\b/g, 'spit up'],
  [/\bhard\s+awake\b/g, 'hard to wake'],
  [/\bheart\s+awake\b/g, 'hard to wake'],
  [/\bwont\s+settle\b/g, "won't settle"],
  [/\bwon t\s+settle\b/g, "won't settle"],
  [/\bnot\s+waking\b/g, 'hard to wake'],
  // Gas/burping — collapse the "-ing" form so it reads consistently in the ask
  // text. Routing already matches on the "burp" substring; the specific
  // phrase rule must precede the bare one so it wins.
  [/\bburping\s+after\s+feeding\b/g, 'burp after feed'],
  [/\bburping\b/g, 'burp'],
];

export function normalizeVoiceTranscript(text: string): string {
  let normalized = normalizeAsk(text)
    .replace(/[“”"()[\]{}.,!?;:/\\|]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [pattern, replacement] of VOICE_NORMALIZATION_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/\s+/g, ' ').trim();
}

function usableConfidence(candidate: VoiceTranscriptCandidate): number {
  const confidence = candidate.confidence;
  return typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0
    ? confidence
    : 0;
}

function rankCandidates(candidates: VoiceTranscriptCandidate[]) {
  return candidates
    .map((candidate, index) => {
      const transcript = normalizeVoiceTranscript(candidate.transcript);
      if (transcript.length === 0) return null;
      return {
        transcript,
        rawTranscript: candidate.transcript,
        route: route(transcript),
        confidence: usableConfidence(candidate),
        index,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
}

function pickHighestConfidence<T extends { confidence: number; index: number }>(candidates: T[]): T | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.confidence - a.confidence || a.index - b.index)[0];
}

export function selectVoiceTranscriptCandidate(
  candidates: VoiceTranscriptCandidate[],
): VoiceTranscriptSelection | null {
  const ranked = rankCandidates(candidates);
  const triage = pickHighestConfidence(ranked.filter((candidate) => candidate.route.kind === 'triage'));
  const topic = pickHighestConfidence(ranked.filter((candidate) => candidate.route.kind === 'topic'));
  const fallback = pickHighestConfidence(ranked);
  const selected = triage ?? topic ?? fallback;

  if (selected === null) return null;
  return {
    transcript: selected.transcript,
    rawTranscript: selected.rawTranscript,
    route: selected.route,
    confidence: selected.confidence,
  };
}

function coerceCandidates(
  value: VoiceTranscriptCandidate[] | string | null | undefined,
): VoiceTranscriptCandidate[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [{ transcript: value }];
  return [];
}

export function resolveVoiceTranscript(
  finalCandidates: VoiceTranscriptCandidate[] | string | null | undefined,
  interimCandidates: VoiceTranscriptCandidate[] | string | null | undefined,
): VoiceTranscriptSelection | null {
  return (
    selectVoiceTranscriptCandidate(coerceCandidates(finalCandidates)) ??
    selectVoiceTranscriptCandidate(coerceCandidates(interimCandidates))
  );
}
