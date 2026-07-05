/**
 * reassure-topic-polish — the Phase-3 edge function (built + tested; client
 * wiring intentionally deferred until the consent copy AND the clinician
 * sign-off of the system prompt land — manifest items #10/#13 in
 * docs/plans/reassure-content-review.md. Do NOT call this from the app until both
 * gates clear; smoke §X22 enforces the dark state).
 *
 * Rephrases ONE clinician-owned topic line in the parent's own words. The
 * safety order is absolute and lives in CODE:
 *   1. verify the JWT                                   → 401
 *   2. re-run the SHARED red-flag scan on the parent's raw text FIRST —
 *      a match returns { kind: 'triage' } and the model is NEVER called
 *   3. unknown topic → { kind: 'oos' } — the model is NEVER called
 *   4. only then: Claude rephrases the KB entry, grounded in nothing else
 *      (bounded per _shared/reassureLlm.ts: Haiku default, temp 0.3,
 *      max_tokens cap, 8s timeout, 0 retries, structured output)
 *   5. shared output guardrail: parse → length cap → new-medical-claim
 *      check (judgement vocabulary the KB line itself does not contain)
 *   6. audit via the shared writer — with the parent's raw text MINIMIZED
 *      (§6): only a short preview + length persist, never the full text
 *
 * Every failure returns the KB entry's original line VERBATIM — the client
 * always has a complete curated answer without this function.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import {
  KB,
  matchesRedFlag,
  normalizeAsk,
  TOPIC_POLISH_SYSTEM_PROMPT,
  type ReassureTopicKey,
} from '../_shared/reassureContent.ts';
import {
  classifyLlmError,
  LLM_MAX_RETRIES,
  LLM_TIMEOUT_MS,
  REASSURE_DEFAULT_MODEL,
  REASSURE_TEMPERATURE,
  TOPIC_POLISH_MAX_CHARS,
  TOPIC_POLISH_MAX_TOKENS,
  validateLlmOutput,
} from '../_shared/reassureLlm.ts';
import {
  insertReassureAudit,
  minimizeParentTextForAudit,
  usageOf,
  type ReassureAuditOutcome,
} from '../_shared/reassureAudit.ts';

const MAX_PARENT_TEXT_CHARS = 280;

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

  // 1. JWT.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json(401, { error: 'unauthorized' });

  let body: { topicKey?: string; parentText?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid body' });
  }
  const topicKey = (body.topicKey ?? '') as ReassureTopicKey;
  const parentText = (body.parentText ?? '').slice(0, MAX_PARENT_TEXT_CHARS);

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  // §6 — the audit request carries only a minimized preview of the parent's
  // words, never the full raw text.
  const auditRequest = {
    topicKey,
    parentText: minimizeParentTextForAudit(parentText),
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
      kind: 'topic-polish',
      outcome,
      request: auditRequest,
      response: response ?? {},
      model,
      stop_reason: stopReason,
      latency_ms: Date.now() - startedAt,
      usage,
    });

  // 2. TRIAGE FIRST — the shared red-flag scan on the parent's raw words.
  //    A match short-circuits before any model call, always.
  if (matchesRedFlag(normalizeAsk(parentText))) {
    await audit('triage', null, { shortCircuit: 'redflag' });
    return json(200, { kind: 'triage' });
  }

  // 3. Bounded scope — unknown topics never reach the model either.
  const topic = KB[topicKey];
  if (!topic) {
    await audit('oos', null, { shortCircuit: 'unknown-topic' });
    return json(200, { kind: 'oos' });
  }

  // 4. The grounded rephrase. Fallback is always the curated line itself,
  //    VERBATIM — refusal, parse failure, guardrail block, timeout, and API
  //    errors all leave `line` untouched.
  let line = topic.line;
  let source: 'llm' | 'fallback' = 'fallback';
  let outcome: ReassureAuditOutcome = 'api_error';
  let stopReason: string | null = null;
  let llmResponse: unknown = null;
  let usage: Record<string, unknown> = {};
  if (anthropicKey) {
    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey, maxRetries: LLM_MAX_RETRIES });
      const response = await anthropic.messages.create(
        {
          model,
          max_tokens: TOPIC_POLISH_MAX_TOKENS,
          temperature: REASSURE_TEMPERATURE,
          // Stable prefix marked cacheable (§2); dormant below Haiku's
          // minimum cacheable prefix until the reviewed prompt grows.
          system: [
            {
              type: 'text',
              text: TOPIC_POLISH_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [
            {
              role: 'user',
              content: JSON.stringify({
                topic: { title: topic.title, line: topic.line },
                parentWords: parentText,
              }),
            },
          ],
          output_config: {
            format: {
              type: 'json_schema',
              schema: {
                type: 'object',
                properties: { line: { type: 'string' } },
                required: ['line'],
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
        // 5. The shared output guardrail. The KB line is the source text:
        //    judgement vocabulary it already contains ("normal", "typical")
        //    is allowed; anything the model INTRODUCES is a new medical
        //    claim and discards the rephrase. Length stays bounded to the
        //    original line (never more than 3×, never past the hard cap).
        const verdict = validateLlmOutput(block?.text ?? '', 'line', {
          maxChars: Math.min(TOPIC_POLISH_MAX_CHARS, topic.line.length * 3),
          sourceText: topic.line,
        });
        if (verdict.ok) {
          line = verdict.value;
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

  // 6. Audit before returning.
  await audit(outcome, stopReason, llmResponse, usage);

  return json(200, { kind: 'topic', topicKey, line, source });
});
