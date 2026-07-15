# Virtual Card Lifecycle — Specification

> Layered specification for a virtual card lifecycle feature in a hypothetical regulated (FinTech)
> environment. No code is implemented — see `homework-3/TASKS.md` for the homework's scope boundary
> (documentation-only). Derived from a `spec-kit`-driven authoring process; see `HOWTORUN.md` for how
> this was produced and how a future engineer would continue it.

---

## High-Level Objective

Give end-users self-service control over a virtual card's full lifecycle — create, activate,
freeze/unfreeze, adjust spend limits, view transactions, and replace/close — while giving
ops/compliance masked-data visibility, justified override authority, and a complete, independently
gated audit trail, so that a stolen or misused card can be neutralized in seconds and every
state-changing action is attributable after the fact.

**Scope boundary**: this feature covers the five backend capabilities above for a single card per
request. It explicitly does **not** cover physical card issuance/fulfillment, dispute adjudication,
merchant-side integrations, card-network settlement mechanics, or any client/mobile/web UI — those
are out of scope.

---

## Mid-Level Objectives

Each objective is observable — a reviewer can point to a concrete before/after state that confirms
it, not just an intention.

1. **MLO-1 — Card Creation & Activation**: An eligible end-user can create a virtual card (starts
   `inactive`) and activate it (`inactive` → `active`) before it can transact; an ineligible account
   is rejected without a usable card record.
2. **MLO-2 — Instant Freeze/Unfreeze**: An active card can be frozen by its owner (or an
   authorized ops agent) to immediately block new authorizations, and unfrozen to resume them, with
   the block observable within a stated latency budget.
3. **MLO-3 — Transaction Visibility**: A user can view pending and settled transactions for their
   card in a paginated, bounded view, including after the card is closed.
4. **MLO-4 — Spend Limit Management**: A user can set/adjust daily and per-transaction spend limits
   within platform-defined ranges; ops/compliance can override a limit only with a structured
   justification.
5. **MLO-5 — Replacement & Closure**: A user (or authorized ops agent) can close a card permanently
   or replace it (close old + issue linked new), with no silent reactivation and no false "complete"
   state on partial failure.
6. **MLO-6 — Ops/Compliance Masked Review & Audit**: Ops/compliance sees masked card data by
   default and can review a complete, chronological audit trail, each gated by its own permission.
7. **MLO-7 — Idempotent, Exactly-Once Writes**: Every state-changing write (across all three
   write-accepting services) is safe to retry — a retried request never produces a duplicate
   side effect or a duplicate audit entry.
8. **MLO-8 — Complete, Attributable Audit Trail**: Every state-changing action and every denied
   unauthorized attempt produces exactly one immutable audit record answering who/what/when/why,
   stored separately from operational logs.
9. **MLO-9 — Independent Permission Boundaries**: The `unmask`, `override`, and `audit_viewer`
   permissions are independently grantable — holding one never implies another — and every denied
   attempt is itself audited.
10. **MLO-10 — Deterministic Concurrency Resolution**: Any two conflicting concurrent requests
    against the same card (freeze vs. unfreeze, limit change vs. in-flight authorization) resolve to
    exactly one deterministic outcome, with the losing request rejected (never silently dropped or
    overwritten) and both attempts audited.

---

## Non-Functional & Policy

### Security & data privacy

- **Compliance posture (assumed)**: this project claims a **PCI-DSS-style posture** for cardholder
  data handling (masking/tokenization of PAN and CVV, restricted storage, least-privilege access to
  unmasked fields) and a **SOC2-style posture** for the audit trail (availability, integrity,
  restricted access). This is an **assumed posture for a hypothetical regulated environment**, not a
  claim of actual certification, and every reference to it in this document should be read that way.
- Full PAN/CVV is never persisted outside a single opaque token held only by the Audit Service
  (see Implementation Notes → Data Handling). No other service or artifact may store it.
- Ops/compliance sees masked identifiers (last-4/token) by default; viewing unmasked data requires
  the distinct `unmask` permission, and every such view — allowed or denied — is itself audited.

### Audit & logging

- The audit trail is a **distinct store and a distinct concern from application/operational
  logging** (Principle III) — it is never satisfied by "we log this."
- Every state-changing action (create, activate, freeze, unfreeze, limit change, override, replace,
  close) and every denied unauthorized attempt produces exactly one immutable, attributable audit
  record. Retried requests that hit the idempotency cache produce **zero** additional entries.

