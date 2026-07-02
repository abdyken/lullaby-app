# Reassure Scope Matrix (v1.5)

**Status:** proposal + first-slice implementation. Medical copy stays PLACEHOLDER,
pending clinician review (see `docs/reassure-content-review.md`,
`REASSURE_CONTENT.status` in `content/kb.ts`).

Reassure is being expanded from a tiny exact-topic router into a **bounded Parent
Experience Assistant**: it should answer common newborn worries, help parents read
and use their own logs, and offer gentle non-medical support — while keeping every
safety guarantee that v2 already ships. This document is the audit, the target
architecture, and the coverage matrix that the local slice implements.

The iron rules do **not** change:

1. **Red-flag triage is decided in deterministic code, FIRST, always.** No LLM ever
   decides triage. (`domain/redflags.ts` + `route()`; source-order guarded by smoke
   §X13.)
2. **REDFLAGS membership is clinician-owned.** This work does not touch it.
3. **Curated medical answers come from the local KB.** The LLM may only ever
   *rephrase* clinician-owned text, never introduce medical claims.
4. **Every ask resolves to exactly one bounded outcome.** No open-ended chat.

---

## 1. Audit of the current surface (before this change)

### 1.1 `route()` topics
`src/features/reassure/domain/router.ts` resolves, in order:

1. `matchesRedFlag(t)` → `triage` (wins over everything).
2. Five curated KB comfort topics via fixed regexes:
   `hiccups` · `spitup` · `gas` (incl. `burp|belch|wind`) · `crying` · `sleep`.
3. Everything else → `oos` (bounded decline).

### 1.2 KB coverage (`content/kb.ts`)
`KB` had five topics (hiccups, spitup, gas, crying, sleep), each a clinician-owned
`{ line, normal, helps, call }` card rendered by `AnswerCard`/`AnswerBlocks`
("What's normal / What can help / When to call"). Plus non-medical UX copy:
`TRIAGE_COPY`, `OOS_COPY`, `EXAMPLE_CHIPS`.

### 1.3 Voice normalization coverage (`domain/voiceTranscript.ts`)
STT alternatives are normalized (mishears like `hick ups → hiccups`) and each
candidate is run through `route()`; triage candidates beat topic candidates beat
out-of-scope. Contextual STT strings bias recognition toward the known vocabulary.
No LLM participates in voice routing.

### 1.4 Grounding layer (`domain/recap.ts`)
`buildReassureRecap()` computes **code-only** tallies (feeds, diapers, spit-ups,
notes, longest sleep, sleep-running) over the parent's saved `CareEvent`s for the
current window. `recapReadText()` is strictly descriptive. The Pro-gated
`reassure-night-read` edge function may *rephrase* this read (never the numbers).

### 1.5 The gap
Valid parent-experience asks fell into `oos` because they matched no exact topic:

| Ask | Old result | Should be |
| --- | --- | --- |
| "she's burping" | oos → **fixed** (gas) | baby_comfort |
| "is she eating enough?" | oos | feeding_tracking |
| "how often should she feed?" | oos | feeding_tracking |
| "how many wet diapers is normal?" | oos | diaper_tracking |
| "what should I log this as?" | oos | app_logging_help |
| "how many feeds tonight?" | oos | logs_summary |
| "I'm exhausted / overwhelmed" | oos | parent_support |
| "which stroller should I buy?" | oos | out_of_scope (correct) |

---

## 2. Target architecture (v1.5)

```
ask (voice / chip / text)
        │
        ▼
  normalizeAsk
        │
        ▼
┌───────────────────────────────────────────────┐
│ 1. matchesRedFlag(t)  ── deterministic code ──►│ triage   (ALWAYS FIRST, ALWAYS WINS)
└───────────────────────────────────────────────┘
        │ no red flag
        ▼
┌───────────────────────────────────────────────┐
│ 2. curated KB comfort matcher (fixed regexes) ►│ topic    (local AnswerCard)
└───────────────────────────────────────────────┘
        │ no curated topic
        ▼
┌───────────────────────────────────────────────┐
│ 3. classifyScope(t, ctx) → ReassureScope       │  (deterministic, keyword-based)
│    baby_comfort | feeding_tracking |           │
│    sleep_tracking | diaper_tracking |          │
│    app_logging_help | parent_support |         │
│    logs_summary | out_of_scope                 │
└───────────────────────────────────────────────┘
        │
        ▼
  map scope → bounded outcome:
    feeding/diaper/sleep_tracking → topic  (local KB card)
    app_logging_help/parent_support/logs_summary → guide (local, non-medical)
    baby_comfort (no curated topic) → oos  [FUTURE: safe AI answer]
    out_of_scope → oos
```

**`classifyScope` never decides triage.** It only runs on non-red-flag,
non-curated-topic asks. It is a pure leaf (no React / Pro / LLM / backend imports),
smoke-guarded like the rest of the domain (§X14), and is the deterministic input the
future AI path will use to pick grounding + prompt.

### 2.1 Two answer shapes
- **`topic`** — clinician-owned medical KB card (`normal / helps / call`). Curated
  comfort + the new `feeding` and `diaper` tracking topics.
- **`guide`** — bounded **non-medical** answer (app help, parent support, logs
  pointer). Rendered without a "When to call" medical block. `parent_support`
  explicitly states it is *not medical advice* and points to a doctor / support line
  for anything serious.

