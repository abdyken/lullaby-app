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
 *   6. Claude call (bounded, structured output, refusal-aware, 8s, 0 retries)
 *   7. full request/response audit (service role only)
 *   8. cache + return
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

const DEFAULT_MODEL = 'claude-opus-4-8';
const LLM_TIMEOUT_MS = 8_000;
const NIGHT_START_HOUR = 18;
const NIGHT_LENGTH_HOURS = 16; // 18:00 → 10:00 next day

type EventRow = {
  type: 'feed' | 'sleep' | 'diaper' | 'pump' | 'note';
  start_at: string;
  end_at: string | null;
  meta: { label?: string } | null;
};

type Tallies = {
  feeds: number;
  diapers: number;
  spitUps: number;
  longestSleepMin: number | null;
  sleepRunning: boolean;
};

const SPITUP_NOTE_LABEL = 'Spit-up';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** The night window in UTC ms, from the night key + the client's tz offset. */
function windowFor(nightKey: string, tzOffsetMinutes: number): { startMs: number; endMs: number } {
  const [y, m, d] = nightKey.split('-').map((part) => Number.parseInt(part, 10));
  // Local 18:00 expressed in UTC: UTC = local + tzOffsetMinutes (JS convention).
  const startMs = Date.UTC(y, m - 1, d, NIGHT_START_HOUR, 0) + tzOffsetMinutes * 60_000;
  const endMs = Math.min(Date.now(), startMs + NIGHT_LENGTH_HOURS * 3_600_000);
  return { startMs, endMs };
}

function computeTallies(rows: EventRow[], startMs: number, endMs: number): Tallies {
  let feeds = 0;
  let diapers = 0;
  let spitUps = 0;
  let longestSleepMs = 0;
  let sleepRunning = false;

  for (const row of rows) {
    const t = Date.parse(row.start_at);
    switch (row.type) {
      case 'feed':
        if (t >= startMs && t <= endMs) feeds += 1;
        break;
      case 'diaper':
        if (t >= startMs && t <= endMs) diapers += 1;
        break;
      case 'note':
        if (t >= startMs && t <= endMs && row.meta?.label === SPITUP_NOTE_LABEL) spitUps += 1;
        break;
      case 'sleep': {
        const sleepEnd = row.end_at == null ? endMs : Date.parse(row.end_at);
        if (t <= endMs && sleepEnd >= startMs) {
          if (row.end_at == null) sleepRunning = true;
          longestSleepMs = Math.max(longestSleepMs, sleepEnd - t);
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    feeds,
    diapers,
    spitUps,
    longestSleepMin: longestSleepMs > 0 ? Math.max(1, Math.round(longestSleepMs / 60_000)) : null,
    sleepRunning,
  };
}

function ageBandFromBirthDate(birthDate: string | null): string {
  if (!birthDate) return 'unknown age';
  const weeks = Math.max(0, Math.floor((Date.now() - Date.parse(birthDate)) / (7 * 24 * 3_600_000)));
  if (weeks < 4) return '0-4 weeks';
  if (weeks < 12) return '1-3 months';
  if (weeks < 26) return '3-6 months';
  if (weeks < 52) return '6-12 months';
  return 'over 12 months';
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
  const { startMs, endMs } = windowFor(nightKey, tzOffsetMinutes);
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
  const ageBand = ageBandFromBirthDate(babyRow?.birth_date ?? null);

  // 5. Triage-first by construction: only these code-built strings may reach
  //    the prompt. Scan them anyway — the guard survives future edits.
  const promptFacts = [
    `Age band: ${ageBand}.`,
    `Feeds logged: ${tallies.feeds}.`,
    `Diaper changes logged: ${tallies.diapers}.`,
    `Spit-up notes logged: ${tallies.spitUps}.`,
    tallies.sleepRunning
      ? 'A sleep is currently running.'
      : tallies.longestSleepMin != null
        ? `Longest sleep logged: ${tallies.longestSleepMin} minutes.`
        : 'No sleep logged yet.',
  ].join(' ');
  if (matchesRedFlag(normalizeAsk(promptFacts))) {
    // A red flag inside pure tallies means something is structurally wrong —
    // never call the model on it.
    return json(200, { read: null, source: 'fallback', nightKey, tallies });
  }

  // 6. The bounded Claude call.
  let read: string | null = null;
  let stopReason: string | null = null;
  let llmResponse: unknown = null;
  if (anthropicKey) {
    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey, maxRetries: 0 });
      const response = await anthropic.messages.create(
        {
          model,
          max_tokens: 300,
          system: NIGHT_READ_SYSTEM_PROMPT,
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
      if (response.stop_reason !== 'refusal') {
        const block = response.content.find((item: { type: string }) => item.type === 'text') as
          | { type: 'text'; text: string }
          | undefined;
        if (block?.text) {
          const parsed = JSON.parse(block.text) as { read?: string };
          if (typeof parsed.read === 'string' && parsed.read.length > 0) read = parsed.read;
        }
      }
    } catch (error) {
      llmResponse = { error: String(error) };
    }
  } else {
    llmResponse = { error: 'ANTHROPIC_API_KEY not configured' };
  }

  // 7. Audit — full request/response, service-role only, fire before returning.
  await serviceClient.from('reassure_audit').insert({
    user_id: user.id,
    baby_id: babyId,
    kind: 'night-read',
    request: { nightKey, tzOffsetMinutes, tallies, ageBand, model, promptFacts },
    response: llmResponse ?? {},
    model,
    stop_reason: stopReason,
    latency_ms: Date.now() - startedAt,
  });

  if (read == null) {
    return json(200, { read: null, source: 'fallback', nightKey, tallies });
  }

  // 8. Cache for every caregiver of this baby, then return.
  await serviceClient
    .from('reassure_night_reads')
    .upsert({ baby_id: babyId, night_key: nightKey, read, model, tallies });

  return json(200, { read, source: 'llm', nightKey, tallies });
});
