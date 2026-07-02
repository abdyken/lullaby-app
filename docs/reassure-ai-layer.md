# Reassure — AI Layer (implementation status)

> Companion to `docs/reassure-ai-layer-spec.md` (the contract) and
> `docs/reassure-content-review.md` (the clinician sign-off manifest).
> Last updated: 2026-07-02.

## What the AI layer is

Two bounded LLM calls — never an agent, never a router:

| Job | Function | Purpose | Status |
|---|---|---|---|
| 1 · Night Read | `supabase/functions/reassure-night-read` | One calm, strictly descriptive read over code-computed night tallies | **Built + verified.** Live for Pro users once deployed (placeholder prompts — see gates below) |
| 2 · Topic Polish | `supabase/functions/reassure-topic-polish` | Rephrase ONE clinician-owned KB line in the parent's tone | **Built + verified, DARK.** Server exists; zero client wiring (enforced by smoke §X22) |

All safety lives in code around the model:

- **Triage first, always.** The shared red-flag scan
  (`_shared/reassureContent.ts`, deep-equal-mirrored from the app by smoke
  §X17) runs before any model call. Night Read scans its own code-built
  prompt facts; Topic Polish scans the parent's raw text and returns
  `{kind:'triage'}` / `{kind:'oos'}` with **no model call**. Source order is
  a build invariant (smoke §X21).
- **The model can never add medical content.** One shared output guardrail
  (`_shared/reassureLlm.ts` → `validateLlmOutput`): JSON parse → length cap →
  judgement-vocabulary / new-medical-claim check (the X12 list; words the KB
  source line already contains are exempt). Any failure — parse, length,
  vocab, refusal, timeout, API error — returns the deterministic local
  fallback (`recapReadText` / the verbatim KB line).
- **Every call is audited** through one shared writer
  (`_shared/reassureAudit.ts`) into `reassure_audit` — request, response,
  model, `outcome`, `stop_reason`, latency, token `usage`. Service-role only;
  the table has zero client RLS policies.

## Model configuration (pinned, asserted by smoke §X20)

| Setting | Value |
|---|---|
| Model | `REASSURE_MODEL` env, default `claude-haiku-4-5-20251001` |
| Temperature | 0.3 |
| `max_tokens` | Night Read 200 · Topic Polish 120 |
| Output | structured JSON (`output_config.format` json_schema), parsed defensively |
| Timeout / retries | 8 s server-side / 0 retries; client adds its own 3 s ceiling |
| Prompt caching | `cache_control: ephemeral` on the system prompt. Dormant today: Haiku 4.5's minimum cacheable prefix is 4096 tokens and the placeholder prompts are far below it; it starts paying automatically if the reviewed prompts grow |

### Token / cost profile (Haiku 4.5: $1 in / $5 out per MTok)

