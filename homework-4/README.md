# Homework 4 — 4-Agent Bug-Fixing Pipeline

## 👤 Author

Ilya Chantsov ([@il4v](https://github.com/il4v)) — illia4v@gmail.com

## Overview

A single-command, 4-agent pipeline that researches, fixes, security-reviews, and tests bugs in a small
sample app. Run order: **Bug Research Verifier → Bug Fixer → Security Verifier + Unit Test Generator**, all
invoked automatically by `./run-pipeline.sh` — no manual per-agent invocation.

The sample app, **Dev Trivia Challenge**, is a Flask + vanilla-JS programming trivia quiz with a persisted
leaderboard, seeded with 2 intentional bugs and 1 intentional security issue for the pipeline to find and fix:

| # | Issue | Where | Symptom before fix |
|---|---|---|---|
| 1 | Off-by-one scoring | `src/app.py`, `compute_score()` | All-correct run scores 9/10, not 10/10 — last question never checked |
| 2 | Leaderboard sorted ascending | `src/app.py`, `sorted_leaderboard()` | Lowest score displayed above the highest |
| 3 | Stored XSS via player name | `src/static/quiz.js`, `showLeaderboard()` | A `<img src=x onerror=...>` name executes for anyone viewing the leaderboard |

All three are fixed by the pipeline; 24 pytest tests and 18 Jest tests pass afterward.

## Architecture

```
Bug Research Verifier ──▶ Bug Fixer ──┬──▶ Security Verifier
                                        └──▶ Unit Test Generator
```

- **4 agents** (`agents/*.agent.md`): `research-verifier`, `bug-fixer`, `security-verifier`,
  `unit-test-generator`.
- **2 skills** (`skills/*.md`): `research-quality-measurement` (rating levels: Verified / Mostly Verified /
  Needs Rework / Unverifiable) and `unit-tests-FIRST` (Fast/Independent/Repeatable/Self-validating/Timely).
  Both are read explicitly by the relevant agent via the `Read` tool, rather than relying on Claude's own
  skill auto-discovery — that mechanism only resolves skills from `.claude/skills/`, not the flat `skills/*.md`
  path this homework's deliverable structure requires. Deterministic beats hoping a one-shot pipeline stage
  triggers a skill by description match.
- **Invocation mechanism**: `run-pipeline.sh` invokes each agent directly via `claude -p`, reading its
  `model:`/`tools:` frontmatter and prompt body straight out of `agents/*.agent.md` — not via Claude Code's
  named-subagent auto-discovery (which needs `.claude/agents/`, and is designed for one interactive session
  picking a helper on the fly, not a deterministic, ordered, stop-on-failure batch pipeline).
- **"Bug Researcher" and "Bug Planner"** (mentioned in `TASKS.md`'s run order) are not among the 4 *required*
  agents, so they're folded into simple file hand-offs rather than live agent stages: `bug-context.md`
  (hand-written, with real file:line citations) is used directly as `research-verifier`'s input, and doubles
  as `bug-fixer`'s implementation plan once research passes the quality gate.
- **Idempotent re-runs**: each bug's `context/bugs/<NNN>/PIPELINE-STATUS.md` tracks per-stage completion.
  Running the pipeline again on an already-fully-processed bug costs zero agent calls — it just re-runs the
  real test suite as a free confirmation, and only reopens the full agent chain if that confirmation itself
  fails (e.g. something regressed underneath a stale marker).

## Model choice per agent

| Agent | Model | Why |
|---|---|---|
| `research-verifier` | **opus** | Fact-checking file:line citations against real source and catching subtle mismatches (wrong line, mismatched snippet, misdiagnosed root cause) is precision-over-speed work — same reasoning tier as security review. |
| `bug-fixer` | **sonnet** | By the time this runs, the plan already specifies exactly what to change — disciplined execution against a known plan, not open-ended reasoning, so a faster/cheaper mid-tier model is appropriate. |
| `security-verifier` | **opus** | Judging exploitability and severity correctly needs the same reasoning tier as research verification — both false positives and false negatives are costly here. |
| `unit-test-generator` | **haiku** | Test scaffolding for a small, already-fixed, well-scoped diff is comparatively mechanical (arrange/act/assert, one behavior per test, follow the FIRST skill) — fastest/cheapest tier keeps the pipeline quick. |

## AI tools used

Claude Code (Sonnet 5) was used throughout: designing the agent/skill prompts, brainstorming and speccing the
sample app (a short structured interview — genre → stack → scope → which bugs → which security issue →
storage → theme — before any code was written, documented in `docs-tmp/GAME-SPEC.md`), implementing the app
and its seeded bugs, writing `run-pipeline.sh`, and iteratively debugging the pipeline against several real
runs (full account of what broke and why is in the PR description).

Two things worth calling out specifically:
- Claude Code's `/agents` creation wizard and the `/skill-creator` plugin were both assumed available at the
  start of the prep phase but turned out to be unavailable in this setup — agents and skills were hand-created
  directly from prepared "feed" files (`docs-tmp/agent-feeds/`, `docs-tmp/skill-feeds/`) instead.
- Several pipeline bugs were only caught by reading the actual run logs (`docs-tmp/pipeline-run-*.log`) line
  by line rather than trusting each agent's own summary text — a naive text-matching gate false-triggered on
  prose that merely *discussed* a failure verdict, a persistent shell cwd silently misdirected a file write,
  and two pipeline stages were marking themselves done without checking their own output file existed.

## Repository structure

```
homework-4/
├── README.md, HOWTORUN.md
├── run-pipeline.sh              # single-command pipeline entry point
├── agents/                      # the 4 required agents
├── skills/                      # the 2 required skills
├── context/bugs/<001|002|003>/  # per-bug: bug-context, research, plan, fix-summary,
│                                 #   security-report, test-report, PIPELINE-STATUS
├── src/                         # the sample app (Flask + static JS/HTML/CSS)
├── tests/                       # pytest (backend) + Jest (frontend)
├── package.json / jest.config.js
└── docs/screenshots/            # pipeline run, fixes, security scan, tests
```
