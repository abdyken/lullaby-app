/**
 * reassure-support — the emotional-support companion edge function.
 *
 * The safety order is ABSOLUTE and lives in CODE, on the raw parent text, BEFORE
 * any model call. The server has NO subscription/entitlement gate at all — the
 * client owns that, and only for the companion reply, never for the safety routes:
 *   1. verify the JWT                                    → 401
 *   2. gate 1 — infant RED-FLAG scan (matchesRedFlag)    → { kind:'triage' }, no model
 *   3. gate 2 — PARENT-CRISIS scan (matchesParentCrisis) → { kind:'crisis' }, no model
 *   4. gate 3 — isInfantMedical() classifier             → { kind:'medical' }, no model
 *   5. empty input                                       → { kind:'oos' }, no model
 *   6. server kill-switch REASSURE_SUPPORT_ENABLED !== '1' → fallback, no model
 *   7. ONLY THEN: Claude answers with SUPPORT_SYSTEM_PROMPT (bounded per
 *      _shared/reassureLlm.ts: Haiku default, temp 0.3, support caps, 8s, 0 retries)
 *   8. support output guardrail: parse → length cap → medical-claim/dosage/diagnosis
 *      leak check (validateSupportOutput — NOT the judgement-vocab ban)
 *   9. audit via the shared writer, with the parent's raw text MINIMIZED (§6)
 *
 * Every non-'support' return is a code-decided safety redirect the model never
 * saw. Every model failure (refusal, parse, guardrail, timeout, api error, kill-
 * switch off, no key) returns { kind:'support', reply:null } → the client renders
 * the deterministic local support line. The three safety routes are FREE and run
 * before the kill-switch, so a parent in crisis is never gated behind anything.
 *
 * Secrets (Supabase function env): ANTHROPIC_API_KEY, optional REASSURE_MODEL,
 * REASSURE_SUPPORT_ENABLED (must be exactly '1' to reach the model).
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import {
  isInfantMedical,
  matchesParentCrisis,
  matchesRedFlag,
  normalizeAsk,
  SUPPORT_SYSTEM_PROMPT,
} from '../_shared/reassureContent.ts';
import {
  classifyLlmError,
  LLM_MAX_RETRIES,
  LLM_TIMEOUT_MS,
  REASSURE_DEFAULT_MODEL,
  REASSURE_TEMPERATURE,
  SUPPORT_MAX_CHARS,
  SUPPORT_MAX_TOKENS,
  validateSupportOutput,
} from '../_shared/reassureLlm.ts';
import {
  insertReassureAudit,
  minimizeParentTextForAudit,
  usageOf,
  type ReassureAuditOutcome,
} from '../_shared/reassureAudit.ts';

const MAX_PARENT_TEXT_CHARS = 500;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  const model = Deno.env.get('REASSURE_MODEL') ?? REASSURE_DEFAULT_MODEL;
  // Server-side kill-switch: the model is called ONLY when this is exactly '1'.
  // The three safety gates below run REGARDLESS of this flag — a parent in crisis
  // gets the crisis route whether or not the companion is enabled.
  const supportEnabled = Deno.env.get('REASSURE_SUPPORT_ENABLED') === '1';

  // 1. Verify the JWT.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json(401, { error: 'unauthorized' });

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid body' });
  }
  const rawText = (body.text ?? '').slice(0, MAX_PARENT_TEXT_CHARS);
  const normalized = normalizeAsk(rawText);

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  // §6 — the audit request carries only a minimized preview of the parent's words.
  const auditRequest = {
    text: minimizeParentTextForAudit(rawText),
    model,
  };
  const audit = (
    outcome: ReassureAuditOutcome,
    stopReason: string | null,
    response: unknown,
    usage: Record<string, unknown> = {},
  ): Promise<void> =>
    insertReassureAudit(serviceClient, {
      user_id: user.id,
      baby_id: null,
      kind: 'support',
      outcome,
      request: auditRequest,
      response: response ?? {},
      model,
      stop_reason: stopReason,
      latency_ms: Date.now() - startedAt,
      usage,
    });

  // 2. GATE 1 — infant red-flag. Escalate; the model is NEVER called.
  if (matchesRedFlag(normalized)) {
    await audit('triage', null, { shortCircuit: 'redflag' });
    return json(200, { kind: 'triage' });
  }
  // 3. GATE 2 — parent crisis. Free crisis route; the model is NEVER called.
  if (matchesParentCrisis(normalized)) {
    await audit('crisis', null, { shortCircuit: 'parent_crisis' });
    return json(200, { kind: 'crisis' });
  }
  // 4. GATE 3 — infant-medical. Redirect to the pediatrician; NEVER the model.
  if (isInfantMedical(normalized)) {
    await audit('medical_gated', null, { shortCircuit: 'infant_medical' });
    return json(200, { kind: 'medical' });
  }
  // 5. Empty / whitespace input — a bounded decline; the model is NEVER called.
  if (normalized.length === 0) {
    await audit('oos', null, { shortCircuit: 'empty' });
    return json(200, { kind: 'oos' });
  }

  // 6. The bounded companion call — reached only when every gate above passed.
  let reply: string | null = null;
  let source: 'llm' | 'fallback' = 'fallback';
  let outcome: ReassureAuditOutcome = 'api_error';
  let stopReason: string | null = null;
  let llmResponse: unknown = null;
  let usage: Record<string, unknown> = {};
  if (!supportEnabled) {
    // Kill-switch off: do NOT construct the client, do NOT call Anthropic.
    llmResponse = { error: 'REASSURE_SUPPORT_ENABLED is not set to "1"' };
    outcome = 'disabled';
  } else if (anthropicKey) {
    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey, maxRetries: LLM_MAX_RETRIES });
      const response = await anthropic.messages.create(
        {
          model,
          max_tokens: SUPPORT_MAX_TOKENS,
          temperature: REASSURE_TEMPERATURE,
          system: [
            {
              type: 'text',
              text: SUPPORT_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: rawText }],
          output_config: {
            format: {
              type: 'json_schema',
              schema: {
                type: 'object',
                properties: { reply: { type: 'string' } },
                required: ['reply'],
                additionalProperties: false,
              },
            },
          },
        },
        { timeout: LLM_TIMEOUT_MS },
      );
      stopReason = response.stop_reason ?? null;
      llmResponse = response;
      usage = usageOf(response);
      if (response.stop_reason === 'refusal') {
        outcome = 'refusal';
      } else {
        const block = response.content.find((item: { type: string }) => item.type === 'text') as
          | { type: 'text'; text: string }
          | undefined;
        // 8. Support output guardrail — parse → length → medical-leak check.
        const verdict = validateSupportOutput(block?.text ?? '', 'reply', {
          maxChars: SUPPORT_MAX_CHARS,
        });
        if (verdict.ok) {
          reply = verdict.value;
          source = 'llm';
          outcome = 'llm';
        } else {
          outcome = verdict.reason === 'parse' ? 'parse_fail' : 'guardrail_block';
        }
      }
    } catch (error) {
      llmResponse = { error: String(error) };
      outcome = classifyLlmError(error);
    }
  } else {
    llmResponse = { error: 'ANTHROPIC_API_KEY not configured' };
    outcome = 'no_api_key';
  }

  // 9. Audit before returning.
  await audit(outcome, stopReason, llmResponse, usage);

  return json(200, { kind: 'support', reply, source });
});
