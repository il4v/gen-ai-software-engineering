# Specification — Transaction Processing Pipeline (Homework 6 Capstone)

## 1. High-Level Objective

The pipeline validates, screens for fraud, and settles financial transactions from a raw JSON feed,
producing one auditable outcome per transaction in `shared/results/`, a run summary, and a queryable
status via a web dashboard and a custom MCP server.

## 2. Mid-Level Objectives

1. **(MLO-1 — Validation)** Every transaction is validated for required fields, a positive `Decimal`
   amount, and a valid ISO 4217 currency code before further processing; a transaction failing any check is
   rejected into `shared/results/` with a specific `reason` and never reaches fraud detection. *Why:* bad
   data (unparseable amount, unrecognized currency) must never reach fraud scoring or settlement, where a
   malformed amount could silently become `0` or a garbage value instead of a loud, specific rejection.
2. **(MLO-2 — Fraud detection)** Every validated transaction receives a numeric risk score (0–100) from
   three independent signals — high value (amount > $10,000), cross-border movement (transaction country ≠
   the issuer's home country, `US`), and unusual timing (outside `06:00`–`22:00` UTC) — and is flagged for
   manual fraud review (`flagged_for_review`, terminal in `shared/results/`) when the score reaches 50;
   transactions below 50 proceed to settlement. *Why these numbers:* $10,000 mirrors the real-world
   Currency Transaction Report (CTR) threshold used in US AML/BSA reporting — a single transaction at or
   above it is significant enough to warrant review on its own (scored at 50, the flag threshold, so it
   flags alone). Cross-border and unusual-timing are each scored lower (25) because neither is suspicious
   in isolation (international transfers and off-hours API activity are both routine) — the design
   intentionally requires two "soft" signals together to reach the same bar as one "hard" signal, to avoid
   flagging routine cross-border business at high false-positive rates.
3. **(MLO-3 — Settlement)** Every transaction that clears fraud review is settled: a flat 0.5% processing
   fee is deducted, a net settlement amount is computed with `ROUND_HALF_UP` to 2 decimal places, and a
   settlement batch (date = transaction date + 1 day) is assigned before the final `settled` result is
   written. *Why:* the flat fee and T+1 batch date are assumed placeholder policy (no real fee schedule was
   given) standing in for a real card-network/ACH-style settlement lag, so settlement has something concrete
   to compute rather than passing the amount through unchanged; `ROUND_HALF_UP` is used (not banker's
   rounding) because it's the more common convention for customer-facing settlement amounts and avoids
   ambiguity about which direction a mid-point rounds.
4. **(MLO-4 — Completeness & observability)** Running the orchestrator against `sample-transactions.json`
   (8 records) produces exactly 8 terminal records in `shared/results/` — no record is silently dropped —
   plus a printed run summary (counts by outcome: `settled`, `flagged_for_review`, `rejected`). *Why:* this
   is the pipeline's core correctness property — every other objective (1–3) defines *how* a transaction is
   decided, this one guarantees *every* transaction gets a decision, which is what TASKS.md's "all
   transactions from sample-transactions.json should appear in shared/results/" deliverable check verifies.
5. **(MLO-5 — Auditability & privacy)** All pipeline stages log ISO 8601 UTC timestamps, stage name,
   transaction ID, and outcome for every processed record; no stage ever writes a full account number (only
   a masked form, last 4 characters) or any other PII to a log line or a result file's top-level fields
   outside `data`. *Why:* this is the pipeline's compliance surface — TASKS.md explicitly requires an audit
   trail with these four fields and treats account numbers as sensitive; without this objective, stages
   could satisfy MLO-1–4's data-flow correctness while still leaking PII into logs or leaving no record of
   why a decision was made.

## 3. Implementation Notes

- **Money**: `decimal.Decimal`, always constructed from the original string value (never from a float or
  from a float-derived string). No arithmetic on `float` anywhere in the pipeline.
- **Currency codes**: validated against a fixed ISO 4217 allowlist (`pipeline/models.py`:
  `SUPPORTED_CURRENCIES = {"USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "INR", "SGD"}`); any
  code outside this set is rejected as `invalid_currency_code`.
- **Timestamps**: ISO 8601, UTC (`Z` suffix), both on the incoming transaction and on every stage's log
  line and envelope.
- **Logging**: every stage emits one structured log line per record processed — timestamp, stage name,
  `transaction_id`, outcome (e.g. `validated`, `rejected:invalid_amount`, `flagged:score=50`, `settled`).
  Never log `source_account`/`destination_account` in full — mask to `***{last 4 chars}`.
- **PII**: account numbers are masked in logs and in any human-facing summary (dashboard, orchestrator
  print output); the full account number may remain in the `data` payload passed between stages (needed
  for settlement), but never in a log line.
- **Envelope format**: exactly the shape given in `../TASKS.md` (`message_id` as a fresh UUID4 per
  envelope, `timestamp`, `source_stage`, `target_stage`, `message_type: "transaction"`, `data`).

### Idempotency

- Idempotency here is keyed by the domain's own `transaction_id`, not a synthetic client-supplied key. A
  synthetic idempotency key (e.g. a client-generated UUID sent in a request header, matched against a
  stored fingerprint on retry) is the right tool for a live request-response API where a caller retries an
  ambiguous-outcome write — but this pipeline is a batch pull over a static input file with no caller to
  retry anything, so that mechanism would be solving a problem this system doesn't have.
- Before submitting a record to `shared/input/`, the orchestrator checks whether `shared/results/` already
  contains a terminal record for that `transaction_id`. If so, it is skipped — never resubmitted, never
  duplicated, never silently overwritten. `shared/results/` is treated as append-only per transaction.

### Partial failure / crash recovery

- A record found sitting in `shared/processing/` when the orchestrator starts (left there by a prior run
  that crashed mid-stage) is re-submitted to the stage that owns that directory rather than left stuck
  indefinitely.
- Every stage's `process_transaction` must be safe to run twice on the same record — reprocessing after a
  crash produces the same outcome, not a second side effect — since crash-recovery re-submission is the
  only retry mechanism this pipeline has.

### Audit trail vs. operational logging

- `shared/results/` **is** the audit trail: exactly one immutable record per `transaction_id`, holding the
  terminal outcome and the reason/flags/settlement detail that produced it.
- The structured log lines described above (timestamp, stage, transaction ID, outcome) are operational
  logging — a separate concern, written to the console/log output, not to `shared/results/`. Never treat a
  log line as satisfying the audit-trail requirement, and never write audit-trail content only to a log.

### Performance (assumed targets)

- The orchestrator processes all 8 records in `sample-transactions.json` in under 5 seconds. *(Assumed
  target — a batch pipeline over a handful of file-sized records has no realistic latency risk; this
  exists mainly to catch an accidental O(n²) directory scan in `results_reader.py` as the result set
  grows.)*
- The dashboard's `/api/summary` and `/api/results` endpoints respond within 500ms p95. *(Assumed target —
  typical internal-tool UX expectation, not a regulated SLA.)*

