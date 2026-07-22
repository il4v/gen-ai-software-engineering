# Editor/AI Rules — Virtual Card Lifecycle (homework-3)

Domain rules, compliance constraints, and testing expectations live in `agents.md` — read that
first. This file is narrower: naming conventions, structural patterns, and anti-patterns specific to
working in this directory's documents (and, if ever implemented, this codebase).

## Scope reminder

This homework is **documentation-only** — `specification.md`, `agents.md`, this rules file, and
`README.md`/`HOWTORUN.md` are the deliverables. Do not generate application code, API
implementations, or UI here; if asked to "implement" something in this directory, redirect to
extending the specification instead.

## Naming conventions

- **Entities**: PascalCase singular nouns matching `data-model.md`'s naming (`VirtualCard`,
  `SpendLimit`, `LimitOverride`, `Transaction`, `AuditEntry`, `RateLimitCounter`, `IdempotencyKey`).
  Don't invent a synonym for an entity that already has a name in the spec.
- **Error codes**: `snake_case`, specific and outcome-named, never generic
  (`account_not_in_good_standing`, not `invalid_input`; `conflict_first_request_won`, not
  `conflict`).
- **Mid-level objectives**: referenced as `MLO-N` throughout `specification.md` — use this exact
  tag format when cross-referencing, not "objective 3" or "the freeze one."
- **Task IDs**: sequential, unpadded (`T001`, `T070`) matching the low-level task numbering already
  in `specification.md` — don't renumber existing tasks when adding new ones; append.
- **Findings from a consistency/analysis pass**: `C#` (critical), `H#` (high), `M#` (medium), `L#`
  (low) — matching the severity convention already used for the Phase 10 remediation tasks.

## Structural patterns to follow

- Every new low-level task must end with an **Acceptance:** line stated as a checkable definition
  of done — no task without one.
- Every new mid-level objective must be phrased as an **observable outcome** ("X blocks Y within Z
  seconds"), not an implementation instruction ("implement X").
- Every new numeric target must carry a one-line rationale in the same table row/bullet where it's
  introduced — never a bare number with no justification, and never split across two locations.
- Every new edge case goes into the Edge Cases & Failure Modes table with both a user-visible
  outcome and (where relevant) an audit/compliance implication column — never a standalone prose
  paragraph elsewhere in the document.

## Anti-patterns to avoid

- Don't add a new "Security Considerations" or "Best Practices" section that duplicates content
  already in Non-Functional & Policy or `agents.md` — extend the existing section instead of
  creating a parallel one.
- Don't describe money handling, audit-trail separation, or permission independence in prose without
  pointing to the concrete section that enforces it — a restated principle with no enforcement
  mechanism is not useful here.
- Don't add a task, objective, or edge case that can't be traced to an existing (or newly added)
  mid-level objective — per `agents.md`'s traceability requirement.
- Don't soften a stated numeric target to a vague adjective ("fast," "soon," "reasonable") when
  editing — if a target changes, replace it with a new number and rationale, never remove the number.
- Don't reintroduce a single combined ops permission, a `closed → active` transition, or any
  float-typed money field — these were explicitly rejected during authoring (see `agents.md` →
  Security & compliance constraints) and reintroducing them is a regression, not a simplification.
