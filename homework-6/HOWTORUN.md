# HOWTORUN — Transaction Processing Pipeline

All commands below assume you're in the `homework-6/` directory.

## 1. Setup

```bash
python3 -m pip install -r requirements.txt
```

No `.env` or external services are required — the pipeline, dashboard, and custom MCP server are all
local, file-based, and unauthenticated by design (see `specification.md` §3 "Scope: no
authentication/authorization layer").

## 2. Run the pipeline

```bash
python3 orchestrator.py
```

Expected output: a per-transaction log line per stage, then a summary block, e.g.:

```
Pipeline run summary
  Total records in shared/results/: 8
  flagged_for_review: 3
  rejected: 2
  settled: 3
```

Every transaction in `sample-transactions.json` lands in `shared/results/` as one JSON file per
`transaction_id`. Re-running `orchestrator.py` is safe — already-processed transactions are skipped
(idempotent), never duplicated. To force a clean re-run from scratch:

```bash
python3 -c "import orchestrator; orchestrator.reset_shared_dirs()"
python3 orchestrator.py
```

(This clears `shared/{input,processing,output}/` — never `shared/results/`, which is the audit trail.)

## 3. Validate without running the full pipeline

```bash
python3 pipeline/validator.py --dry-run
```

Reports total/valid/invalid counts and rejection reasons directly against `sample-transactions.json`,
without touching `shared/` at all.

## 4. Run the web dashboard

```bash
python3 -m uvicorn frontend.server:app --port 8000
```

Open `http://127.0.0.1:8000` in a browser. It shows total/settled/flagged/rejected counts and a table of
every transaction with its outcome and reason/flags — read-only, reflecting whatever is currently in
`shared/results/` (run step 2 first if it's empty).

## 5. Run the tests and check coverage

```bash
python3 -m pytest --cov=pipeline --cov=frontend --cov=mcp --cov-report=term-missing --cov-fail-under=80
```

38 tests, isolated from the real `shared/` directory via `tmp_path` fixtures (`tests/conftest.py`).
Current coverage: 92%. The same check runs automatically as a Claude Code hook
(`.claude/hooks/check-coverage.sh`) and blocks `git push` if coverage drops below 80%.

## 6. Use the Claude Code slash commands

Inside a Claude Code session opened in `homework-6/`:

- `/write-spec` — (re)generates `specification.md` and extends `agents.md`.
- `/run-pipeline` — clears `shared/`, runs the full pipeline, and reports a summary plus any rejections.
- `/validate-transactions` — runs the validator in `--dry-run` mode and reports a results table.

## 7. Start the MCP servers

Both are declared in `.mcp.json` and connect automatically when this directory is opened in Claude Code:

- `context7` — general library/framework documentation lookups (used during code generation; see
  `research-notes.md` for the actual queries run).
- `pipeline-status` — the custom FastMCP server (`mcp/server.py`), exposing:
  - tool `get_transaction_status(transaction_id: str)`
  - tool `list_pipeline_results()`
  - resource `pipeline://summary`

To run the custom server standalone (outside Claude Code) for manual testing:

```bash
python3 mcp/server.py
```

## 8. Coverage-gate hook — how it fires

`.claude/settings.json` registers a `PreToolUse` hook on the `Bash` tool. Any Bash command containing
`git push` triggers `.claude/hooks/check-coverage.sh`, which runs the same coverage command as step 5 and
blocks the push (exit code 2, with the actual coverage % in the error message) if it's below 80%. Any
other Bash command is a no-op for this hook.
