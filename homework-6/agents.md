# Agent / AI Operating Guidelines — Transaction Processing Pipeline (homework-6)

Governs any AI agent (or human) producing or extending artifacts for this project — specification
content, pipeline code, tests, the frontend dashboard, the MCP server, or documentation. Read
`specification.md` first; this file is the standing operating rules layered on top of it.

## Tech stack assumptions

- **Language/runtime**: Python 3.11+, chosen for first-class `decimal.Decimal` support and to match
  TASKS.md's own examples (`mcp/server.py`, FastMCP) with zero substitution.
- **Pipeline stages**: plain Python modules (`pipeline/validator.py`, `pipeline/fraud_detector.py`,
  `pipeline/settlement.py`), no web framework — they communicate purely through the file-based envelope
  protocol in `shared/`.
- **Front-end**: FastAPI serving a static HTML/JS dashboard (`frontend/`), read-only against
  `shared/results/`.
- **MCP**: `context7` (framework/library lookups during code generation) and a custom FastMCP server
  (`mcp/server.py`) exposing pipeline status as tools/resources.
- **Tests**: `pytest` + `pytest-cov`; coverage gated at 80% by a Claude Code `PreToolUse` hook
  (`.claude/hooks/check-coverage.sh`) that blocks `git push` below that threshold.

## Domain rules (financial pipeline, non-negotiable)

1. **Money as `Decimal`, never float.** Every monetary value is parsed from its original string via
   `pipeline.models.to_decimal`. Floating-point money is prohibited in specs, code, and tests alike.
2. **Currency codes are ISO 4217, checked against an explicit allowlist** (`SUPPORTED_CURRENCIES` in
   `pipeline/models.py`) — never accept an unrecognized code silently.
3. **The file-based stage protocol is the only inter-stage contract.** A stage reads from its input
   directory, moves the record to `processing/` while working, and writes to `output/` (next stage) or
   `results/` (terminal). No stage imports another stage's internals directly, and no stage bypasses the
   envelope format from `specification.md` §3.
4. **PII masking is enforced at the logging boundary, not by convention.** Use
   `pipeline.models.mask_account` for every account number that reaches a log line or a human-facing
   summary (dashboard, orchestrator print output, MCP tool responses). The full account number may remain
   inside a `data` payload passed between stages (needed for settlement), but never in anything printed,
   logged, or returned as a top-level status string.
5. **One shared read path for `shared/results/`.** `pipeline/results_reader.py` is the only code allowed
   to read and summarize `shared/results/` — the frontend, the MCP server, and the orchestrator's summary
   all call into it rather than each re-implementing directory scanning.
6. **Terminal outcomes are exhaustive and traceable.** Every transaction that enters the pipeline ends in
   exactly one of three terminal states — `rejected`, `flagged_for_review`, `settled` — each written to
   `shared/results/` with a `reason` (rejected) or `flags`/`risk_score` (flagged) or
   `fee`/`net_amount`/`settlement_batch` (settled). A transaction with no terminal record after a full
   orchestrator run is a bug, not an acceptable silent drop.
7. **Idempotency is keyed by `transaction_id`, and `shared/results/` is append-only.** Never resubmit a
   `transaction_id` that already has a terminal record in `shared/results/`, and never let a stage
   overwrite an existing result record for one. See `specification.md` §3 Idempotency for why this pipeline
   uses natural-key idempotency instead of a synthetic Idempotency-Key header scheme.
8. **Every stage function must be safe to run twice on the same record.** Crash recovery works by
   re-submitting whatever is sitting in `shared/processing/` at orchestrator startup — if a stage isn't
   idempotent per-record, a crash mid-run turns into a silent double-side-effect instead of a clean retry.
9. **`shared/results/` is the audit trail; stage log lines are operational logging — never conflate the
   two.** A result written only to a log line (and not to `shared/results/`) does not count as an audited
   outcome, and audit-trail content (the `reason`/`flags`/settlement detail) must never be the *only* place
   an outcome is recorded — it must always land in `shared/results/`.