### Reliability

- The freeze/authorization-decision path (the primary loss-prevention control) is held to
  **99.95% monthly uptime** with a **recovery time objective (RTO) of 5 minutes** if it becomes
  unavailable — deliberately tighter than the rest of the system, because a stolen-card exposure
  window during an outage is the highest-risk failure mode this feature has. *(Assumed target.)*
- Notification delivery is best-effort and MUST NOT block a freeze/unfreeze/limit-change write from
  completing — a notification failure is never a reason to fail the underlying action.

### Performance targets (assumed, labeled where hypothetical)

See the dedicated **Performance** section below — every numeric target there is a non-functional
requirement, not an implementation detail, and is repeated here by reference rather than duplicated.

---

## Implementation Notes

### Money, timestamps, currency (Documentation Conventions)

- **Money**: every monetary value is an explicit `Decimal`, never a float, always paired with an
  ISO 4217 currency code (e.g., `Decimal("10.00")` with currency `USD`). On the wire, amounts are
  JSON strings, never JSON numbers, to avoid float round-tripping through clients.
- **Timestamps**: ISO 8601 UTC everywhere a point in time is recorded or referenced (e.g.,
  `2026-07-12T14:03:00Z`).
- **Currency codes**: ISO 4217 three-letter codes only; no symbols or ambiguous abbreviations.

### Idempotency (MLO-7)

- Every write to the three write-accepting services (Card Issuing, Ledger, Limits) requires a
  client-supplied `Idempotency-Key` (UUID). Each service persists
  `(key, request_fingerprint_hash, response_snapshot, first_seen_at, expires_at)`; a retried key
  within the 24-hour expiry window returns the stored response unchanged rather than re-executing
  the write. A reused key attached to a materially different request is rejected as a fingerprint
  mismatch, never silently replayed or double-applied.
- This applies uniformly to card creation, activation, freeze, unfreeze, limit change, override,
  replacement, and closure — there is exactly one idempotency mechanism in the system, not a
  bespoke one per service.

### Error semantics & validation

- Every write path states its actual validation rules and error codes — "handle errors gracefully"
  is not an acceptable resolution. Concrete error codes used throughout: `account_not_in_good_standing`,
  `invalid_state_transition`, `permission_denied`, `conflict_first_request_won`, `limit_out_of_range`,
  `stale_version`, `rate_limited`, `card_not_active`, `processor_unavailable`.
- Negative, zero, or out-of-range limit values are rejected with a rule-specific validation error,
  never silently clamped.

### Concurrency (MLO-10)

- Concurrent, conflicting state-change requests on the same card resolve **first-request-wins**: the
  request the system accepts first is applied; any conflicting request still in flight for the same
  card is rejected with an explicit conflict error naming the current authoritative state. This single
  rule is expressed through two mechanisms depending on what "first" means for the entity: a
  timing-window conflict (`conflict_first_request_won`) for freeze/unfreeze (no natural version
  counter), and an optimistic-version conflict (`stale_version`) for limit changes (which already
  carry a `version` field). Both exist solely to satisfy the same first-request-wins rule — an
  implementer should not treat the differing error codes as two unrelated behaviors.

### Data handling / data model

Five hypothetical services own the following entities (full field-level detail intentionally kept
out of this document's body — see the source `data-model.md` produced during authoring, summarized
here):

| Entity | Owning service | Key invariant |
|---|---|---|
| `VirtualCard` | Card Issuing | State ∈ `{inactive, active, frozen, closed}`; `closed` is terminal; ops-initiated state changes require `override` |
| `SpendLimit` | Limits | `Decimal` amounts + ISO 4217; `version` field drives first-request-wins (FR-007) |
| `LimitOverride` | Limits | Requires `reason_code` (enum) + free-text `note`; requester must hold `override` |
| `Transaction` | Ledger | `Decimal` amount; `state ∈ {pending, settled, declined}`; declines carry a specific `decline_reason` |
| `AuditEntry` | Audit (append-only) | No `UPDATE`/`DELETE` path exists; the **only** place any PAN-derived reference is stored, and only as an opaque token |
| `RateLimitCounter` | Limits | Per-card rolling 10-minute window, shared across freeze/unfreeze/limit-change (FR-020) |
| `IdempotencyKey` | Card Issuing, Ledger, Limits (each owns its own) | `(key, fingerprint, response_snapshot, expires_at)`; 24h expiry |
| `Account` | External (referenced only) | `good_standing` boolean, read at card-creation time |

