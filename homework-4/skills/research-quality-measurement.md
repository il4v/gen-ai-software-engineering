---
name: research-quality-measurement
description: Use when verifying or rating the quality of a bug-research document before a fix plan is built on it. Defines the fixed levels/labels (Verified, Mostly Verified, Needs Rework, Unverifiable) a Research Verifier must assign, and the concrete criteria for each level, so quality ratings are consistent across every bug researched in this pipeline.
---

# Research Quality Measurement

A rubric for rating how trustworthy a bug-research document is, used by the Research Verifier agent when
writing `verified-research.md`. Always use these exact levels and labels — do not invent new ones or rename
them.

## Levels

### Verified
- Every file:line citation checked and correct.
- Every quoted/paraphrased code snippet matches the actual source exactly.
- The claimed root cause is an accurate, well-reasoned read of the code (not just "this looks related").
- Zero discrepancies found.
- **Meaning for downstream agents**: the Bug Planner can build directly on this without re-checking anything.

### Mostly Verified
- Core claims (the root cause, the primary file:line) are correct.
- Minor issues only: a stale line number that's off by a few lines after drift, a paraphrase that's slightly
  imprecise but not misleading, or one secondary claim that couldn't be checked.
- No discrepancy changes the diagnosis itself.
- **Meaning for downstream agents**: safe to plan from, but the Bug Planner should sanity-check the specific
  minor issues called out in Discrepancies Found before finalizing line-level plan details.

### Needs Rework
- At least one claim central to the diagnosis (the actual root cause, or the primary file:line) is wrong,
  contradicted by the source, or unsupported.
- The research may still contain useful leads, but the core conclusion cannot be trusted as-is.
- **Meaning for downstream agents**: do not plan a fix from this document yet — send it back to the Bug
  Researcher with the specific discrepancies listed, or re-research the flagged claims directly.

### Unverifiable
- One or more central claims reference files, functions, or line ranges that don't exist in the current
  codebase, or the research document is too vague to check against real source (no concrete file:line
  citations at all).
- **Meaning for downstream agents**: treat as a hard stop — this cannot safely feed a fix plan until the
  research is redone against the actual codebase.

## How to assign a level

1. Verify every individual claim first (see the Research Verifier agent's own process for *how* to check each
   one — this skill only defines the rating scale, not the checking mechanics).
2. Weigh discrepancies by whether they touch the **core diagnosis** (root cause + primary file:line) or are
   **secondary** (supporting detail, a related-but-not-load-bearing citation).
3. Pick the lowest level whose description matches what you found — do not round up out of politeness. A
   single core-diagnosis error means at most "Needs Rework," regardless of how much else was correct.
4. Always pair the level with the specific reasoning ("assigned Mostly Verified because the root cause and
   primary citation were correct, but the secondary citation at file X was off by 4 lines") — a bare label with
   no reasoning is not an acceptable Research Quality Assessment.