10. **`mcp/server.py` can never be imported as `from mcp.server import ...`.** The real `mcp` SDK package
    (a dependency of `fastmcp`, with its own `__init__.py`) always wins that dotted-name resolution over
    our `mcp/` directory, which has no `__init__.py` and is therefore only ever a namespace-package
    portion — confirmed by testing both import orders. Any code that needs the functions in
    `mcp/server.py` (tests, ad-hoc scripts) must load it by file path via
    `importlib.util.spec_from_file_location("pipeline_mcp_server", "mcp/server.py")` +
    `module_from_spec` + `exec_module`, never a dotted import. `pytest --cov=mcp` itself is unaffected —
    coverage.py resolves `--cov=mcp` against the project rootdir path, not Python's import system, and was
    confirmed (2026-08-11) to measure `mcp/server.py` correctly.

## Documentation conventions

- **Money**: `Decimal` (constructed from string) + currency code, never a bare number.
- **Timestamps**: ISO 8601 UTC everywhere, including log lines and result records.
- **Currency codes**: three-letter ISO 4217 codes from `SUPPORTED_CURRENCIES` only.
- **IDs**: `transaction_id` from the source data is authoritative; `message_id` on every stage envelope is
  a fresh UUID4, distinct from `transaction_id`.

## Testing / verification expectations

- Every pipeline stage has unit tests covering its pass case, at least one reject/flag case, and the edge
  cases named in `specification.md` §4 (e.g. `TXN003`'s $9,999.99 sitting deliberately just under the
  fraud threshold).
- One integration test runs the full orchestrator against a `tmp_path`-based `shared/` tree — never the
  real `shared/` directory.
- Coverage gate: 80% hard minimum (enforced by the pre-push hook), 90% target. A task that lowers coverage
  below the gate to "make tests pass faster" is not acceptable — add tests instead.
- The known-outcome table in `specification.md` §4 (3 settled / 3 flagged / 2 rejected against the shipped
  `sample-transactions.json`) is the baseline every test suite and the dashboard should reconcile against.

## Security & compliance constraints for any agent working on this project

- Never write example payloads, log lines, or screenshots containing an unmasked account number — always
  show the masked form (`***{last 4 chars}`) in anything human-facing.
- Never propose collapsing the three terminal states (`rejected`/`flagged_for_review`/`settled`) into a
  generic "processed" status — the distinction is what the dashboard and fraud-review workflow depend on.
- Never propose auto-settling a `flagged_for_review` transaction without an explicit separate approval
  step — flagging is terminal in this pipeline's current scope, not a delay before automatic settlement.
- Never propose a code path where the coverage-gate hook is bypassed (`--no-verify`-style shortcuts) to
  get a push through — fix coverage instead.
- This pipeline deliberately has no authentication/authorization layer (see `specification.md` §3 "Scope:
  no authentication/authorization layer") — never silently add one as a "nice to have"; if a real
  permission boundary is ever needed, that's a spec change first, not a code-only addition.

## How this agent should treat edge cases

- Treat `specification.md` §4's "known outcome shape" table as a first-class regression baseline: if a
  code change alters which of the 8 sample transactions lands in which terminal state, that's a signal to
  stop and check whether the change was intentional, not to silently update the table to match.
- When a new ambiguity is discovered (a new currency to support, a new fraud signal, a different fee
  model), resolve it explicitly in `specification.md` first — Low-Level Tasks are the traceable source for
  what any given module is supposed to do — then implement against the updated spec, not the other way
  around.

## Traceability requirement

Every Low-Level Task in `specification.md` must trace back to a Mid-Level Objective it serves. An agent
adding a new task that cannot be traced this way should treat it as out of scope until it is linked to an
existing objective or a new objective is added to justify it.