### Permission model (MLO-9)

Three independently-grantable permissions, checked against an assumed external identity system —
holding one never implies another:

- **`unmask`** — view full PAN/CVV.
- **`override`** — change/override limits; initiate freeze/unfreeze/closure/replacement on a user's
  behalf.
- **`audit_viewer`** — view the full audit trail for a card.

### Service topology (assumed, hypothetical)

Five independently deployable services with no shared database and no direct cross-service DB
access — every interaction goes through the contracts summarized below:

- **Card Issuing Service** — owns `VirtualCard`; talks to an external card-network processor via an
  adapter with a circuit breaker (maps processor failures to `processor_unavailable`, never a bare
  500).
- **Ledger Service** — owns `Transaction`; source of truth for balances; checks card state via Card
  Issuing before evaluating limits via Limits Service on every authorization.
- **Limits Service** — owns `SpendLimit`, `LimitOverride`, `RateLimitCounter`; evaluates
  authorizations and enforces the shared rate limit.
- **Audit Service** — owns `AuditEntry` (append-only); the only service permitted to persist any
  PAN-derived reference, and only as an opaque token; deduplicates incoming events by `event_id`
  under at-least-once delivery.
- **Notification Service** (assumed pre-existing) — triggered on freeze/unfreeze/limit-change events;
  best-effort, never blocks the triggering write.

---

## Context

### Beginning context (hypothetical, before this feature)

- An existing external Account/Identity system providing `account_id` + `good_standing` status and
  an existing role/permission system this feature's three permissions plug into.
- An existing external card-network processor providing tokenization and card-network operations.
- An assumed pre-existing Notification Service with a `POST /notify` interface.
- No virtual-card capability, transaction ledger, spend-limit engine, or audit trail yet exist for
  this feature — this specification defines them from scratch.

### Ending context (hypothetical, after this feature is implemented)

- Five independently deployable backend services (Card Issuing, Ledger, Limits, Audit, and the
  pre-existing Notification Service now integrated) as described in Implementation Notes → Service
  topology, each with its own schema per the data model above.
- A documented contract per service (`contracts/*.md` in the authoring workspace) defining every
  endpoint's request/response/error shape and audit implication.
- No client/mobile/web UI — out of scope per the High-Level Objective's scope boundary.

---

## Low-Level Tasks

Organized by user story / mid-level objective, matching the phased breakdown produced during
authoring (82 tasks total). Every task traces to the mid-level objective it serves and ends with a
checkable acceptance criterion, per the Verification section's documentation-only testing bar.
`[P]` marks a task that can run in parallel with siblings in the same group (different files, no
dependencies).

### Phase 1 — Setup (shared infrastructure; serves all MLOs)

1. Create the five-service directory structure (`services/{card-issuing,ledger,limits,audit,notification}/`).
   **Acceptance**: all five directories exist with the full `src/{models,services,api}/` and
   `tests/{contract,integration,unit}/` subtree; `notification/` contains only a contract reference.
2. Initialize Python 3.12 projects (FastAPI, Pydantic, SQLAlchemy) for the four owned services.
   **Acceptance**: dependency install succeeds in each service directory with no conflicts.
3. `[P]` Configure shared linting/formatting (ruff + black).
   **Acceptance**: linter reports zero errors on the empty scaffold.
4. `[P]` Configure local docker-compose (four services + one PostgreSQL each).
   **Acceptance**: `docker-compose up` starts all services and databases without crash-looping.

### Phase 2 — Foundational (blocking prerequisites; serves MLO-7, MLO-8, MLO-9)

5. Set up `VirtualCard` schema/migration (Card Issuing). **Acceptance**: `state` constrained to the
   four-value enum; migration runs cleanly against an empty database.
6. `[P]` Set up `Transaction` + `IdempotencyKey` schema (Ledger). **Acceptance**: `amount` column is
   `NUMERIC(19,4)`, never float; migration runs cleanly.
7. `[P]` Set up `SpendLimit`, `LimitOverride`, `RateLimitCounter`, `IdempotencyKey` schema (Limits).
   **Acceptance**: all four tables exist with `NUMERIC(19,4)` money columns and a `version` column
   on `SpendLimit`.
8. `[P]` Set up append-only `AuditEntry` schema (Audit) with DB grants permitting only
   `INSERT`/`SELECT`. **Acceptance**: an `UPDATE`/`DELETE` attempt from the application role fails
   with a permissions error.
