/**
 * reassure-topic-polish — the Phase-3 edge function (built; client wiring
 * intentionally deferred until the consent copy + clinician sign-off land —
 * see SUMMARY.md).
 *
 * Rephrases ONE clinician-owned topic line in the parent's own words. The
 * safety order is absolute and lives in CODE:
 *   1. verify the JWT                                   → 401
 *   2. re-run the SHARED red-flag scan on the parent's raw text FIRST —
 *      a match returns { kind: 'triage' } and the model is NEVER called
 *   3. unknown topic → { kind: 'oos' } — the model is NEVER called
 *   4. only then: Claude rephrases the KB entry, grounded in nothing else
 *   5. full audit (service role), refusal-aware, 8s, 0 retries
 *
 * Every failure falls back to the KB entry's original line — the client
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

const DEFAULT_MODEL = 'claude-opus-4-8';
const LLM_TIMEOUT_MS = 8_000;
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
  const model = Deno.env.get('REASSURE_MODEL') ?? DEFAULT_MODEL;

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
  const audit = (
    kindResult: string,
    stopReason: string | null,
    response: unknown,
  ): Promise<unknown> =>
    serviceClient.from('reassure_audit').insert({
      user_id: user.id,
      baby_id: null,
      kind: 'topic-polish',
      request: { topicKey, parentText, model, result: kindResult },
      response: response ?? {},
      model,
      stop_reason: stopReason,
      latency_ms: Date.now() - startedAt,
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

  // 4. The grounded rephrase. Fallback is always the curated line itself.
  let line = topic.line;
  let source: 'llm' | 'fallback' = 'fallback';
  let stopReason: string | null = null;
  let llmResponse: unknown = null;
  if (anthropicKey) {
    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey, maxRetries: 0 });
      const response = await anthropic.messages.create(
        {
          model,
          max_tokens: 300,
          system: TOPIC_POLISH_SYSTEM_PROMPT,
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
      if (response.stop_reason !== 'refusal') {
        const block = response.content.find((item: { type: string }) => item.type === 'text') as
          | { type: 'text'; text: string }
          | undefined;
        if (block?.text) {
          const parsed = JSON.parse(block.text) as { line?: string };
          // The polish must stay bounded: reject empty or runaway output.
          if (
            typeof parsed.line === 'string' &&
            parsed.line.length > 0 &&
            parsed.line.length <= topic.line.length * 3
          ) {
            line = parsed.line;
            source = 'llm';
          }
        }
      }
    } catch (error) {
      llmResponse = { error: String(error) };
    }
  } else {
    llmResponse = { error: 'ANTHROPIC_API_KEY not configured' };
  }

  // 5. Audit before returning.
  await audit('topic', stopReason, llmResponse);

  return json(200, { kind: 'topic', topicKey, line, source });
});
