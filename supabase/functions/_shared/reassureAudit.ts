/**
 * THE audit writer for reassure_audit (spec §5) — the single helper both
 * edge functions call; neither may hand-roll its own insert. The table is
 * SERVICE-ROLE ONLY (zero client RLS policies) and rows expire after the
 * retention TTL (see the reassure_audit migration).
 *
 * IMPORT-FREE ON PURPOSE (structural client type instead of the supabase-js
 * import) so the smoke runner can require() it from Node.
 */

export type ReassureAuditOutcome =
  // the model produced a validated answer
  | 'llm'
  // code-side short-circuits — the model was NEVER called
  | 'triage'
  | 'oos'
  | 'redflag_input'
  | 'no_api_key'
  // model was called but the answer was discarded → deterministic fallback
  | 'guardrail_block'
  | 'refusal'
  | 'parse_fail'
  | 'timeout'
  | 'api_error';

export type ReassureAuditRow = {
  user_id: string;
  baby_id: string | null;
  kind: 'night-read' | 'topic-polish';
  outcome: ReassureAuditOutcome;
  request: Record<string, unknown>;
  response: unknown;
  model: string;
  stop_reason: string | null;
  latency_ms: number;
  usage: Record<string, unknown>;
};

type InsertCapableClient = {
  from(table: string): { insert(row: ReassureAuditRow): PromiseLike<unknown> };
};

/**
 * §6 — minimize raw parent text before it enters the audit log. The full
 * text never persists; reviewers get a short preview + the original length.
 */
export const AUDIT_PARENT_TEXT_MAX_CHARS = 80;

export function minimizeParentTextForAudit(text: string): {
  preview: string;
  length: number;
} {
  return { preview: text.slice(0, AUDIT_PARENT_TEXT_MAX_CHARS), length: text.length };
}

/** Extract the token-usage block from an Anthropic response (§8: log usage). */
export function usageOf(response: unknown): Record<string, unknown> {
  const usage = (response as { usage?: Record<string, unknown> } | null)?.usage;
  return usage && typeof usage === 'object' ? usage : {};
}

export async function insertReassureAudit(
  client: InsertCapableClient,
  row: ReassureAuditRow,
): Promise<void> {
  // Function logs carry outcome + token usage for cost tracking (§8) —
  // never the request/response bodies.
  console.log(
    `[reassure-audit] kind=${row.kind} outcome=${row.outcome} model=${row.model} ` +
      `latency_ms=${row.latency_ms} usage=${JSON.stringify(row.usage)}`,
  );
  await client.from('reassure_audit').insert(row);
}