9. Implement a shared money/timestamp/currency validation library. **Acceptance**: rejects a Python
   `float` amount, a non-ISO-4217 currency string, and a non-UTC/non-ISO-8601 timestamp string.
10. Implement a shared Idempotency-Key middleware library (fingerprinting, response-snapshot
    replay, 24h expiry). **Acceptance**: two identical requests with the same key produce one stored
    write and two identical responses; a reused key with a different body is flagged as a mismatch.
11. Implement a shared outbox/event-relay client (event_id generation, at-least-once delivery to
    Audit Service). **Acceptance**: a simulated Audit Service outage causes retry, not drop; a
    duplicate `event_id` delivery is a no-op.
12. Implement Audit Service's `POST /audit/events` ingestion with `event_id` dedup. **Acceptance**:
    posting the same `event_id` twice yields exactly one stored row and a `duplicate_event_id`
    response on the second call.
13. Implement a shared permission-check client for `unmask`/`override`/`audit_viewer`. **Acceptance**:
    a fixture identity granted only `override` fails an `audit_viewer` check and an `unmask` check.
14. `[P]` Configure structured operational logging, explicitly separate from the audit trail.
    **Acceptance**: code review confirms no service writes audit content into operational logs or
    vice versa.
15. `[P]` Configure per-service environment/secrets management. **Acceptance**: each service starts
    reading only its own environment file; no cross-service credential is readable elsewhere.

**Checkpoint**: foundation ready — user-story implementation can begin.

### Phase 3 — MLO-1: Card Creation & Activation

16. `[P]` Contract test for `POST /cards`. **Acceptance**: asserts `201` + `inactive` for a
    good-standing account, and `409 account_not_in_good_standing` with no card row otherwise.
17. `[P]` Contract test for `POST /cards/{id}/activate`. **Acceptance**: asserts `200` + `active`
    from `inactive`, and `409 invalid_state_transition` from any other state.
18. `[P]` Integration test for create → activate → audit check. **Acceptance**: asserts one `create`
    and one `activate` `AuditEntry` exist.
19. Implement the `VirtualCard` model with allowed-transition enforcement. **Acceptance**: any
    transition outside the six allowed raises a specific `invalid_state_transition` error at the
    model layer.
20. Implement `CardService.create_card` (eligibility check). **Acceptance**: rejects a
    not-good-standing account without creating a card row; emits a `create` audit event on success.
21. Implement `CardService.activate_card`. **Acceptance**: only succeeds from `inactive`; emits an
    `activate` audit event on success.
22. Implement `POST /cards` and `POST /cards/{id}/activate` endpoints. **Acceptance**:
    request/response/error shapes match the contract exactly.
23. Add input validation and specific error responses. **Acceptance**: malformed input returns a
    specific validation error; no path returns a bare `500`.

**Checkpoint**: MLO-1 fully functional and independently testable.

### Phase 4 — MLO-2: Instant Freeze/Unfreeze

24. `[P]` Contract test for freeze/unfreeze. **Acceptance**: asserts `200` success and
    `409 conflict_first_request_won` shapes.
25. `[P]` Integration test: freeze blocks a new authorization. **Acceptance**: freeze-to-block
    latency ≤2s p95 (SC-001).
26. `[P]` Integration test: concurrent freeze/unfreeze race. **Acceptance**: exactly one request is
    applied, the other receives the conflict error, both are audited.
27. Implement `RateLimitCounter` + rolling-10-minute-window logic. **Acceptance**: the 11th
    freeze/unfreeze/limit-change request for one card within any rolling window is flagged.
28. Implement Limits' rate-limit check, consumed by Card Issuing. **Acceptance**: matches the
    `429 rate_limited` contract and emits a `flagged_for_review` audit event.
29. Implement `CardService.freeze`/`.unfreeze` with first-request-wins resolution. **Acceptance**:
    the losing side receives `conflict_first_request_won` with current state; both sides are
    audited with distinct outcomes.
30. Implement the freeze/unfreeze endpoints, calling Limits' rate-limit check first. **Acceptance**:
    matches the contract exactly, including the pre-flight rate-limit call.
31. Add who/when/why audit payload wiring for freeze/unfreeze. **Acceptance**: every audit entry
    populates `actor_id`/`occurred_at` unconditionally, `reason` only when supplied.

**Checkpoint**: MLO-1 and MLO-2 both work independently.

