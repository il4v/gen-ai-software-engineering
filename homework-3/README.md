# Homework 3 — Virtual Card Lifecycle Specification

## 👤 Author

Ilya Chantsov ([@il4v](https://github.com/il4v)) — illia4v@gmail.com

## Student & Task Summary

Submission for Homework 3: Specification-Driven Design. The assignment asks for a
documentation-only specification package for a FinTech feature — no code, API, or UI — graded on
how well the specification is layered from a high-level objective down to executable, traceable
low-level tasks, and on how thoroughly it treats edge cases, verification, and performance as
first-class content rather than afterthoughts.

Choosen project goal: **virtual card lifecycle** (create → activate → freeze/unfreeze → adjust spend limits → view transactions → replace/close, plus an ops/compliance oversight view) as the feature, set in a
hypothetical regulated environment with an assumed PCI-DSS-style/SOC2-style compliance posture. The
submission consists of:

- **`specification.md`** — the full layered spec: 1 high-level objective, 10 mid-level objectives,
  non-functional/policy requirements, implementation notes, beginning/ending context, 82 low-level
  tasks, an edge-cases table, a verification-method table, and a 10-target performance table.
- **`agents.md`** — domain-level operating rules for any AI/engineer working on this project.
- **`.claude/CLAUDE.md`** — editor-level naming/structure conventions, kept separate from
  `agents.md` so domain rules and editor conventions don't get duplicated across two files.
- **`HOWTORUN.md`** — since there's no application to run, this documents how to review the spec and
  how a hipotetical future engineer would continue it toward implementation.

[GitHub's `spec-kit`](https://github.com/github/spec-kit) was as the primary authoring tool — its
phased workflow (constitution → specify → clarify → plan → tasks → analyze) maps closely onto the
layered structure this homework asks for, and its `speckit-clarify` and `speckit-analyze` phases
did real, substantive work: `speckit-clarify` forced concrete decisions on five previously-vague
points (availability targets, rate limits, ops-initiated actions, audit-permission separation,
replacement-failure handling), and `speckit-analyze` caught three real design gaps after the initial
plan and task list were drafted (see Rationale below).

## Rationale

**Why this layered structure**: I followed `spec-kit`'s phase boundaries deliberately because they
map almost one-to-one onto this homework's required layers — `speckit-specify` produces the
high-level/mid-level objective layer, `speckit-plan` produces the context/implementation-notes
layer, and `speckit-tasks` produces the low-level task layer with dependency ordering already
attached. This kept the traceability requirement (every task ties back to an objective) close to
automatic rather than something I had to retrofit afterward.

**Why 10 mid-level objectives instead of the ~5 the assignment's own template suggests**: six of the
ten (MLO-1–6) map directly to the six user stories the spec authoring process produced. The other
four (MLO-7–10: idempotency, audit trail, permission boundaries, concurrency resolution) were
originally expressed only as constitution *principles*, not objectives with their own verification
method — I promoted them to full objectives because each has cross-cutting acceptance criteria that
don't belong to any single user story, and the homework's grading bar specifically wants
cross-cutting concerns treated as first-class, not folded into a generic "security" bullet.

**How I chose performance targets**: every numeric target in the Performance section (SC-001–SC-010)
is explicitly labeled an "assumed target," each with a one-line rationale tied to a concrete
business reason — e.g. the freeze-to-block latency (2s p95) is deliberately tighter than the
transaction-visibility latency (5s p95) because a stolen-card exposure window is a materially worse
outcome than a slightly delayed transaction view. I didn't pick round numbers arbitrarily; each was
chosen by asking "what failure does this number prevent, and is that failure worse than the cost of
hitting the number."

**How I chose verification depth**: since this homework ships no code, the constitution I authored
in `speckit-constitution` established a documentation-only testing bar — every low-level task ends
with a checkable acceptance criterion, and every mid-level objective states its verification method
(named test category, reconciliation check, or review step) in `specification.md`'s Verification
table. I treated "no code" as a reason to be *more* explicit about verification, not less, since the
artifacts themselves are the only enforcement mechanism available.

**On the `speckit-analyze` findings**: running the consistency-check phase after the initial plan
and tasks were drafted surfaced three real gaps — Card Issuing Service had no idempotency-key
contract (finding C1), the authorization flow never actually checked card state before evaluating
limits (finding H1), and ops-initiated freeze/unfreeze had no permission gate defined (finding H2).
I kept these as an explicit "Phase 10 — Consistency-Check Remediation" section in
`specification.md`'s Low-Level Tasks rather than silently folding the fixes back into their
"natural" phases, so the finding-to-fix trace stays auditable — this mirrors how a real compliance
review would expect gap remediation to be documented, not quietly patched.

## Industry Best Practices

| Practice | Where it appears |
|---|---|
| Money as `Decimal`/integer minor units, never float, always with an ISO 4217 code | `agents.md` Principle 1; `specification.md` → Implementation Notes → "Money, timestamps, currency"; enforced in Low-Level Tasks 9, 35, 66 |
| Idempotency as a first-class, not deferred, concern | `agents.md` Principle 2; `specification.md` → MLO-7, Implementation Notes → "Idempotency"; Low-Level Tasks 10, 70–73 |
| Audit trail kept structurally distinct from application/operational logging | `agents.md` Principle 3; `specification.md` → MLO-8, Non-Functional & Policy → "Audit & logging"; Low-Level Task 14 |
| Numeric performance targets, explicitly labeled "assumed" with a stated rationale, instead of vague adjectives | `agents.md` Principle 6; `specification.md` → entire Performance section (SC-001–SC-010) |
| Permission boundaries treated as a compliance surface, not just a security concern; independently-grantable permissions | `agents.md` Principle 4; `specification.md` → MLO-9, Implementation Notes → "Permission model" |
| Concurrency and partial-failure states given explicit, deterministic resolution rules rather than "handle gracefully" | `agents.md` Principle 5; `specification.md` → MLO-10, Implementation Notes → "Concurrency"; Edge Cases & Failure Modes table |
| Assumed compliance posture (PCI-DSS-style / SOC2-style) named explicitly rather than a vague "industry standards" gesture | `agents.md` → "Assumed compliance posture"; `specification.md` → Non-Functional & Policy → "Security & data privacy" |
| Traceability from every low-level task back to a mid-level objective, and every objective back to the high-level objective | `agents.md` → "Traceability requirement"; `specification.md` → every Low-Level Task phase heading |
| Explicit gap-remediation tracking after a cross-artifact consistency check, rather than silent fixes | `specification.md` → Low-Level Tasks → "Phase 10 — Consistency-Check Remediation" |

---

## Note on submission-requirements reinterpretation

The root repository `README.md`'s general submission checklist (`HOWTORUN.md`, screenshots,
"Functionality" grading weight) assumes every homework produces a running application. **Homework 3
is explicit that it does not** — `TASKS.md` states "no coding required" and scopes out code, APIs,
and UI entirely. This section states, explicitly, how those generic requirements are reinterpreted
for a documentation-only deliverable, so a reviewer isn't confused by their absence in the usual
form:

- **`HOWTORUN.md`** → repurposed as **"How to Review / How to Continue"** (see `HOWTORUN.md` in this
  directory) — a suggested reading order through the specification package, plus the `spec-kit`
  commands a future engineer would run to continue from this spec toward a working implementation.
  There is no install/run/test section because there is nothing to install, run, or test.
- **Screenshots** → since there is no UI, the expected visual evidence is: (a) terminal screenshots
  of the `spec-kit` authoring session (the `speckit-constitution` and `speckit-clarify` phases are
  the most substantive), and (b) AI prompt/response screenshots showing iteration on the
  specification content. These go in `docs/screenshots/` per the root README's convention, standing
  in for "the running solution."
- **"Functionality" (30% grading weight)** → reinterpreted, for this homework only, as the internal
  consistency and traceability of the specification itself — whether an agent handed
  `specification.md` and `agents.md` could execute the low-level tasks without guessing, and whether
  every task/objective/edge-case traces back to a stated goal. There is no running code whose
  functionality could otherwise be assessed.

This reinterpretation applies **only** because `TASKS.md` explicitly authorizes it for this specific
homework; it is not a general exemption from the root README's requirements.
