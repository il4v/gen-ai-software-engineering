# Specification — Capstone Challenge Extension

> Extends the already-submitted homework-6 pipeline (`specification.md`, PR #7) with two new
> capabilities: a configurable fraud-rule engine (with a 5th agent to edit it) and a REST API gateway.
> Same 5-section template as `specification.md`, for consistency — this is not a TASKS.md-graded
> deliverable, just following the pattern that's already worked well on this project.

## 0. Decisions locked before building

| # | Decision | Choice |
|---|---|---|
| 1 | Branch strategy | New branch off `homework-6-submission` (`homework-6-capstone-challenge`), PR #7 untouched |
| 2 | Rule engine scope | Fraud-detection rules only, not settlement fee |
| 3 | API auth | None — matches the existing "Scope: no authentication" decision, extended to the new API |
| 4 | New agent's slash command | Yes, `/update-fraud-rules`, matching the existing per-agent-command pattern |

## 1. High-Level Objective

Extend the transaction pipeline with a configurable, agent-editable fraud-rule engine and a REST API
gateway, so fraud policy can be changed without code edits and transactions can be submitted/queried over
HTTP instead of only through the batch file feed — demoed end-to-end by a single zero-manual-step script.

## 2. Mid-Level Objectives

1. **(MLO-C1 — Configurable fraud policy)** Fraud-scoring rules (thresholds, signals, weights) live in
   `config/fraud_rules.yaml` as data, not Python constants, and `pipeline/fraud_detector.py` evaluates
   them generically. *Why:* today's policy is exactly right for the 8 sample transactions but hardcoded —
   any policy change (a new threshold, a new signal) currently requires a code change and a re-deploy,
   which is a heavier bar than a rules file a non-engineer could review.
2. **(MLO-C2 — Agent-mediated policy changes, with a shown blast radius)** A new subagent
   (`rule-engine-agent`) turns a natural-language policy request into an edit of `fraud_rules.yaml`, then
   re-runs the pipeline against `sample-transactions.json` and reports exactly which of the 8 known
   outcomes changed. *Why:* a rules file that's easy to edit is also easy to silently break — MLO-C2 exists
   so every edit's real-world effect is shown before it's trusted, not assumed.
3. **(MLO-C3 — HTTP-submittable transactions)** `POST /transactions` on a new API gateway
   (`api/server.py`) runs a submitted transaction through the same validator → fraud_detector → settlement
   chain the batch path uses, and writes its terminal result to `shared/results/` — visible afterward to
   the existing dashboard and MCP server with no changes to either. *Why "same chain," not new logic:* the
   3 stage functions are already implemented and tested; the API's only job is transport, not
   reimplementing decision logic a second time in a way that could drift from the batch path's behavior.
4. **(MLO-C4 — Idempotent API submissions)** Resubmitting a `transaction_id` the API has already
   terminalized returns the existing result rather than reprocessing it — the same rule
   `specification.md` §3 Idempotency already established for the batch orchestrator, extended to this
   second entry point. *Why:* two entry points enforcing idempotency differently would mean a
   transaction's outcome could depend on which path submitted it, which breaks the "one immutable record
   per transaction_id" invariant the whole audit trail relies on.
5. **(MLO-C5 — Zero-manual-step demo)** `demo.sh` starts the API, waits on a real health check (never a
   fixed sleep), submits 3 fixture transactions covering all three terminal states, prints every result,
   and tears itself down — runnable with no steps beyond executing the script. *Why a real health check
   and not a sleep:* a fixed sleep is either too short (flaky) or too long (slow) depending on the machine;
   a health-check poll is correct on both a fast and a slow machine, and is what `HOWTORUN.md`-quality
   scripts in this project have consistently done (see the coverage-gate hook's own precision).

## 3. Implementation Notes

### Rule engine

- **Rule schema** (`config/fraud_rules.yaml`): a `flag_threshold` (int) and a `rules` list, each rule
  `{name, field, operator, value, score}`. Supported operators: `gt`, `lt`, `eq`, `ne`,
  `outside_hours` (the last one takes `value: [start_hour, end_hour]` and reuses the existing hour-parsing
  logic already in `fraud_detector.py`, moved into the engine).
- **Default rules must reproduce today's exact behavior** — `high_value` (`amount gt 10000`, score 50),
  `cross_border` (`metadata.country ne US`, score 25), `unusual_timing` (`outside_hours [6, 22]`, score
  25), `flag_threshold: 50`. This is a correctness requirement, not a suggestion: the known-outcome
  baseline (3 settled / 3 flagged / 2 rejected against `sample-transactions.json`) must be unchanged
  immediately after this refactor, before any policy edit is made.
- **`pipeline/rule_engine.py` has no I/O beyond loading its own YAML file** — same "pure logic, separate
  from file/network concerns" discipline as `pipeline/models.py`.

### REST API

- **No new business logic.** `api/server.py` calls `pipeline.validator.process_transaction`,
  `pipeline.fraud_detector.process_transaction`, `pipeline.settlement.process_transaction` directly — the
  exact same functions `pipeline/*.run()` (the file-queue path) already calls and the exact same functions
  already covered by `tests/test_{validator,fraud_detector,settlement}.py`.
- **Idempotency check**: before running the chain, `pipeline.results_reader.get_transaction` is checked
  for an existing terminal record for that `transaction_id`; if found, it's returned as-is (mirrors
  `specification.md` §3 Idempotency exactly — see MLO-C4).
- **No authentication** (§0 decision #3) — consistent with the existing dashboard/MCP scope decision,
  but flagged here explicitly because a write-capable endpoint is a materially larger exposure than a
  read-only one; revisit if this API is ever exposed beyond a local demo.
- **Separate service from `frontend/server.py` on purpose** — the dashboard's whole design point (see
  `specification.md`'s Web Dashboard Front-end Low-Level Task) is staying read-only and never triggering a
  pipeline run; adding a write path to it would silently undo that guarantee for anyone reasoning about
  the dashboard's safety from its own code alone.

### Demo script

- `demo.sh` polls `GET /health` in a loop (no fixed `sleep N` as the sole wait mechanism) before
  submitting anything.
- Fixture transactions (`demo/txn-{settled,flagged,rejected}.json`) use `transaction_id`s distinct from
  `sample-transactions.json`'s `TXN00N` ids, so the demo is re-runnable without MLO-C4's idempotency logic
  silently turning a second demo run into a no-op.

## 4. Context

- **Beginning state**: the already-submitted homework-6 pipeline (PR #7) — `pipeline/{validator,
  fraud_detector,settlement}.py`, `orchestrator.py`, `frontend/`, `mcp/server.py`, `.claude/{agents,
  commands,hooks}`, 38 passing tests at 92.26% coverage.
- **Ending state**: `config/fraud_rules.yaml` + `pipeline/rule_engine.py` (fraud_detector refactored onto
  it, baseline unchanged), a 5th subagent (`rule-engine-agent`) + its slash command
  (`/update-fraud-rules`), `api/server.py` + its tests, `demo/*.json` + `demo.sh` runnable end-to-end,
  overall test coverage (including all new files) still ≥ 80% (the existing hook's gate applies
  unchanged), `README.md`/`HOWTORUN.md` updated to describe the new pieces.
- **Known outcome shape carried over unchanged** (from `specification.md` §4): `TXN006`/`TXN007` rejected,
  `TXN002`/`TXN004`/`TXN005` flagged, `TXN001`/`TXN003`/`TXN008` settled — this spec's rule-engine
  refactor must reproduce this exactly before any new policy rule is added on top.

## 5. Low-Level Tasks

```
Task: Rule Engine
Prompt: "Create pipeline/rule_engine.py with load_rules(path) -> RuleSet and
evaluate(record, ruleset) -> tuple[score, flags], supporting operators gt/lt/eq/ne/outside_hours. Create
config/fraud_rules.yaml with the default rules reproducing the current hardcoded fraud_detector.py
behavior exactly. Refactor pipeline/fraud_detector.py's process_transaction to call rule_engine.evaluate
instead of its own inline scoring."
File to CREATE: pipeline/rule_engine.py, config/fraud_rules.yaml
File to MODIFY: pipeline/fraud_detector.py
Function to CREATE: load_rules(path: Path) -> RuleSet, evaluate(record: dict, ruleset: RuleSet) ->
tuple[int, list[str]]
Serves: MLO-C1 directly.
Details: This is a behavior-preserving refactor first, a feature second — run
tests/test_fraud_detector.py and orchestrator.py against sample-transactions.json immediately after and
confirm the known-outcome baseline is byte-for-byte the same before considering this task done. Why
refactor instead of writing the engine as new, additive code path: a second, parallel scoring
implementation living alongside the old one is exactly the kind of drift risk this project's agents.md
already warns against for pipeline/results_reader.py's "one implementation" rule — the same discipline
applies here.
```

```
Task: Rule-Engine Agent + Slash Command
Prompt: "Create .claude/agents/rule-engine-agent.agent.md: takes a natural-language fraud-policy change
request, edits config/fraud_rules.yaml accordingly, then re-runs orchestrator.py against
sample-transactions.json and reports exactly which of the 8 known terminal outcomes changed versus the
baseline in specification.md/SPECIFICATION-CHALLENGE.md. Create .claude/commands/update-fraud-rules.md as
a thin slash-command wrapper invoking the same flow."
File to CREATE: .claude/agents/rule-engine-agent.agent.md, .claude/commands/update-fraud-rules.md
Serves: MLO-C2 directly.
Details: Tools: Read, Write, Edit, Bash (Bash is required — this agent must actually re-run the pipeline
for its impact report, not just describe what it thinks would change). Why the impact report is
mandatory, not optional: a rules file that's easy to edit is also easy to silently break in a way pure
code review of the YAML wouldn't catch (e.g. an operator typo that makes a rule never fire) — running it
against real data is the only way to catch that class of error before it ships.
```

```
Task: REST API Gateway
Prompt: "Create api/server.py (FastAPI): POST /transactions (runs a submitted record through
validator/fraud_detector/settlement process_transaction functions in sequence, writes the terminal result
to shared/results/, checks for an existing terminal record first per the idempotency rule), GET
/transactions/{transaction_id} (via pipeline.results_reader.get_transaction), GET /transactions (via
pipeline.results_reader.summarize_results), GET /health."
File to CREATE: api/server.py
Function to CREATE: submit_transaction(record: dict) -> dict, get_transaction_endpoint(transaction_id:
str) -> dict, list_transactions() -> dict, health() -> dict
Serves: MLO-C3, MLO-C4.
Details: No new business logic — every decision is made by the same pipeline/*.py functions the batch
path already uses and the existing test suite already covers. Why this matters beyond code reuse: it
guarantees a transaction gets the identical outcome regardless of which entry point (batch file feed or
API) submitted it — a hard requirement given both paths write into the same shared/results/ audit trail.
```

```
Task: API Tests
Prompt: "Create tests/test_api.py using FastAPI's TestClient (same pattern as tests/test_frontend.py),
isolated via tmp_path, covering: submit-and-get-settled, submit-and-get-flagged, submit-and-get-rejected,
duplicate submission returns the identical result (not a second write), GET on an unknown transaction_id
returns 404."
File to CREATE: tests/test_api.py
Serves: Quality/coverage requirement from PLAN-CHALLENGE.md's rubric mapping; MLO-C4 (the duplicate-
submission test is this objective's actual verification).
Details: Reuse tests/conftest.py's shared_dir/sample_transaction fixtures rather than duplicating fixture
setup — same discipline as every other test file in this project.
```

```
Task: Demo Script
Prompt: "Create demo/txn-{settled,flagged,rejected}.json (3 fixture transactions with transaction_ids
distinct from sample-transactions.json's TXN00N ids, one per terminal outcome) and demo.sh: starts
api/server.py via uvicorn in the background, polls GET /health in a loop until it responds (never a fixed
sleep as the sole wait), submits all 3 fixtures via curl POST /transactions, prints each result and the
full GET /transactions listing, then kills the background server on exit (trap)."
File to CREATE: demo.sh, demo/txn-settled.json, demo/txn-flagged.json, demo/txn-rejected.json
Serves: MLO-C5 directly.
Details: chmod +x demo.sh. Why a trap on EXIT for the kill, not a kill at the end of the script's happy
path: a script that only cleans up on success leaves an orphaned background server running on failure —
the exact kind of thing a "zero manual steps" demo script must never do, since the whole point is not
needing anyone to notice and clean up by hand.
```
