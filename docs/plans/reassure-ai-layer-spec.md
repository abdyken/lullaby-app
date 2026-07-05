# Reassure — AI Layer Implementation Spec

> Hand this to the coding agent. It defines exactly how the AI layer of the
> Reassure feature must behave. The feature is already built on branch
> `feat/reassure-v2` (router, triage, KB, edge-function scaffolds all exist).
> **Verify the existing code against this contract, fill gaps, and finalize —
> do NOT re-architect the triage-first router or the KB.**

---

## 0. Scope & ground rules

- The "AI agent" is **two bounded LLM calls**, not an autonomous agent. The LLM
  only produces *tone/summary*. All safety, routing, and medical content live in
  code + the clinician-owned KB.
- **Model decision is final:** `claude-haiku-4-5-20251001`, via the existing
  `REASSURE_MODEL` env var (change its default from `claude-opus-4-8` to Haiku).
  Provider stays Anthropic (no training on API data on any tier — required for a
  health surface). Do not switch providers or add streaming / tool-use / agentic
  loops.
- Existing anchors to reuse (from SUMMARY.md), do not duplicate:
  - `supabase/functions/reassure-night-read/index.ts`
  - `supabase/functions/reassure-topic-polish/index.ts`
  - `supabase/functions/_shared/reassureContent.ts` (shared REDFLAGS/KB, X17 deep-equal drift guard)
  - tables `reassure_night_reads` (PK `(baby_id, night_key)`), `reassure_audit`
  - `application/nightRead.ts`, `canUseLlmNightRead` in `src/lib/proGates.ts`
  - guards: X12 (judgement-vocabulary), X15 (placeholder tags survive while draft),
    X16 (spit-up label drift), X17 (content mirror deep-equal)
  - `docs/reassure-content-review.md` (14-item clinician manifest; items #10/#13 =
    consent line + system-prompt sign-off, gate Job 2)

---

## 1. Invariants — must hold for EVERY LLM call

1. **Triage runs in code BEFORE any model call.** A red-flag hit returns a triage
   result and the LLM is never invoked.
2. **The LLM never adds medical content** — no advice, diagnosis, escalation
   guidance, or new facts beyond the input it is given.
3. **Every LLM output is validated + length-capped before it reaches the client.**
   Any failure (parse error, refusal, guardrail block, timeout) → deterministic
   **local fallback**. The user always sees a safe result.
4. **Every call is audited** to `reassure_audit` (request, response, latency, model,
   outcome, token usage), service-role only, zero client RLS policies.
5. **Clinical content + system prompts stay `PLACEHOLDER` until sign-off**
   (`REASSURE_CONTENT.status === 'draft'`). The AI layer must run end-to-end with
   placeholders so all paths are testable, but must NOT be exposed to real users
   until `status === 'approved'`.

---

## 2. Model configuration (both jobs)

| Setting | Value |
|---|---|
| `model` | `REASSURE_MODEL` (default `claude-haiku-4-5-20251001`) |
| `temperature` | `0.3` (consistent, low-variance) |
| `max_tokens` | per-job hard cap (Night Read ≤ ~200, Topic Polish ≤ ~120) |
| output | structured JSON only; parse defensively → fallback on failure |
| refusal | handle `stop_reason === 'refusal'` → fallback |
| timeout | 8s server-side; **0 retries** |
| prompt caching | cache the stable system-prompt prefix (cache read ≈ 0.1× input) — free win |
| streaming / Batch | none (outputs are short and latency-bounded) |

Cost sanity to keep in mind: Night Read ≈ 500 in / 150 out ≈ **$0.00125/call** on
Haiku ($1/$5 per MTok). Assert the `max_tokens` caps so cost can't drift.

---

## 3. Job 1 — Night Read (Pro-gated; already built, finalize it)

**Purpose:** turn code-computed night tallies into ONE calm, strictly *descriptive*
sentence.

**Gating & UX**
- Client gate: `canUseLlmNightRead` (Pro). Free users get the local read only.
- The **local descriptive read (`recapReadText`) always renders first**; the LLM
  read replaces it only on success within the client's 3s ceiling. Never block UI
  on the network.

**Input contract (server builds the prompt)**
- Tallies computed **in code** (counts per type, sleep minutes, spit-up count,
  night-window label). Do **not** send raw event objects to the model.
- Baby's first name only (already used elsewhere in the app); no other PII.
- Run the shared red-flag scan over every string entering the prompt (belt-and-
  suspenders even though tallies are numeric).

**System prompt (PLACEHOLDER — clinician-reviewed; store version + reviewedBy empty)**
Intent, final wording pending review:
- Role: "Write a single warm, plain-language sentence summarizing a newborn's night
  from the counts provided."
- Hard rules: "Describe ONLY what the numbers say. Do NOT judge whether anything is
  normal / typical / concerning. No advice, no medical interpretation, no new facts.
  ≤ N words. Output JSON only."

**Output contract**
- JSON `{ "read": string }` (keep existing shape if different).
- Validation: non-empty AND ≤ length cap AND must pass the **X12 judgement-vocabulary
  guard** (no normal/typical/fine/healthy/concerning/etc.). If it introduces banned
  vocab → discard, render local read, audit outcome as `guardrail_block`.

