---
description: Generate or refresh specification.md and agents.md for the transaction processing pipeline capstone.
---

Produce or refresh `specification.md` and `agents.md` for this project. The only external file this
command depends on is `../TASKS.md` (the assignment's own required template) — everything else needed is
embedded below, so this works correctly even on a fresh clone with no local planning scratch files.

## Refresh, don't blind-regenerate

If `specification.md` and/or `agents.md` already exist: **read them first and preserve every section and
subsection already present.** Only add what's missing or update what's factually wrong (e.g. code that no
longer matches a described behavior). Never regenerate either file from scratch and silently drop existing
content — a prior run may have added detail (rationale, edge cases, domain rules) that isn't re-derivable
from `TASKS.md` alone, and dropping it is a regression, not a refresh.

## Locked architecture decisions (do not re-decide these)

- Stack: Python (FastAPI for services, pytest for tests).
- Pipeline stages: **Validator → Fraud Detector → Settlement** (Settlement is the 3rd required stage).
- Front-end: a web dashboard (FastAPI + static HTML/JS), not a CLI.
- Author name: **Illia Chantsov**.
- Fraud scoring rule: risk_score starts at 0; **+50** if `amount > $10,000`; **+25** if
  `metadata.country != "US"` (cross-border); **+25** if the transaction hour (UTC) falls outside
  `06:00`–`22:00` (unusual timing). `risk_score >= 50` → `flagged_for_review` (terminal, no auto-settle);
  below 50 → proceeds to settlement.
- Settlement: flat **0.5%** fee, `ROUND_HALF_UP` to 2 decimal places, settlement batch dated
  transaction-date **+1 day**.
- Supported currencies (ISO 4217 allowlist): `USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, INR, SGD`.

## `specification.md` — exactly 5 sections, in order

1. **High-Level Objective** — one sentence.
2. **Mid-Level Objectives** — 4–5 items, each tagged `MLO-N` and ending with a `*Why:*` (or "why these
   numbers") sentence explaining the rationale for any threshold/number it introduces — never a bare
   number with no justification.
3. **Implementation Notes** — must include ALL of these subsections, not just money/currency/timestamps:
   - Money/currency/timestamps/logging/PII (the baseline conventions: `Decimal`, ISO 4217, ISO 8601 UTC,
     structured per-record log lines, masked account numbers via `mask_account`).
   - **Idempotency** — keyed by the domain's own `transaction_id` (not a synthetic client-supplied key,
     since this is a batch pull over a static file, not a live retried API); re-running against an
     already-terminal `transaction_id` in `shared/results/` is a no-op, never a duplicate.
   - **Partial failure / crash recovery** — a record left in `shared/processing/` by a run that didn't
     finish is resubmitted to `shared/input/` on the next run rather than lost; every stage's
     `process_transaction` must be safe to run twice on the same record.
   - **Audit trail vs. operational logging** — `shared/results/` is the audit trail (one immutable record
     per `transaction_id`); stage log lines are a separate operational-logging concern; never conflate the
     two or let one substitute for the other.
   - **Performance (assumed targets)** — at least one labeled-assumed numeric target (e.g. the
     orchestrator completing all sample transactions in under 5 seconds), each with a one-line rationale.
   - **Scope: no authentication/authorization layer** — state explicitly that this is a deliberate scope
     decision, not an oversight.
4. **Context** — beginning state (`sample-transactions.json`), ending state (`shared/results/`, a summary
   report, coverage ≥ 90%), and a **known-outcome baseline table**: read the actual current
   `sample-transactions.json`, apply the locked validation/fraud/settlement rules above to every record by
   hand, and document exactly which transaction_ids land in which terminal state (settled /
   flagged_for_review / rejected, with reasons/flags) — this is what later tests and the dashboard get
   reconciled against, so it must reflect the real file's actual contents, never a placeholder or an
   assumption about what the file probably contains.
5. **Low-Level Tasks** — one entry per pipeline stage/component (validator, fraud_detector, settlement,
   orchestrator, frontend, MCP server), each in this exact format, with `Serves:` and a "why" sentence in
   `Details` added on top of TASKS.md's base format:
   ```
   Task: [Pipeline Stage Name]
   Prompt: "[Exact prompt you will give Claude Code]"
   File to CREATE: pipeline/validator.py
   Function to CREATE: process_transaction(record: dict) -> dict
   Serves: [which MLO-N this implements, or which TASKS.md requirement if it's not one of the 5 MLOs]
   Details: [what the stage checks/transforms/decides] Why: [the non-obvious reasoning behind a design
   choice in this task — never leave a task with no rationale for its non-default choices]
   ```

## `agents.md` — required content if creating or extending it

Domain rules covering: money-as-Decimal (never float), ISO 4217 validation, the file-based stage protocol
as the only inter-stage contract, PII masking enforced at the logging boundary (not by convention),
`pipeline/results_reader.py` as the single read path for `shared/results/`, the three exhaustive terminal
outcomes, idempotency keyed by `transaction_id` (append-only `shared/results/`), every stage function safe
to rerun (crash-recovery precondition), the audit-trail-vs-logging distinction, and — if `mcp/server.py`
exists — the note that it can never be imported via `from mcp.server import ...` (the real `mcp` SDK
package always wins that name; load by file path via `importlib` instead).

## After writing

Report which sections/subsections were added vs. already present vs. updated — be explicit about what
changed, don't just say "done."