### Scope: no authentication/authorization layer

- This pipeline has **no** authentication or authorization layer — the dashboard and MCP tools are
  unauthenticated by design for this capstone. This is a deliberate scope decision, not an oversight: a
  real regulated system would typically gate full (unmasked) account-number visibility behind an explicit
  permission (distinct from a general "logged in" check — e.g. only specific reviewer roles can see an
  unmasked account number, everyone else sees the masked form from the PII rule above), but building any
  such permission system is out of scope for this capstone.

## 4. Context

- **Beginning state**: `sample-transactions.json` — 8 raw transaction records (`transaction_id`,
  `timestamp`, `source_account`, `destination_account`, `amount` as a numeric string, `currency`,
  `transaction_type`, `description`, `metadata.channel`, `metadata.country`).
- **Ending state**: `shared/results/` contains exactly 8 JSON result records (one per input transaction);
  `orchestrator.py` prints a pipeline summary report (counts by outcome); test coverage ≥ 90% (hard gate
  enforced at 80% by `.claude/hooks/check-coverage.sh`).
- **Known outcome shape for `sample-transactions.json`** (used to build tests and the dashboard against a
  known-good baseline — not a hidden requirement, just documented so the numbers in Steps 2/6 of
  `docs-tmp/PLAN-USER.md` are traceable back to this spec):
  - `TXN006` (currency `XYZ`) → rejected, `invalid_currency_code`.
  - `TXN007` (amount `-100.00`) → rejected, `invalid_amount`.
  - `TXN002` ($25,000, US) and `TXN005` ($75,000, US) → high value alone reaches score 50 → flagged.
  - `TXN004` (€500, `DE`, `02:47Z`) → cross-border (25) + unusual timing (25) = score 50 → flagged.
  - `TXN001`, `TXN003` ($9,999.99 — deliberately just under the $10,000 threshold), `TXN008` → score 0 →
    settled.
  - Result: 3 `settled`, 3 `flagged_for_review`, 2 `rejected`.

