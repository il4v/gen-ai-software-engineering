# Agent / AI Operating Guidelines — Virtual Card Lifecycle

Derived from the project constitution authored during `speckit-constitution` (see `HOWTORUN.md` for
provenance). These rules govern any AI agent (or human) producing or extending artifacts for this
project — specification content, hypothetical service designs, or (if this feature is ever
implemented beyond this homework's documentation-only scope) code.

## Tech stack assumptions

- **Language/runtime**: Python 3.12 across all owned services, chosen for first-class `Decimal`
  support.
- **Service framework**: FastAPI + Pydantic for request/response validation (including `Decimal`
  fields); SQLAlchemy over PostgreSQL `NUMERIC` columns for storage.
- **Topology**: five independently deployable backend services (Card Issuing, Ledger, Limits,
  Audit, Notification) with no shared database and no direct cross-service DB access — every
  interaction goes through a documented contract.
- **No frontend**: this feature is backend-only; a client/mobile/web UI is explicitly out of scope.

## Domain rules (banking / FinTech, non-negotiable)

1. **Money as Decimal, never float.** Every monetary value is an integer minor unit or an explicit
   `Decimal`, always paired with an ISO 4217 currency code. Floating-point money is prohibited in
   specs, data models, calculations, and stored values, in code and in documentation examples alike.
2. **Idempotency is first-class.** Every state-changing write requires an explicit
   idempotency-key contract (how a retry is detected, what's returned for a duplicate, expiry).
   Never defer this as "an implementation detail to figure out later."
3. **Audit trail ≠ application logging.** Every sensitive action produces an immutable,
   attributable audit record (who/what/when/why) in a store distinct from operational logs. Never
   store full PAN/CVV/full account numbers in the audit trail or anywhere except one opaque
   token in the Audit Service.
4. **Data privacy and permission boundaries are a compliance surface.** State explicitly who can
   view masked vs. unmasked sensitive fields and who can override/reverse a state change. The three
   permissions (`unmask`, `override`, `audit_viewer`) are independent — never assume holding one
   implies another.
5. **Explicit error semantics, validation, and concurrency behavior.** Every write path states its
   validation rules, its error codes, and its resolved concurrency behavior. "Handle errors
   gracefully" is never an acceptable resolution — state the actual outcome.
6. **Verification and numeric performance targets are non-negotiable.** Every objective needs a
   stated verification method; every latency/throughput-sensitive flow needs a numeric target.
   Hypothetical numbers are fine only when labeled "assumed target" with a one-line justification.

## Assumed compliance posture

This project claims a **PCI-DSS-style posture** for cardholder data handling and a **SOC2-style
posture** for the audit trail — an assumed posture for a hypothetical regulated environment, not a
claim of actual certification. Label it as such on first reference in any new artifact; never imply
the project has been audited or certified.

## Documentation conventions

- **Money**: `Decimal` or integer minor units + ISO 4217 code, never a bare number.
- **Timestamps**: ISO 8601 UTC everywhere.
- **Currency codes**: ISO 4217 three-letter codes only.
- **IDs**: UUIDs for all entity primary keys; idempotency keys are client-supplied UUIDs.

## Testing / verification expectations (documentation-only bar)

This homework ships no code, so the testing bar is enforced in the artifacts themselves, not in an
executed suite:

- Every low-level task ends with a checkable acceptance criterion (a definition of done an
  implementer could tick off without guessing).
- Every mid-level objective states, in prose, which verification method would confirm it (named
  test category, reconciliation check, or review step) — never just "this will be tested."
- A task with no acceptance criterion, or an objective with no stated verification method, is
  treated as incomplete — a docs-only deliverable does not relax this bar.
- If this feature is ever implemented: tests are written before implementation per user story;
  contract tests validate request/response/error shapes against `contracts/*.md`; integration tests
  validate cross-service flows and timing targets; a periodic reconciliation check compares
  action counts to audit-entry counts (never assume 1:1 without verifying it).

## Security & compliance constraints for any agent working on this project

- Never write example payloads, sample data, or screenshots containing a realistic-looking full
  PAN or CVV — always show a masked/tokenized form, even in illustrative content.
- Never propose storing a PAN-derived reference anywhere other than the Audit Service, and only as
  an opaque token.
- Never propose a single combined "ops" role that grants `unmask` + `override` + `audit_viewer`
  together — they must remain independently grantable.
- Never propose silently clamping, silently dropping, or silently overwriting a conflicting request
  — every conflict must produce an explicit, named error the caller can act on.
- Never propose a code path that lets a `closed` card become `active`/`frozen` again — closure is
  terminal; replacement always creates a new card, never reopens the old one.

## How this agent should treat edge cases

- Treat every edge case in `specification.md` → Edge Cases & Failure Modes as a first-class
  requirement, not an afterthought — if extending the spec, add new edge cases to that table with
  both the user-visible outcome and audit implication, never as a generic "handle errors" bullet.
- When a new ambiguity is discovered (a new conflict type, a new permission interaction, a new
  partial-failure path), treat it the way the original authoring process treated the
  `speckit-clarify`/consistency-check findings: resolve it explicitly, document the resolution and
  its rationale, and update the traceability (which mid-level objective it serves, which task closes
  it) rather than leaving it implicit.
- Prefer idempotent, first-request-wins resolutions for new conflict types unless a stated business
  reason requires a different rule — and if a different rule is chosen, document why, following the
  precedent set for freeze/unfreeze vs. limit-change conflict resolution in Implementation Notes →
  Concurrency.

## Traceability requirement

Every low-level task must reference the mid-level objective it serves, and every mid-level
objective must trace back to the high-level objective. An agent adding a new task or objective that
cannot be traced this way should treat it as out of scope until it is linked or removed.
