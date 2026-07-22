# How to Review / How to Continue

This homework is **documentation-only** — there is no application to run, so this file replaces the
usual "how to run the app" guide with two things instead: how to review this specification package,
and how a future engineer would take it from spec to running code.

## How to review this specification

Suggested reading order:

1. **`specification.md`** — the graded core. Read top to bottom: High-Level Objective → Mid-Level
   Objectives → Non-Functional & Policy → Implementation Notes → Context → Low-Level Tasks → Edge
   Cases & Failure Modes → Verification → Performance → Assumptions.
2. **`agents.md`** — the domain-level rules (FinTech/banking non-negotiables) every task and
   objective in `specification.md` was written to satisfy.
3. **`.claude/CLAUDE.md`** — narrower editor/AI conventions (naming, structure, anti-patterns) for
   anyone extending these documents.

## How a future engineer would continue this

This spec was authored using `spec-kit`'s phased workflow (`speckit-constitution` →
`speckit-specify` → `speckit-clarify` → `speckit-plan` → `speckit-tasks` → `speckit-analyze`), stopping
before `speckit-implement` since HW3 excludes code. To continue toward a working implementation:

1. Install `spec-kit` (`uv tool install specify-cli --from git+https://github.com/github/spec-kit.git`).
2. Run `specify init` in a project workspace with the same feature description used here (see
   `specification.md`'s High-Level Objective and Mid-Level Objectives as the input).
3. The `speckit-plan` and `speckit-tasks` outputs that produced this document's Implementation
   Notes, Context, and Low-Level Tasks sections can be regenerated or reused directly — the
   Low-Level Tasks section is already written in a task-per-line, acceptance-criterion format
   suitable for direct execution.
4. Run `speckit-implement` against the resulting task list once ready to write code — at that point,
   `agents.md` and `.claude/CLAUDE.md` in this directory become the operating rules for whichever
   agent or engineer does the implementation.

## Why there's no "install/run/test" section

Standard homework submissions in this course include environment setup, run instructions, and a
testing guide. This homework's task (`TASKS.md`) explicitly scopes out code, APIs, and UI — "no
implementation required." The **Verification** section of `specification.md` documents the test
categories a future implementation would use (contract tests, integration tests, a periodic
reconciliation check), but none of them execute here, since there is no code to run them against.
