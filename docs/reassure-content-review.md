# Reassure — Clinician Content Review Manifest

**Status: DRAFT — nothing below is clinically approved.** All medical copy was
ported verbatim from the design prototype (`.reference/reassure-demo.html`)
as a structural placeholder. Reassure must not ship publicly until every item
below is signed off and `REASSURE_CONTENT.status` in
`src/features/reassure/content/kb.ts` is flipped to `'approved'` with
`reviewedBy` / `reviewedAt` filled in. A smoke check (§X15) verifies the
metadata shape and that the placeholder tags survive while status is draft.

## Ownership split

- **Clinician owns:** the membership of the red-flag list, every KB string,
  the triage/out-of-scope copy, and the two LLM system prompts.
- **Engineering owns:** the matching semantics — lowercase **substring**
  matching over normalized input (typographic apostrophes → straight). The
  reviewer must be walked through the consequences, e.g.:
  - `dehydrat` catches "dehydrated", "dehydration";
  - `temperature` catches benign sentences ("her temperature is normal") —
    deliberate over-triage, the safe direction;
  - `gasping` triages even though "gas" alone is a comfort topic (red flags
    are checked first, guarded by smoke §X3/§X13).

## Items requiring sign-off

| # | Item | Where |
|---|------|-------|
| 1 | Red-flag list (~33 substrings) | `src/features/reassure/domain/redflags.ts` (+ mirror `supabase/functions/_shared/reassureContent.ts`, drift-guarded by smoke §X17) |
| 2 | KB topic: Hiccups (line / normal / helps / call) | `src/features/reassure/content/kb.ts` |
| 3 | KB topic: Spit-up (line / normal / helps / call) | same |
| 4 | KB topic: Gas (line / normal / helps / call) | same |
| 5 | KB topic: Sleep (line / normal / helps / call) | same |
| 6 | Triage copy (title, body, action labels) | same (`TRIAGE_COPY`) |
| 7 | Out-of-scope copy | same (`OOS_COPY`) |
| 8 | Topic footer ("trust your gut…") | same (`TOPIC_FOOT`) |
| 9 | Example chips (six demo asks, two flagged) | same (`EXAMPLE_CHIPS`) |
| 10 | Hero hint + safety-promise line + bottom disclaimer | `src/app/(tabs)/reassure.tsx` |
| 11 | Emergency-number info line | `src/features/reassure/components/AnswerCard.tsx` (`EMERGENCY_INFO`) |
| 12 | Night-read LLM system prompt | `supabase/functions/_shared/reassureContent.ts` (`NIGHT_READ_SYSTEM_PROMPT`) |
| 13 | Topic-polish LLM system prompt | same (`TOPIC_POLISH_SYSTEM_PROMPT`) |
| 14 | Recap read templates (descriptive register) | `src/features/reassure/domain/recap.ts` (`recapReadText`) — guarded by smoke §X12 (no judgement vocabulary) |

## Review process

1. Reviewer works through the table above against the running app + this repo.
2. Every change lands as a PR touching ONLY the content modules, with a row in
   the change log below.
3. On final approval: set `REASSURE_CONTENT = { version, status: 'approved',
   reviewedBy, reviewedAt }`, update the mirror, re-run
   `npm run check:local-interactions` (X15/X17 enforce consistency).
4. Post-launch (Phase 3): a weekly export of the `reassure_audit` table for
   spot-checking LLM-polished output is part of the review loop.

## Change log

| Date | Version | Change | Reviewer |
|------|---------|--------|----------|
| 2026-07-02 | 2026-07-02 | Initial port from the demo prototype — DRAFT, unreviewed | — |
