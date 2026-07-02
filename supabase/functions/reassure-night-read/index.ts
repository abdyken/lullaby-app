/**
 * reassure-night-read — the Phase-2 edge function.
 *
 * Turns the night's CODE-COMPUTED tallies into a calm two-sentence read.
 * The order of operations IS the safety property:
 *   1. verify the JWT                                    → 401
 *   2. authorize via baby_caregivers (RLS-scoped)        → 403
 *   3. cache hit (reassure_night_reads PK = rate limit)  → return
 *   4. read events UNDER RLS, compute tallies in code
 *   5. triage-first by construction: the prompt contains ONLY numeric tallies
 *      + a coarse age band — no note text, no parent text. Every string that
 *      could ever reach the prompt is still scanned against REDFLAGS.
 *   6. Claude call (bounded per _shared/reassureLlm.ts: Haiku default,
 *      temp 0.3, max_tokens cap, 8s timeout, 0 retries, structured output)
 *   7. shared output guardrail: parse → length cap → judgement-vocab check;
 *      any failure discards the answer
 *   8. full request/response audit via the shared writer (service role only)
 *   9. cache + return
 *
 * Every failure returns { read: null, source: 'fallback' } — the client
 * already rendered the local descriptive read and silently keeps it.
 *
 * Secrets (Supabase function env): ANTHROPIC_API_KEY, optional REASSURE_MODEL.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.65.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { matchesRedFlag, normalizeAsk, NIGHT_READ_SYSTEM_PROMPT } from '../_shared/reassureContent.ts';
import {
  classifyLlmError,
  LLM_MAX_RETRIES,
  LLM_TIMEOUT_MS,
  NIGHT_READ_MAX_CHARS,
  NIGHT_READ_MAX_TOKENS,
  REASSURE_DEFAULT_MODEL,
  REASSURE_TEMPERATURE,
  validateLlmOutput,
} from '../_shared/reassureLlm.ts';
import {
  insertReassureAudit,
  usageOf,
  type ReassureAuditOutcome,
} from '../_shared/reassureAudit.ts';
import {
  ageBandFromBirthDate,
  buildPromptFacts,
  computeTallies,
  windowFor,
  type EventRow,
} from './nightReadCore.ts';

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

  // 1. Verify the JWT — a user-scoped client so every later read is under RLS.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json(401, { error: 'unauthorized' });

  let body: { babyId?: string; nightKey?: string; tzOffsetMinutes?: number };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid body' });
  }
  const babyId = body.babyId ?? '';
  const nightKey = body.nightKey ?? '';
  const tzOffsetMinutes = Number.isFinite(body.tzOffsetMinutes) ? Number(body.tzOffsetMinutes) : 0;
  if (!/^[0-9a-f-]{36}$/i.test(babyId) || !/^\d{4}-\d{2}-\d{2}$/.test(nightKey)) {
    return json(400, { error: 'invalid babyId or nightKey' });
  }

  // 2. Authorize: the caller must be a caregiver of this baby (RLS-scoped read).
  const { data: membership } = await userClient
    .from('baby_caregivers')
    .select('baby_id')
    .eq('baby_id', babyId)
    .limit(1);
  if (!membership || membership.length === 0) return json(403, { error: 'forbidden' });

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 3. Cache: the (baby_id, night_key) PK is also the once-per-night rate limit.
  const { data: cached } = await serviceClient
    .from('reassure_night_reads')
    .select('read, tallies')
    .eq('baby_id', babyId)
    .eq('night_key', nightKey)
    .maybeSingle();
  if (cached?.read) {
    return json(200, { read: cached.read, source: 'llm', nightKey, tallies: cached.tallies });
  }

  // 4. Events under RLS (user-scoped client) + tallies computed IN CODE.
  const { startMs, endMs } = windowFor(nightKey, tzOffsetMinutes, Date.now());
  const { data: rows } = await userClient
    .from('events')
    .select('type, start_at, end_at, meta')
    .eq('baby_id', babyId)
    .gte('start_at', new Date(startMs - 12 * 3_600_000).toISOString())
    .lte('start_at', new Date(endMs).toISOString());
  const tallies = computeTallies((rows ?? []) as EventRow[], startMs, endMs);

  const { data: babyRow } = await userClient
    .from('babies')
    .select('birth_date')
    .eq('id', babyId)
    .maybeSingle();
  const ageBand = ageBandFromBirthDate(babyRow?.birth_date ?? null, Date.now());

  const auditRequest = { nightKey, tzOffsetMinutes, tallies, ageBand, model } as Record<
    string,
    unknown
  >;

  // 5. Triage-first by construction: only these code-built strings may reach
  //    the prompt. Scan them anyway — the guard survives future edits.
  const promptFacts = buildPromptFacts(tallies, ageBand);
  auditRequest.promptFacts = promptFacts;
  if (matchesRedFlag(normalizeAsk(promptFacts))) {
    // A red flag inside pure tallies means something is structurally wrong —
    // never call the model on it, but leave the incident in the audit log.
    await insertReassureAudit(serviceClient, {
      user_id: user.id,
      baby_id: babyId,
      kind: 'night-read',
      outcome: 'redflag_input',
      request: auditRequest,
      response: {},
      model,
      stop_reason: null,
      latency_ms: Date.now() - startedAt,
      usage: {},
    });
    return json(200, { read: null, source: 'fallback', nightKey, tallies });
  }

  // 6. The bounded Claude call.
  let read: string | null = null;
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
          max_tokens: NIGHT_READ_MAX_TOKENS,
          temperature: REASSURE_TEMPERATURE,
          // Stable prefix marked cacheable (§2). Today the placeholder prompt
          // is below Haiku's minimum cacheable prefix, so this is a dormant
          // no-op that starts paying once the reviewed prompt grows.
          system: [
            {
              type: 'text',
              text: NIGHT_READ_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: promptFacts }],
          output_config: {
            format: {
              type: 'json_schema',
              schema: {
                type: 'object',
                properties: { read: { type: 'string' } },
                required: ['read'],
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
        // 7. The shared output guardrail — parse → length → judgement vocab.
        //    The night read's input is numeric, so there is no source text to
        //    exempt: ANY judgement vocabulary is an introduced medical claim.
        const verdict = validateLlmOutput(block?.text ?? '', 'read', {
          maxChars: NIGHT_READ_MAX_CHARS,
        });
        if (verdict.ok) {
          read = verdict.value;
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

  // 8. Audit — full request/response via the shared writer, before returning.
  await insertReassureAudit(serviceClient, {
    user_id: user.id,
    baby_id: babyId,
    kind: 'night-read',
    outcome,
    request: auditRequest,
    response: llmResponse ?? {},
    model,
    stop_reason: stopReason,
    latency_ms: Date.now() - startedAt,
    usage,
  });

  if (read == null) {
    return json(200, { read: null, source: 'fallback', nightKey, tallies });
  }

  // 9. Cache for every caregiver of this baby, then return.
  await serviceClient
    .from('reassure_night_reads')
    .upsert({ baby_id: babyId, night_key: nightKey, read, model, tallies });

  return json(200, { read, source: 'llm', nightKey, tallies });
});
