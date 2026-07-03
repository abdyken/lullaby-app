/**
 * Pure view logic for the Reassure AI night read — the mapping from the
 * edge-function response and the resolved outcome to what the UI shows.
 *
 * PURE LEAF: no react, no react-native, no network, no storage. The device I/O
 * and the React state live in application/nightRead.ts; keeping the mapping here
 * means the smoke runner can pin the exact display contract that bit us once —
 * a slow-but-successful read MUST show as the AI read, and ONLY a resolved
 * no-read shows the calm "unavailable" note (a mere client timeout must not).
 */

/**
 * Coarse, honest status for the UI — never a technical error, never a leak of a
 * blocked-vs-timeout distinction:
 *   - 'idle'        — the client is not attempting an AI read (not Pro/eligible,
 *                     no consent, empty night). Show the local read, nothing else.
 *   - 'loading'     — eligible + consented, the attempt is in flight OR the
 *                     client hit its wait-cap before the function answered
 *                     ('pending', unknown). Still just the local read; no spinner.
 *   - 'ai'          — an AI read is showing; label it clearly as AI-phrased.
 *   - 'unavailable' — the function RESOLVED with no AI read (fallback / guardrail
 *                     / disabled / error); show a calm "not available" note.
 */
export type NightReadStatus = 'idle' | 'loading' | 'ai' | 'unavailable';

/** The edge function's JSON body: `{ read, source }`. A server cache hit and a
 *  fresh model answer both return `source: 'llm'` with a non-empty `read`. */
export type NightReadResponseBody = { read?: string | null; source?: string } | null | undefined;

/**
 * What the client should do with a RESOLVED edge-function response body. A
 * non-empty `read` (fresh 'llm' answer OR a server-cache hit) → show it; a null
 * read / missing body / fallback → the local read. This is the resolved case
 * only — a client wait-cap timeout is 'pending' and never reaches here.
 */
export function classifyNightReadResponse(
  body: NightReadResponseBody,
): { kind: 'read'; text: string } | { kind: 'fallback' } {
  if (body && typeof body.read === 'string' && body.read.trim().length > 0) {
    return { kind: 'read', text: body.read };
  }
  return { kind: 'fallback' };
}

/**
 * The read + status to render for the current night/baby.
 *   resolved === null      → not resolved yet for this key, or not eligible.
 *   resolved.text = string → an AI read is ready ('ai').
 *   resolved.text = null   → attempted and got no AI read ('unavailable').
 */
export function nightReadView(
  eligible: boolean,
  resolved: { text: string | null } | null,
): { read: string | null; status: NightReadStatus } {
  if (!eligible) return { read: null, status: 'idle' };
  if (resolved === null) return { read: null, status: 'loading' };
  if (resolved.text !== null) return { read: resolved.text, status: 'ai' };
  return { read: null, status: 'unavailable' };
}
