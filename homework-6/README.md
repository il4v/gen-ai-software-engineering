# Transaction Processing Pipeline — Homework 6 Capstone

**Created by Illia Chantsov**

## What this is

This is an AI-powered transaction processing pipeline: it takes a batch of raw financial transactions
(`sample-transactions.json`), runs each one through three sequential stages — validation, fraud
detection, and settlement — and produces one auditable outcome record per transaction in
`shared/results/`, plus a printed run summary. A read-only web dashboard shows the results, and a custom
MCP server makes them queryable by an AI agent (in addition to a human).

The workflow that built it followed a 4-agent structure — a specification agent, a code-generation
agent, a unit-test agent, and a documentation agent — each registered as a real Claude Code subagent in
`.claude/agents/`, plus 3 slash commands (`/write-spec`, `/run-pipeline`, `/validate-transactions`) and a
coverage-gate hook that blocks `git push` if test coverage drops below 80%. See `specification.md` for
the full technical spec and `agents.md` for the domain rules every agent follows.

## Pipeline stages

- **Validator** (`pipeline/validator.py`) — checks required fields, a positive `Decimal` amount, and a
  valid ISO 4217 currency code. Rejects anything that fails, with a specific reason, before it can reach
  fraud detection.
- **Fraud Detector** (`pipeline/fraud_detector.py`) — scores every validated transaction 0–100 on three
  signals (high value, cross-border, unusual timing) and flags anything reaching a score of 50 for manual
  review instead of letting it settle automatically.
- **Settlement** (`pipeline/settlement.py`) — deducts a flat 0.5% processing fee (rounded `ROUND_HALF_UP`
  to 2 decimal places) and assigns a settlement batch/date for every transaction that clears fraud review.

## Architecture

```
                       sample-transactions.json
                                 |
                                 v
                        shared/input/  (orchestrator wraps each record in an envelope)
                                 |
                                 v
                    +---------------------+
                    |     Validator       |--reject--> shared/results/ (status=rejected)
                    +---------------------+
                                 |
                              validated
                                 v
                    +---------------------+
                    |   Fraud Detector    |--flag---> shared/results/ (status=flagged_for_review)
                    +---------------------+
                                 |
                              cleared
                                 v
                    +---------------------+
                    |     Settlement      |---------> shared/results/ (status=settled)
                    +---------------------+
                                 |
                                 v
                        shared/results/ (audit trail, 1 record per transaction)
                          /                \
                         v                  v
              Web Dashboard          Custom MCP Server
           (frontend/server.py)      (mcp/server.py: get_transaction_status,
           read-only, GET /api/*      list_pipeline_results, pipeline://summary)
```

## Tech stack

| Layer | Choice |
|---|---|
| Language | Python 3.11 |
| Pipeline stages / orchestrator | Plain Python modules, no framework — file-based envelope protocol only |
| Web dashboard | FastAPI + `StaticFiles`, plain HTML/JS/CSS (no frontend framework) |
| Custom MCP server | FastMCP (`mcp/server.py`) |
| Docs/library lookups during code generation | `context7` MCP server |
| Tests | pytest + pytest-cov + pytest-asyncio |
| Coverage gate | Claude Code `PreToolUse` hook (`.claude/hooks/check-coverage.sh`), blocks `git push` below 80% |

## Where to go next

- `specification.md` — the full technical spec (5 required sections, one Low-Level Task per pipeline
  stage/component, each traced to the objective it serves).
- `agents.md` — domain rules every AI agent working on this project follows (money handling, idempotency,
  crash recovery, audit trail vs. logging, PII masking).
- `HOWTORUN.md` — step-by-step instructions to run the pipeline, the dashboard, the tests, and the MCP
  servers.
- `research-notes.md` — the context7 queries run during code generation.