### Phase 5 — MLO-3: Transaction Visibility

32. `[P]` Contract test for paginated transaction history. **Acceptance**: asserts cursor/
    `next_cursor` shape and bounded `page_size` (≤100).
33. `[P]` Contract test for `POST /transactions/authorize`. **Acceptance**: asserts `201` + `pending`
    and idempotent retry behavior.
34. `[P]` Integration test for pending-transaction visibility timing. **Acceptance**: a new
    authorization appears in the list within 5s p95 (SC-002).
35. Implement the `Transaction` model. **Acceptance**: matches the data model exactly; a float
    amount is rejected at construction time.
36. Implement Ledger's `IdempotencyKey` model/replay logic. **Acceptance**: behavior identical to
    Limits' equivalent, verified by a shared contract-test fixture.
37. Implement `LedgerService.record_authorization` (no limit check yet — wired in by MLO-4's task).
    **Acceptance**: a recorded transaction is immediately queryable.
38. Implement `POST /transactions/authorize` endpoint. **Acceptance**: matches the contract shape
    and honors `Idempotency-Key`.
39. Implement paginated `GET /cards/{id}/transactions`. **Acceptance**: returns a bounded page in
    under 1s p95 regardless of history length (up to 5 years), and remains queryable for a closed
    card.

**Checkpoint**: MLO-1, MLO-2, MLO-3 all work independently (authorize endpoint has no limit gating
until MLO-4's integration task).

### Phase 6 — MLO-4: Spend Limit Management

40. `[P]` Contract test for `PUT /cards/{id}/limits`. **Acceptance**: asserts `422
    limit_out_of_range` outside $10–$5,000 (per-tx) / $50–$10,000 (daily), and `409 stale_version`
    for a stale version.
41. `[P]` Contract test for limit override. **Acceptance**: asserts `403 permission_denied` without
    `override`, `200` with `reason_code`+`note` when held.
42. `[P]` Contract test for `/authorizations/evaluate`. **Acceptance**: asserts the
    approve/decline decision shape.
43. `[P]` Integration test for idempotent limit-change retry. **Acceptance**: zero duplicate audit
    entries across two identical retried requests.
44. `[P]` Implement `SpendLimit` model with optimistic-concurrency `version`. **Acceptance**:
    construction enforces the $10–$5,000/$50–$10,000 ranges.
45. `[P]` Implement `LimitOverride` model. **Acceptance**: `reason_code` constrained to the
    predefined enum.
46. Implement Limits' `IdempotencyKey` handling. **Acceptance**: behaves identically to Ledger's
    equivalent.
47. Implement `LimitsService.set_limit` with validation + version-conflict handling. **Acceptance**:
    out-of-range rejected with a rule-specific error; stale-version rejected as a conflict, never
    silently applied on top of a newer value.
48. Implement `LimitsService.override_limit`, requiring `override`. **Acceptance**: a denied attempt
    is itself audited.
49. Implement `LimitsService.evaluate_authorization`. **Acceptance**: declines with a specific
    reason when either limit is exceeded.
50. Wire Ledger's authorize endpoint to call Limits' evaluate endpoint before recording a
    transaction. **Acceptance**: an over-limit authorization is recorded as declined with the
    Limits-supplied reason, without changing either story's own contract tests.
51. Implement the limits + override endpoints. **Acceptance**: matches the contract exactly,
    including all error shapes.

**Checkpoint**: MLO-1–4 all work independently; the integration step (task 50) does not break
either story's own tests.

### Phase 7 — MLO-5: Replacement & Closure

52. `[P]` Contract test for close. **Acceptance**: asserts `closed` is terminal; a retried closure
    against an already-closed card returns the current state, not an error.
53. `[P]` Contract test for replace. **Acceptance**: asserts the linked closure+creation pair and the
    `creation_pending` response shape.
54. `[P]` Integration test for replacement partial failure. **Acceptance**: the async retry succeeds
    within 5min p95; the old card never reactivates.
55. Implement `CardService.close_card` (self-service and ops-initiated via `override`).
    **Acceptance**: an ops-initiated closure without `override` is denied and audited; both paths
    reach the terminal `closed` state.
56. Implement `CardService.replace_card` with async retry-on-failure for new-card creation.
    **Acceptance**: the old card stays closed regardless of new-card creation outcome; retry
    succeeds within 5min p95 without ever reactivating the old card.
57. Implement the close/replace endpoints. **Acceptance**: matches the contract, including the
    `creation_pending`/`retry_after` partial-failure response.

**Checkpoint**: MLO-1–3 and MLO-5 all work independently (MLO-5 depends only on MLO-1's foundation).

### Phase 8 — MLO-6: Ops/Compliance Masked Review & Audit

58. `[P]` Contract test for reading the audit trail. **Acceptance**: asserts `403` without
    `audit_viewer` and `200` with chronological entries when held.
59. `[P]` Contract test for the unmask-check gate. **Acceptance**: asserts every call, allowed or
    denied, produces exactly one `AuditEntry`.
60. `[P]` Integration test for permission independence. **Acceptance**: confirms an identity holding
    only one of `override`/`unmask`/`audit_viewer` is denied for the others, and vice versa.
61. `[P]` Integration test for the SC-005 reconciliation check. **Acceptance**: a 1:1 match between
    recorded actions/denials and `AuditEntry` rows across all services.
62. Implement the `audit_viewer` gate on the audit-trail read endpoint. **Acceptance**: a denial
    itself produces a `denied_attempt` entry before the `403` is returned.
63. Implement the unmask-check gate, consumed wherever unmasked data would be shown. **Acceptance**:
    every call, regardless of outcome, produces a corresponding audit entry.
64. Implement masked-identifier-by-default response shaping on card-detail responses.
    **Acceptance**: unmasked PAN/CVV never appears unless the caller has passed the unmask gate.

**Checkpoint**: all six mid-level lifecycle/oversight objectives (MLO-1–6) are independently
functional.

### Phase 9 — Polish & cross-cutting (serves MLO-7–10)

65. `[P]` Run the full quickstart validation guide end-to-end. **Acceptance**: all scenarios plus
    the reconciliation check pass exactly as documented.
66. `[P]` Unit tests for the shared money/timestamp library. **Acceptance**: rejects floats, accepts
    `Decimal`+ISO 4217, rejects non-ISO-8601/non-UTC timestamps.
67. Security hardening pass confirming no service other than Audit persists a PAN-derived
    reference. **Acceptance**: zero matches for raw PAN/CVV or unmasked-token storage outside the
    Audit Service's models.
68. `[P]` Documentation pass reconciling the plan/data-model/contracts against the final
    implementation. **Acceptance**: no undocumented endpoint, field, or error code remains.
69. Load-test the freeze/unfreeze path against SC-001/SC-009. **Acceptance**: p95 freeze-to-block
    latency stays ≤2s sustained across the load test.

### Phase 10 — Consistency-check remediation (closes findings from the cross-artifact consistency pass)

A cross-artifact consistency check (spec vs. plan vs. tasks) surfaced ten gaps before this
specification was finalized, per the constitution's "consistency check before finalizing"
requirement. Closing them is captured as explicit tasks rather than silently folded back in, so the
finding-to-fix trace stays auditable:

70. `[P]` Implement a Card Issuing instance of the shared idempotency middleware (closes finding
    C1 — Card Issuing had no idempotency-key contract) **(MLO-7)**. **Acceptance**: identical replay
    behavior to Ledger's and Limits' equivalents.
71. Wire idempotency handling into card creation/activation (closes C1 for those endpoints)
    **(MLO-1, MLO-7)**. **Acceptance**: a retried creation/activation returns the identical response
    and creates no second card or duplicate audit entry.
72. Wire idempotency handling into freeze/unfreeze (closes C1 + H3) **(MLO-2, MLO-7)**.
    **Acceptance**: a retried freeze/unfreeze returns the identical response with exactly one audit
    entry.
73. Wire idempotency handling into close/replace (closes C1 for those endpoints)
    **(MLO-5, MLO-7)**. **Acceptance**: a retried close/replace returns the current state with no
    duplicate audit entry.
74. Implement the internal card-state-check endpoint (closes finding H1 — authorize never checked
    card state) **(MLO-3)**. **Acceptance**: returns current lifecycle state with no side effect and
    no audit entry.
75. Wire the authorize endpoint to call the state check before the limit evaluation, short-circuiting
    to a decline for a non-active card (closes H1) **(MLO-3)**. **Acceptance**: an authorization
    against a frozen or closed card is declined even when the amount is within all configured limits.
76. `[P]` Contract test asserting ops-initiated freeze/unfreeze without `override` is denied and
    audited (closes finding H2 — ops-initiated freeze/unfreeze had no defined permission)
    **(MLO-2, MLO-9)**. **Acceptance**: `ops_compliance` actor without `override` receives `403` and
    produces exactly one denied-attempt entry.
77. Implement the `override` check on ops-initiated freeze/unfreeze (closes H2)
    **(MLO-2, MLO-9)**. **Acceptance**: an ops actor without `override` is denied and the denial
    audited; a user-initiated action on the user's own card needs no permission check.
78. `[P]` Extend close/replace contract tests to assert the same permission-denied path (closes
    finding M4) **(MLO-5, MLO-9)**. **Acceptance**: an ops-initiated close/replace without
    `override` returns `403` and produces a denied-attempt entry.
79. `[P]` Add a latency assertion for limit/override propagation (closes finding M1 — SC-003 had no
    dedicated validation scenario) **(MLO-4)**. **Acceptance**: a new limit is in effect for the very
    next authorization attempt within 2s p95.
80. `[P]` Integration test measuring end-to-end guided create→active flow time (closes finding M2)
    **(MLO-1)**. **Acceptance**: the flow completes in under 90s of user-facing interaction time.
81. `[P]` Document/configure HA/failover for the freeze/authorization path (closes finding M3)
    **(MLO-2)**. **Acceptance**: a simulated single-instance failure recovers within the 5-minute
    RTO target.
82. `[P]` Integration test for the limit-change-racing-an-authorization edge case (closes finding
    L1) **(MLO-4, MLO-10)**. **Acceptance**: the authorization is evaluated against exactly one of
    the two racing values, never an ambiguous or never-in-effect one.

**Checkpoint**: every consistency-check finding (C1, H1, H2, H3, M1–M5, L1) has a corresponding
task; finding M5 was resolved as a documentation-only clarification (see Implementation Notes →
Concurrency) and needed no code task.

---

## Edge Cases & Failure Modes

Scoped to this feature; each states the user-visible outcome and, where relevant, the audit/
compliance implication.

| Edge case | Expected behavior | Audit/compliance implication |
|---|---|---|
| Empty state — no cards | System shows an empty state, never an error. | — |
| Partial failure during card creation | Card either rolls back entirely or is left clearly `inactive/failed`, never silently `active`. | The failed attempt is still recorded. |
| Concurrent freeze/unfreeze | First-accepted request wins; the second is rejected with a conflict error. One deterministic final state, never split/inconsistent. | Both attempts recorded with their outcome (applied vs. rejected-as-conflict). |
| Limit change racing an authorization | Whichever request the system accepts first determines the limit in effect for the authorization. | Audit trail records which limit value was in effect at authorization time. |
| Invalid limit values (negative, zero, above max) | Rejected with a specific validation error, never silently clamped. | — |
| Stale limit read after an ops override | Next read reflects the new value within the stated time-to-consistency target; client is told which value is authoritative. | — |
| Permission boundary violation (unmask/override/audit_viewer) | Denied; each of the three permissions is independent — holding one never implies another. | Every denied attempt is audited. |
| Authorization against a non-active card | Declined with a state-specific reason regardless of limit check outcome; state is checked as part of the authorization path itself. | — |
| Fraud-ish pattern / rate limiting | 11th+ freeze/unfreeze/limit-change request in a rolling 10-minute window is rejected with a rate-limit error; the pattern is also flagged for ops/compliance review. | Both the hard throttle and the softer review signal fire together. |
| Retry storms | Any retried write (across all three write-accepting services) applies exactly once and returns the same outcome every time. | No duplicate audit entries per idempotency-key contract. |
| Replacement of an already-closed card | Returns current (already-closed) state rather than erroring or duplicating. | — |
| Replacement partial failure | Old card stays closed; new-card creation retries asynchronously; user sees "replacement pending," never a false "complete" or a silently reactivated old card. | Closure, failure, and eventual success are each recorded as distinct linked audit entries. |
| Viewing history on a closed card | History remains readable (read-only) after closure. | — |

---

## Verification

Verification method per mid-level objective — named test category, reconciliation check, or review
step, per the documentation-only testing bar (this project ships no code; the bar is enforced in the
artifacts themselves: every low-level task has an acceptance criterion, and every objective below has
a stated verification method).

| Objective | Verification method |
|---|---|
| MLO-1 Card Creation & Activation | Contract tests (create/activate request-response shapes) + integration test confirming audit entries exist for both steps |
| MLO-2 Instant Freeze/Unfreeze | Contract test (conflict shape) + integration tests for freeze-blocks-authorization latency (SC-001) and concurrent-race resolution |
| MLO-3 Transaction Visibility | Contract tests (pagination shape, authorize shape) + integration test for visibility timing (SC-002) |
| MLO-4 Spend Limit Management | Contract tests (range validation, override permission, evaluation decision) + integration test for idempotent retry (SC-004) |
| MLO-5 Replacement & Closure | Contract tests (terminal-state idempotence, linked pair shape) + integration test for partial-failure retry (SC-010) |
| MLO-6 Ops/Compliance Masked Review & Audit | Contract tests (permission gates) + integration test for permission independence + periodic reconciliation check (SC-005) |
| MLO-7 Idempotent, Exactly-Once Writes | Shared idempotency-middleware unit test + per-service contract tests confirming identical replayed responses |
| MLO-8 Complete, Attributable Audit Trail | Reconciliation check comparing action counts to audit-entry counts across all services (SC-005) |
| MLO-9 Independent Permission Boundaries | Integration test asserting each permission pairing is denied independently of the others |
| MLO-10 Deterministic Concurrency Resolution | Integration tests for both conflict mechanisms (freeze/unfreeze timing-window, limit-change version-conflict) |

**Reconciliation check (SC-005, run periodically, not per-scenario)**: compare the count of
state-changing actions and denied-attempt events recorded across all three write-accepting services
against the count of corresponding audit entries. Expected: 1:1 match; any discrepancy is a defect,
not an acceptable variance.

---

## Performance

All targets below are **assumed targets** for this hypothetical system, each with a one-line
rationale for why the number is reasonable for FinTech UX/ops, per the constitution's
non-negotiable-verification principle.

| ID | Target | Rationale |
|---|---|---|
| SC-001 | Freeze blocks new authorizations within **2s (p95)** of the freeze request being accepted. | A stolen-card exposure window matters more than UX polish — deliberately tighter than typical read-latency targets. |
| SC-002 | A new transaction appears in the user's view within **5s (p95)** of authorization. | Users expect near-real-time fraud-monitoring visibility; full settlement finality is not required at this speed. |
| SC-003 | A limit change/override takes effect for the next authorization within **2s (p95)**. | Matches the freeze target — both are risk-control actions with the same urgency. |
| SC-004 | **99%** of retried writes return the same outcome as the original, zero duplicate audit entries in reconciliation sampling. | Near-100% because idempotency is a correctness property, not a performance one; the residual 1% accounts for genuinely distinct requests that happen to collide. |
| SC-005 | **100%** of state-changing actions and denied attempts produce exactly one audit entry. | Verified by periodic reconciliation between action counts and audit-entry counts. |
| SC-006 | Historical transaction queries return a bounded page in **under 1s (p95)** regardless of history length, up to 5 years. | Standard pagination expectation for a financial transaction list. |
| SC-007 | **100%** of ops/compliance views default to masked identifiers; **0%** of unmask actions occur without both the permission check passing and a corresponding audit entry. | Direct enforcement of the masking-by-default policy. |
| SC-008 | Create-to-active-card guided flow completes in **under 90s** of user-facing interaction time. | Reasonable onboarding-speed expectation, excluding external eligibility checks. |
| SC-009 | Freeze/authorization path maintains **99.95% monthly uptime**, RTO **≤5 minutes**. | Tighter than the rest of the system because it is the primary loss-prevention control. |
| SC-010 | On replacement partial failure, async retry succeeds within **5 minutes (p95)** for **99.9%** of cases. | Mirrors the RTO in SC-009 — an unreplaced lost card is functionally the same risk window as a system outage on the freeze path. |

---

## Assumptions

- Account eligibility (KYC, credit check, etc.) is an existing dependency this feature checks but
  does not implement.
- "Real-time" transaction visibility means pending/in-flight authorizations, not final settlement;
  settlement timing is governed by the card network and out of scope.
- The maximum number of concurrently active cards per account is a platform policy decision outside
  this feature's scope.
- The ops/compliance role/permission system already exists; this feature relies on three
  independently-grantable permissions (`unmask`, `override`, `audit_viewer`) checked against it,
  rather than building role management from scratch.
- User-facing notifications (push/email/SMS) are handled by an existing Notification Service this
  feature triggers, not a capability this feature builds.
- Automated fraud-scoring/blocking beyond the rate-limit-and-flag behavior in this spec is a
  separate, future capability.