## 5. Low-Level Tasks

```
Task: Shared models and results reader
Prompt: "Create pipeline/models.py with a frozen dataclass for the stage envelope (message_id, timestamp,
source_stage, target_stage, message_type, data), the SUPPORTED_CURRENCIES set, and helpers
to_decimal(amount_str) -> Decimal and mask_account(account_id) -> str. Create
pipeline/results_reader.py with functions to list and summarize records in shared/results/, reused by the
frontend, the MCP server, and the orchestrator's summary."
File to CREATE: pipeline/models.py, pipeline/results_reader.py
Function to CREATE: to_decimal(amount_str: str) -> Decimal, mask_account(account_id: str) -> str,
list_results(results_dir: Path) -> list[dict], summarize_results(results_dir: Path) -> dict
Serves: MLO-1 (to_decimal/currency set enable the validator's checks), MLO-5 (mask_account is the single
masking implementation every stage/consumer must reuse), MLO-4 (results_reader is what the orchestrator's
summary, the frontend, and the MCP server all call — one implementation of "read shared/results/" instead
of three, so the completeness guarantee can't silently diverge across consumers).
Details: models.py has no I/O — pure data types and validators. results_reader.py only reads
shared/results/*.json; never writes. Why a shared module instead of duplicating this in each consumer:
agents.md domain rule 5 requires exactly one read path for shared/results/ — three independent
implementations would let the dashboard, MCP server, and orchestrator summary silently disagree about a
transaction's status.
```

```
Task: Validation Stage
Prompt: "Create pipeline/validator.py implementing process_transaction(record: dict) -> dict per
specification.md section 2 objective 1: required fields present, amount parses as a positive Decimal via
to_decimal, currency in SUPPORTED_CURRENCIES. Reject with a specific reason (invalid_amount,
invalid_currency_code, missing_field:<name>) into shared/results/, otherwise write the envelope to
shared/output/ for the fraud detector. Support a --dry-run CLI flag that reports counts without moving
any files, for the /validate-transactions skill."
File to CREATE: pipeline/validator.py
Function to CREATE: process_transaction(record: dict) -> dict
Serves: MLO-1 directly — this is the objective's entire implementation.
Details: Validates every record in shared/input/, moves each through shared/processing/ while working.
Positive-amount check rejects zero and negative amounts (e.g. TXN007's -100.00). Why reject rather than
coerce (e.g. treat a negative amount as a refund): TASKS.md scopes this pipeline to forward transactions
only — silently reinterpreting a negative amount as a different transaction_type would be a bigger, unasked
-for decision than rejecting it with a specific reason and leaving refund handling out of scope.
```

```
Task: Fraud Detection Stage
Prompt: "Create pipeline/fraud_detector.py implementing process_transaction(record: dict) -> dict per
specification.md section 2 objective 2: risk_score = 50 if amount > 10000 else 0, +25 if
metadata.country != 'US', +25 if the transaction hour (UTC) is outside 06:00-22:00. If risk_score >= 50,
write a flagged_for_review terminal result to shared/results/ with the score and the specific flags list.
Otherwise forward to shared/output/ for settlement."
File to CREATE: pipeline/fraud_detector.py
Function to CREATE: process_transaction(record: dict) -> dict
Serves: MLO-2 directly — this is the objective's entire implementation.
Details: flags list must name which signals fired (e.g. ["high_value"], ["cross_border", "unusual_timing"])
so the dashboard can show why a transaction was flagged. Why the flags list matters beyond the score: a
bare risk_score of 50 doesn't tell a reviewer (human or the dashboard) *which* rule fired — MLO-5's
auditability objective requires the reason for a decision to be recorded, not just the decision itself.
```