- **Night Read:** ~500 in / ≤200 out ≈ **$0.0015 per uncached call**, hard-capped
  at one model call per baby per night (the `reassure_night_reads` PK is the
  rate limit; cache hits and the client's AsyncStorage cache cost nothing).
  1,000 Pro babies ≈ $1.50/night worst case.
- **Topic Polish:** ~250 in / ≤120 out ≈ **$0.0009 per call**; triage and
  out-of-scope asks never reach the model. Not callable from the app yet.
- Every audit row carries the real `usage` block, and the function logs emit
  `[reassure-audit] … usage={…}` per call, so cost drift is observable.

## What is gated, and on what

| Gate | Blocks | Cleared by |
|---|---|---|
| `REASSURE_CONTENT.status === 'draft'` | Public launch of all Reassure medical copy + both system prompts (all still PLACEHOLDER) | Clinician review — full manifest in `docs/reassure-content-review.md`; smoke §X15 keeps the tags honest |
| Manifest #13 — system-prompt sign-off | Topic Polish client wiring | Clinician approves `TOPIC_POLISH_SYSTEM_PROMPT` |
| Manifest #10 — consent line | Topic Polish client wiring (raw parent text leaves the device) | Consent copy added to the disclaimer + shipped |
| `canUseLlmNightRead` (Pro) | The LLM night read only | Purchase. Free users always get the local descriptive read — safety is never paywalled |
| **AI night-read consent** (local, `lullaby.reassure.aiNightReadConsent.v1`) | The client from EVER calling `reassure-night-read` | The parent explicitly taps "Turn on AI read" in the one-time `AiConsentCard`. Undecided or declined → the client never invokes the function; the local read stays. The consent state is private: never sent to analytics, Supabase, the LLM, or a log line |
| **Server kill-switch** `REASSURE_NIGHT_READ_ENABLED` (edge env) | Any Anthropic call, server-side | Set to exactly `"1"`. Missing / any other value → the function returns the local fallback (`source:'fallback'`, `outcome='disabled'`) **without constructing the Anthropic client or spending a token**. Off by default while medical content is draft |

**Three gates must ALL hold for a real AI night read:** Pro/dev entitlement
(`canUseLlmNightRead`), explicit local consent, and the server kill-switch on.
The first two are client-side (no consent → no request at all); the third is
server-side (a request arrives but no model is called). Local Reassure and the
code-computed recap always work with none of them.

Topic Polish stays dark until **both** #10 and #13 clear; smoke §X22 fails the
build if any `src/` file references `reassure-topic-polish`.

## Privacy / data-flow note (KZ personal-data law / ISO 27001 alignment)

Infant data leaves the device only for:

1. **Pro night read** — numeric tallies + a coarse age band. No names, no
   note text, no raw events reach the model (smoke §X19 asserts the prompt
   builder's output).
2. **Topic polish (later, consented)** — the parent's raw text, capped at
   280 chars, scanned for red flags before any model use.

Provider is Anthropic (no training on API data on any tier). The
`reassure_audit` log minimizes Job 2 parent text to an 80-char preview +
length (never the full text), and every row expires via `expires_at`
(90-day TTL). Nothing from this layer is written to analytics.

## Deploy runbook

> **Activation status — 2026-07-02 (project `xhyziuvgglsrdaakpmui`).**
> Step 2 (migrations) is **DONE**: `reassure_night_reads` and `reassure_audit`
> are applied and verified on the remote (RLS on; night_reads has the single
> caregiver-SELECT policy, audit has zero client policies). Steps 1, 3, 4
> (secrets + `reassure-night-read` deploy) are **still manual** — they need the
> Supabase CLI / dashboard and the `ANTHROPIC_API_KEY`, neither of which is
> available from the agent session. **This pass deploys ONLY
> `reassure-night-read`; `reassure-topic-polish` stays dark and un-wired**
> (do not run its deploy line below until gates #10 and #13 clear).

1. **Secrets** (Supabase Dashboard → Edge Functions → Secrets, or CLI):
   ```sh
   supabase secrets set ANTHROPIC_API_KEY=<key>
   supabase secrets set REASSURE_MODEL=claude-haiku-4-5-20251001
   # Server kill-switch — OMIT (or leave unset) to keep the model OFF. The
   # function then returns the local fallback with outcome='disabled' and
   # spends no tokens. Set to exactly "1" only once the content is approved:
   # supabase secrets set REASSURE_NIGHT_READ_ENABLED=1
   ```
   > While the medical content is draft, deploy with the kill-switch **unset**.
   > The function is safe to deploy in this state: every call audits
   > `outcome='disabled'` and returns `source:'fallback'`, so the client keeps
   > the local read and Anthropic is never called.
2. **Migrations** — ✅ **applied 2026-07-02** to `xhyziuvgglsrdaakpmui`
   (via the Supabase MCP `apply_migration`; from a clean CLI checkout use
   `supabase db push` instead):
   ```sh
   supabase db push   # applies 20260702090001_create_reassure_night_reads
                      #     and 20260702090002_create_reassure_audit
   ```
   Verify: `reassure_night_reads` (RLS on, 1 caregiver-SELECT policy) and
   `reassure_audit` (RLS on, **0** client policies; `outcome`/`usage`/
   `expires_at` columns present).
3. **Audit retention purge** — schedule after the migration (pg_cron, or any
   scheduler with service-role access):
   ```sql
   select cron.schedule('reassure-audit-purge', '30 3 * * *',
     $$delete from public.reassure_audit where expires_at < now()$$);
   ```
4. **Functions:**
   ```sh
   supabase functions deploy reassure-night-read
   # DO NOT deploy reassure-topic-polish in the night-read activation pass —
   # it stays dark until gates #10 and #13 clear:
   # supabase functions deploy reassure-topic-polish
   ```
   After deploy, confirm the function boots without import errors and that the
   shared modules resolve (`_shared/reassureLlm.ts`, `_shared/reassureAudit.ts`,
   `_shared/reassureContent.ts`, `reassure-night-read/nightReadCore.ts`):
   ```sh
   supabase functions list                 # reassure-night-read shows ACTIVE
   supabase functions logs reassure-night-read --tail   # no boot/import errors
   supabase secrets list                    # ANTHROPIC_API_KEY + REASSURE_MODEL present (names only)
   ```
5. **Staging checks (spec §7):**
   - happy path: Pro user, fresh night → `source:'llm'`, audit row `outcome='llm'`;
   - cache hit: second call same night → same read, no new audit row;
   - non-Pro → client never calls the function (local read only);
   - unset `ANTHROPIC_API_KEY` in staging → `source:'fallback'`, `outcome='no_api_key'`;
   - refusal / guardrail / timeout paths → `source:'fallback'`, audit outcomes
     `refusal` / `guardrail_block` / `timeout` (timeout is easiest to force by
     setting an absurdly low `LLM_TIMEOUT_MS` in a staging-only branch);
   - topic polish (curl with a user JWT): red-flag text → `{kind:'triage'}`
     and unknown topic → `{kind:'oos'}`, both with **no** Anthropic call in
     the function logs.

## Rollback

The night-read layer is fail-safe by construction: the client renders the
local descriptive read first and only overlays the LLM read if the function
answers within its 3 s ceiling. So a bad deploy degrades to the local read, it
does not break Reassure.

- **Roll back the function** (fastest kill switch, no client release needed):
  ```sh
  supabase functions deploy reassure-night-read --version <previous-version>
  # or fully disable it:
  supabase functions delete reassure-night-read   # client falls back to local read
  ```
- **Disable the model without redeploying (preferred kill-switch)** — flip the
  server env off; the function then audits `outcome='disabled'` and returns the
  local fallback without calling Anthropic (no token spend):
  ```sh
  supabase secrets unset REASSURE_NIGHT_READ_ENABLED   # or set it to any value ≠ "1"
  ```
- **Or unset the key** — the function then audits `outcome='no_api_key'` and
  returns the local fallback:
  ```sh
  supabase secrets unset ANTHROPIC_API_KEY
  ```
- **Migrations**: the tables are additive and safe to leave in place on a
  function rollback. Only drop them for a full teardown, and only if no rows
  must be retained (`reassure_audit` is a safety-review log):
  ```sql
  drop table if exists public.reassure_night_reads;
  drop table if exists public.reassure_audit;
  ```

## Rotating `ANTHROPIC_API_KEY`

1. Mint a new key in the Anthropic console; keep the old one live.
2. `supabase secrets set ANTHROPIC_API_KEY=<new-key>` (never commit it, never
   put it in `.env` or source — it lives only in Supabase function secrets).
3. Redeploy so the running instances pick it up:
   `supabase functions deploy reassure-night-read`.
4. Force one live night-read call and confirm `outcome='llm'` in
   `reassure_audit`; then revoke the old key in the Anthropic console.

## Verification map (spec §8 → smoke checks)

`npm run check:local-interactions` (§X18–§X23), plus `npx tsc --noEmit` and
`npm run lint`:

- X18 — guardrail: parse/length/vocab failures → fallback; KB-sourced vocab
  exempt; timeout-vs-api-error classification.
- X19 — tallies → prompt facts (code-computed, red-flag-clean, coarse age band).
- X20 — model default, temperature, per-job `max_tokens` caps, 8 s / 0 retries,
  refusal handling; no hard-coded literals in either function.
- X21 — source order: cache and red-flag scan precede the model; triage/oos
  short-circuit; the verbatim KB line pre-seeds the fallback; both functions
  use the shared audit writer.
- X22 — client: local read renders first, 3 s ceiling, Pro gate; topic polish
  has zero client references.
- X23 — audit: minimized parent text, `usage` captured, zero client policies,
  90-day TTL columns present.
- X24 — AI night-read consent + server kill-switch: only "granted" consent lets
  the client call the function (Pro gate still applies); the local read/recap
  always render and the consent notice is one-time; consent copy is honest
  (works without AI, no diagnosis/treatment claim); the kill-switch disabled
  branch precedes any Anthropic construction/call (`outcome='disabled'`, no
  token spend); consent state never leaks to phone/analytics/LLM, and topic
  polish / parent-answer stay dark.