**Server flow**
```
JWT → baby_caregivers authz
    → cache lookup (reassure_night_reads, PK (baby_id, night_key))
        → hit: return cached
    → compute tallies IN CODE
    → red-flag scan over prompt strings
    → build prompt (cached system prefix) → Haiku (temp 0.3, max_tokens cap, 8s, 0 retries)
    → handle refusal / parse-fail / guardrail-block → fallback
    → validate output
    → cache upsert  +  audit insert
    → return { source: 'llm' | 'fallback', read }
```
- The cache PK doubles as the **once-per-night rate limit**.
- ANY failure returns `source: 'fallback'`.

---

## 4. Job 2 — Topic Polish / assistant (built; keep DARK until gate)

**Purpose:** rephrase ONLY the clinician-owned KB line for the matched topic into a
warmer, personal tone. Never change meaning.

**Gate — do NOT wire to the client yet.** Requires BOTH: (a) consent line added to
the disclaimer (raw parent text leaves the device), and (b) clinician sign-off of the
system prompt — manifest items #10 / #13. Until then: server built + tested, client
wiring OFF.

**Input contract**
- Parent's raw text — but the **server re-runs the shared red-flag scan FIRST**:
  - red-flag → return `{ kind: 'triage' }` with **NO model call**
  - unknown topic → return `{ kind: 'oos' }` with **NO model call**
  - only a matched, non-flagged topic reaches the model
- The model receives ONLY the matched topic's approved KB line (+ optionally the
  parent's phrasing, for tone-matching). It does **not** get free rein to answer the
  question.

**System prompt (PLACEHOLDER — clinician-reviewed)**
- Role: "Gently rephrase the provided reassurance line to sound warm and personal."
- Hard rules: "Rephrase ONLY the given line. Do NOT add, remove, or change any factual
  or medical content. Do NOT answer the parent's question or add advice. ≤ N words.
  If you cannot do this safely, return the original line unchanged. Output JSON only."

**Output contract**
- JSON `{ "text": string }`. Validation: length cap + semantic-preservation check
  (must not introduce new medical claims — reuse the shared guardrail). On any doubt
  → return the original KB line **verbatim**, audit.

**Server flow**
```
JWT / authz
    → shared red-flag scan on raw text
        → triage / oos short-circuit (NO model)
    → matched topic → build prompt (approved KB line + tone hint) → Haiku
    → refusal / parse-fail / guardrail-block → return original line
    → validate → audit → return polished-or-original line
```

---

## 5. Shared components (extract once, both jobs use them)

- **Red-flag scan + REDFLAGS + KB** — single shared source
  (`_shared/reassureContent.ts`), mirrored and deep-equal drift-guarded (X17). Any
  change goes to the shared module.
- **Output guardrail** — extract ONE reusable validator used by both jobs:
  `parse JSON → length cap → banned-vocabulary / new-medical-claim check`. This is the
  "the model cannot smuggle medical content" gate. Reuse the X12 vocabulary list.
- **Audit writer** — single helper writing to `reassure_audit`.
- **Fallback** — both jobs return a deterministic safe result; the client always has a
  local render (`recapReadText` / the verbatim KB line).

---

## 6. Privacy / data handling (health-critical)

- Provider Anthropic; model via `REASSURE_MODEL`. No API-data training on any tier.
- `reassure_audit`: service-role only, zero client RLS (already spec'd). **Add a
  retention policy** (define a TTL) and **minimize raw parent text** in the audit for
  Job 2 (truncate or hash if the full text isn't needed for review).
- Job 2 is the sensitive path (raw text off-device) → the consent gate is mandatory
  before wiring.
- Keep a short **data-flow note** for KZ personal-data-law / ISO 27001 alignment:
  infant data leaves the device only for (1) the Pro night-read as **numeric tallies**,
  and (2) later, consented, topic-polish as raw text.

---

## 7. Config / secrets / deploy

Set (respect the project's "no deploy from an agent session" rule — do it yourself if
so, otherwise document the exact steps):
1. Supabase function secrets: `ANTHROPIC_API_KEY`, `REASSURE_MODEL=claude-haiku-4-5-20251001`.
2. Apply the two migrations; deploy both functions.
3. Verify in staging: cache-hit path, timeout→fallback, refusal→fallback,
   guardrail-block→fallback, non-Pro→local read.

---

## 8. Tests to add (smoke / QA)

- **Night Read:** tallies → sentence; extend the X12-style guard to block judgement
  vocab in LLM output; timeout / refusal / parse-fail → fallback; once-per-night
  cache; non-Pro path renders local read.
- **Topic Polish (server-only for now):** red-flag raw text → triage, no model;
  unknown topic → oos, no model; matched → rephrase within length cap;
  output-preservation guard; refusal → original line verbatim.
- **Cost/config:** log `usage` token counts; assert `max_tokens` caps hold.

---

## 9. Explicitly OUT of scope — do NOT

- Do NOT let the LLM perform routing or triage.
- Do NOT wire Topic Polish to the client until consent + clinician sign-off.
- Do NOT write, finalize, or expand the medical copy or red-flag thresholds (clinician).
- Do NOT switch providers, add streaming, or add agentic tool-use.
- Do NOT store raw medical text in analytics.

---

## 10. Deliverables

1. Both edge functions verified/finalized against this contract.
2. A single shared **output-guardrail validator** + a shared **audit helper**.
3. `REASSURE_MODEL` default set to Haiku; `max_tokens` caps + temperature applied.
4. Config set (or the exact deploy steps documented if out of session scope).
5. A short `docs/reassure-ai-layer.md` noting what is live, what is gated behind
   clinician sign-off / consent, and the token/cost profile.
