# HOWTORUN — Homework 4

## Prerequisites

- Python 3.11+ and `pip`
- Node.js + `npm` (for the frontend test suite)
- [Claude Code CLI](https://code.claude.com/) installed and authenticated (`claude --version`) — required
  only to actually **run the pipeline**; the app itself and its tests need no AI tooling at all.

## 1. Run the sample app

```bash
cd homework-4/src
python3 -m venv .venv && source .venv/bin/activate   # first time only
pip install -r requirements.txt
python3 app.py
```

Open **http://localhost:5000** in a browser. Play the quiz, submit a score, view the leaderboard.

## 2. Run the tests

Backend (from `homework-4/`, no `cd` needed — the venv from step 1 must be active):

```bash
pytest tests/ -v
```

Expect **24 passed**.

Frontend (from `homework-4/`):

```bash
npm install    # first time only
npm test
```

Expect **18 passed**.

## 3. Run the 4-agent pipeline

From `homework-4/`, with the Python venv active (step 1) so `pytest` is on `PATH`, or don't worry about it —
`run-pipeline.sh` falls back to `src/.venv/bin/pytest` or `python3 -m pytest` automatically if a bare `pytest`
isn't found:

```bash
./run-pipeline.sh
```

This invokes, for each of the 3 seeded bugs in `context/bugs/`, all 4 required agents in order:
`research-verifier` → `bug-fixer` → `security-verifier` → `unit-test-generator`. No manual per-agent steps.

Every run also writes a full log to `docs-tmp/pipeline-run-<timestamp>.log` (in addition to the terminal),
timestamped at run start.

**Re-running is cheap and safe.** Each bug's `context/bugs/<NNN>/PIPELINE-STATUS.md` tracks which of the 4
stages already completed. A bug that's fully done gets a free test-suite re-confirmation on the next run
instead of any agent call, and only reopens automatically if that confirmation itself fails.

## 4. Inspect the results

Per bug, under `context/bugs/<NNN>/`:

| File | What it is |
|---|---|
| `bug-context.md` | The seeded issue, as documented by hand before the pipeline ran |
| `research/codebase-research.md`, `research/verified-research.md` | The (stand-in) research input and the Research Verifier's independent check of it |
| `implementation-plan.md` | What the Bug Fixer was told to change |
| `fix-summary.md` | What the Bug Fixer actually changed, and the test result |
| `security-report.md` | The Security Verifier's findings on the changed code |
| `test-report.md` | The Unit Test Generator's new tests and FIRST compliance |
| `PIPELINE-STATUS.md` | Per-stage completion tracking |

## Troubleshooting

- **`pytest: command not found`** when running the app's own tests directly (not via the pipeline, which
  handles this automatically): activate the venv from step 1, or run `python3 -m pytest tests/ -v` instead.
- **`claude: command not found`**: only step 3 (running the pipeline itself) needs the Claude Code CLI —
  steps 1 and 2 don't.