```
Task: Settlement Processing Stage
Prompt: "Create pipeline/settlement.py implementing process_transaction(record: dict) -> dict per
specification.md section 2 objective 3: deduct a flat 0.5% fee from amount using Decimal with
ROUND_HALF_UP to 2 places, assign a settlement batch (BATCH-<transaction_date+1>), and write the final
settled result to shared/results/."
File to CREATE: pipeline/settlement.py
Function to CREATE: process_transaction(record: dict) -> dict
Serves: MLO-3 directly — this is the objective's entire implementation.
Details: net_amount = amount - (amount * Decimal('0.005')), quantized to 2 decimal places. Result record
includes original amount, fee, net_amount, currency, settlement_batch, settlement_date. Why all of those
fields and not just net_amount: a settled result must be independently reconcilable — a reviewer (or a
future accounting system) needs to see the fee that was deducted and which batch/date the settlement
belongs to, not just the final number, to audit that the fee math is correct.
```

```
Task: Orchestrator
Prompt: "Create orchestrator.py with two entry points: reset_shared_dirs() (wipes
shared/{input,processing,output}, never results/) and run_pipeline() (crash-safe: recovers any
shared/processing/ leftovers into shared/input/, adds fresh envelopes only for transaction_ids not yet
terminal in shared/results/, then runs validator, fraud_detector, and settlement in sequence and prints a
summary via pipeline.results_reader.summarize_results)."
File to CREATE: orchestrator.py
Function to CREATE: reset_shared_dirs(shared_dir: Path) -> None, run_pipeline() -> dict
Serves: MLO-4 directly (drives every transaction through to a terminal record and reports completeness);
also the enforcement point for the Idempotency subsection above (skips transaction_ids already terminal in
shared/results/) and the Partial failure/crash recovery subsection (recovers anything left in
shared/processing/ at startup instead of destroying it).
Details: reset_shared_dirs() and run_pipeline() are deliberately separate functions, matching the
/run-pipeline skill's own step 2 ("Clear shared/ directories") and step 3 ("Run the pipeline") being
listed as distinct steps — run_pipeline() itself never force-clears input/output, because doing so
unconditionally would destroy exactly the crash-leftover records the Partial failure/crash recovery
subsection is meant to preserve (an earlier draft of this task merged the two and broke that guarantee;
kept here as a note so the same mistake isn't reintroduced). Why results/ is never cleared by either
function: it's the only durable record of what happened across runs — everything else is disposable
in-flight state.
```

```
Task: Web Dashboard Front-end
Prompt: "Create frontend/server.py (FastAPI) serving frontend/static/index.html and JSON endpoints
GET /api/summary and GET /api/results (both backed by pipeline.results_reader), showing total counts,
a pass/flagged/rejected breakdown, and a table of rejection/flag reasons."
File to CREATE: frontend/server.py, frontend/static/index.html, frontend/static/app.js,
frontend/static/style.css
Function to CREATE: get_summary() -> dict, get_results() -> list[dict] (FastAPI route handlers)
Serves: TASKS.md Task 2's front-end requirement — not one of the 5 MLOs itself, but exists specifically to
make MLO-4's output (shared/results/) and MLO-2's flag reasons human-observable without reading raw JSON
files, per TASKS.md's stated preference for a web UI over a CLI.
Details: Read-only — the dashboard never triggers a pipeline run itself, only displays the current
contents of shared/results/. Why read-only: a write-capable dashboard would need its own idempotency and
auth story (see the Idempotency and Scope: no authentication subsections) that TASKS.md doesn't ask for;
keeping it a pure viewer avoids inventing requirements beyond what's specified.
```

```
Task: Custom MCP Server
Prompt: "Create mcp/server.py using FastMCP exposing tool get_transaction_status(transaction_id: str),
tool list_pipeline_results(), and resource pipeline://summary, all backed by
pipeline.results_reader so there is one implementation of 'read shared/results/', not three."
File to CREATE: mcp/server.py
Function to CREATE: get_transaction_status(transaction_id: str) -> dict, list_pipeline_results() -> dict,
pipeline_summary_resource() -> str
Serves: TASKS.md Task 4's required custom FastMCP server — like the frontend, not one of the 5 MLOs, but
the AI-agent-facing counterpart to it: makes MLO-4's completeness guarantee and MLO-2's flag reasons
queryable by an AI agent (e.g. Claude Code itself) rather than only by a human looking at a web page.
Details: get_transaction_status returns a not-found shape (never a stack trace) if the ID doesn't exist in
shared/results/. Why a structured not-found response instead of raising: an MCP tool's error surface is
consumed by an LLM, not a human reading a traceback — a clear {"found": false, "transaction_id": ...} shape
lets the caller reason about it and respond sensibly, where an unhandled exception would just look like a
broken tool.
```