### 2.2 Where the future AI path plugs in (DARK in this slice)
`baby_comfort` asks with no curated topic, and richer `feeding/sleep/diaper/
logs_summary` questions, are the ones that want a generated answer. The proposed
**`reassure-parent-answer` edge function** (new, not built yet) would, *only after*
the same server-side red-flag scan:

- receive the ask + the chosen `scope` + (for `logs_summary`) the **code-computed**
  recap tallies (never raw events, never free text beyond an 80-char audit preview);
- be grounded in curated app/KB scope for its `scope`;
- return **strict validated JSON**, run through the existing
  `_shared/reassureLlm.ts` `validateLlmOutput` guardrail (length cap +
  judgement-vocab / new-medical-claim check);
- **no diagnosis, no treatment, no emergency reassurance**;
- fall back to the local bounded response on any failure (same "local-first, LLM is
  polish" contract as `reassure-night-read`).

It reuses the existing shared safety modules verbatim: `reassureContent.ts`
(mirror + drift guard), `reassureLlm.ts` (config + guardrail),
`reassureAudit.ts` (privacy-minimized audit writer). Night-read's client contract
(hard timeout, cache, silent fallback) is the template for the client hook.

**Do we need a new edge function?** Yes — `reassure-parent-answer` is a distinct job
from night-read (a read of tallies) and topic-polish (a rephrase of one KB line). It
is deliberately **not implemented in this slice**; the local classifier + guides
cover the "obvious common" asks so nothing regresses while the AI path is reviewed.

### 2.3 Pro / free gating recommendation
- **Free, forever:** triage, all curated KB topics, `app_logging_help`,
  `parent_support`, and the code-computed `logs_summary` pointer. Safety and basic
  app/parent help are never paywalled (consistent with the existing rule that
  `canUseLlmNightRead` gates *polish*, not safety).
- **Pro:** the generated `reassure-parent-answer` polish (richer, log-grounded
  phrasing) — with the free local bounded answer always available as the instant
  fallback. New gate `canUseLlmParentAnswer(isPro)` alongside `canUseLlmNightRead`.
- Reassure's `domain/`+`content/` stay forbidden from importing Pro gates (§X14),
  so the gate lives only in the client hook / edge layer.

---

## 3. Coverage matrix

Legend: **local topic** = curated KB card · **local guide** = non-medical bounded
card · **AI (future)** = wants `reassure-parent-answer`, DARK today (local fallback).

| Scope | Example asks | Handling today | Future |
| --- | --- | --- | --- |
| `baby_comfort` | hiccups, spit-up, gas & **burping**, crying, sleep | **local topic** (curated KB) | AI for worries with no curated topic (rash, sneezing, startle…) |
| `feeding_tracking` | "is she eating enough?", "how often should she feed?", "cluster feeding" | **local topic** `feeding` | AI grounded in feed tallies |
| `diaper_tracking` | "how many wet diapers?", "poop / pee is …" | **local topic** `diaper` | AI grounded in diaper tallies |
| `sleep_tracking` | "how much should she sleep?", naps | **local topic** `sleep` | AI grounded in sleep tallies |
| `app_logging_help` | "what should I log this as?", "how do I track a feed?" | **local guide** | AI for richer how-to |
| `parent_support` | "I'm exhausted", "overwhelmed", "I can't do this" | **local guide** (non-medical) | AI for warmer, still-bounded support |
| `logs_summary` | "how many feeds tonight?", "what did she do?" | **local guide** → recap (only when logs exist) | AI reads back **code-computed** tallies |
| `out_of_scope` | "which stroller should I buy?" | **oos** decline | stays oos |

---

## 4. First safe slice (implemented in this change)

**A.** This document.
**B.** Local routing expansion — `classifyScope` + mapped outcomes:
- burping → gas (already shipped);
- feeding enough / feeding often → `feeding` topic;
- diaper / poop / pee → `diaper` topic;
- what should I log → `app_logging_help` guide;
- exhausted / overwhelmed → `parent_support` guide;
- how-many / recap asks → `logs_summary` guide **when logs exist**, else oos.

**C.** LLM answers stay **DARK** — no edge function, no client AI call, no Pro gate
wired. `classifyScope` is pure and deterministic; no model participates in routing or
triage.

**D.** Smoke tests: common parent asks no longer oos; unrelated asks still oos; red
flags still override every new scope; `parent_support` is non-medical; app-logging
asks route to app help; logs asks route to `logs_summary` only when data exists.

---

## 5. Remaining questions that should go to AI later (still local-fallback today)

- Open-ended baby worries with no curated topic (rashes, sneezing, startles, cradle
  cap, "why does she …") — classified `baby_comfort` but currently `oos`.
- Quantitative feeding/sleep/diaper questions that want the parent's **actual**
  numbers ("is 6 feeds enough for her age?") — need log-grounded generation.
- Natural-language `logs_summary` beyond "here's where your recap lives" — reading
  back specific code-computed tallies in a sentence.
- Warmer, situation-aware `parent_support` phrasing (still bounded, still
  non-medical, with crisis escalation to a real human/helpline).

All of the above must go through `reassure-parent-answer` with the shared guardrail
and a deterministic local fallback. **None are wired in this slice.**

---

## 6. Confirmation
No LLM routing or triage was added. `classifyScope` is deterministic keyword code, runs
only *after* the code red-flag scan, and never overrides triage. REDFLAGS meaning is
unchanged. All new medical copy (`feeding`, `diaper`) is PLACEHOLDER pending clinician
review and mirrored into the edge-function content mirror (drift-guarded by §X17).
