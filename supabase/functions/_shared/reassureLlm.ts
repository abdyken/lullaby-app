/**
 * Shared LLM configuration + THE output guardrail for the Reassure edge
 * functions (spec §2 + §5, docs/plans/reassure-ai-layer-spec.md).
 *
 * IMPORT-FREE ON PURPOSE: the smoke runner (§X18/§X20 in
 * scripts/check-local-interactions.ts) require()s this file from Node, so it
 * must carry no Deno globals and no npm: imports — values and pure functions
 * only. Both edge functions import from here; neither may hard-code its own
 * model config or output validation.
 *
 * The guardrail is the "the model cannot smuggle medical content" gate:
 *   parse JSON → length cap → banned-vocabulary / new-medical-claim check.
 * Any failure means the caller falls back to the deterministic local copy
 * (recapReadText / the verbatim KB line) — the parent always sees a safe
 * result.
 */

/** §2 — the model decision is final: Haiku, via the REASSURE_MODEL env var. */
export const REASSURE_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
export const REASSURE_TEMPERATURE = 0.3;
export const LLM_TIMEOUT_MS = 8_000;
export const LLM_MAX_RETRIES = 0;

/** §2 — per-job hard caps, asserted by smoke §X20 so cost can't drift. */
export const NIGHT_READ_MAX_TOKENS = 200;
export const TOPIC_POLISH_MAX_TOKENS = 120;

/** Output length caps (chars) enforced by the guardrail before the client. */
export const NIGHT_READ_MAX_CHARS = 360; // two short, calm sentences
export const TOPIC_POLISH_MAX_CHARS = 300; // one rephrased KB line

/**
 * The X12 judgement vocabulary — the same register guard the smoke test
 * applies to the local recapReadText, extended per spec §3
 * ("no normal/typical/fine/healthy/concerning/etc.").
 *
 * ENGINEERING GUARD, not clinical copy: it bounds what the model may ADD.
 * Words already present in the clinician-owned source line are exempted via
 * `sourceText` (the KB lines legitimately say "normal"/"typical"); the model
 * introducing one that the source does not contain is a new medical claim
 * and is blocked. Over-blocking is the accepted failure direction — a block
 * just renders the deterministic local copy.
 */
export const JUDGEMENT_VOCAB = [
  'normal',
  'abnormal',
  'healthy',
  'unhealthy',
  'fine',
  'typical',
  'atypical',
  'okay',
  'ok',
  'concerning',
  'worrying',
  'worrisome',
  'alarming',
  'dangerous',
  'serious',
  'safe',
  'unsafe',
  'reassuring',
] as const;

export function judgementVocabRegex(): RegExp {
  return new RegExp(`\\b(${JUDGEMENT_VOCAB.join('|')})\\b`, 'gi');
}

export type GuardrailFailure = 'parse' | 'length' | 'vocab';

export type GuardrailResult =
  | { ok: true; value: string }
  | { ok: false; reason: GuardrailFailure };

/**
 * The single output validator both jobs use (§5):
 *   1. parse the model's raw text as JSON and read `key` — anything else
 *      (refusal text, prose, truncation, wrong shape) is a 'parse' failure;
 *   2. cap the length — runaway output is a 'length' failure;
 *   3. scan for judgement vocabulary the model INTRODUCED — words not found
 *      in `sourceText` (empty for the night read, whose numeric input
 *      contains none) are a 'vocab' failure.
 */
export function validateLlmOutput(
  rawText: string,
  key: string,
  opts: { maxChars: number; sourceText?: string },
): GuardrailResult {
  let value: unknown;
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    value = parsed?.[key];
  } catch {
    return { ok: false, reason: 'parse' };
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, reason: 'parse' };
  }
  if (value.length > opts.maxChars) {
    return { ok: false, reason: 'length' };
  }
  const banned = value.match(judgementVocabRegex());
  if (banned) {
    const source = (opts.sourceText ?? '').toLowerCase();
    const introduced = banned.some(
      (word) => !new RegExp(`\\b${word.toLowerCase()}\\b`).test(source),
    );
    if (introduced) return { ok: false, reason: 'vocab' };
  }
  return { ok: true, value };
}

/**
 * Classify a thrown SDK error into an audit outcome. Import-free (no SDK
 * class available here), so it matches on the error's name/message — the
 * Anthropic SDK's timeout error is APIConnectionTimeoutError ("timed out").
 */
export function classifyLlmError(error: unknown): 'timeout' | 'api_error' {
  const err = error as { name?: string; message?: string } | null;
  const text = `${err?.name ?? ''} ${err?.message ?? ''}`.toLowerCase();
  return text.includes('timeout') || text.includes('timed out') ? 'timeout' : 'api_error';
}
