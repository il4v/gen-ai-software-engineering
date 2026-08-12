# Research Notes — context7 Queries

Queries run via the `context7` MCP server during Agent 2 (`pipeline-coder`)'s implementation of the
pipeline stages, orchestrator, frontend, and MCP server, per `specification.md`'s Low-Level Tasks and
`docs-tmp/PLAN-AI-DEVELOPER.md` §3 Step C.

## Capstone Challenge extension — AI usage note

The rule engine, `rule-engine-agent`, REST API gateway, and `demo.sh` (see `specification-challenge.md`)
were built with Claude Code end-to-end from a written spec, following the same discipline as the rest of
this project:

- **Behavior-preserving refactor verified, not assumed**: after moving fraud-scoring from hardcoded
  Python constants into `pipeline/rule_engine.py` + `config/fraud_rules.yaml`, the existing
  `tests/test_fraud_detector.py` suite was rerun unmodified, and a full `python3 orchestrator.py` run was
  compared against the known 3-settled/3-flagged/2-rejected baseline byte-for-byte before the refactor was
  considered done (specification-challenge.md MLO-C1).
- **The API gateway's idempotency was verified live**, not just unit-tested: a real `curl` POST was
  submitted twice with different `amount` values for the same `transaction_id`, confirming the second
  call returned the original (unchanged) result rather than reprocessing it.
- **`demo.sh` was actually run**, not just written — confirmed all 3 fixture transactions produced their
  intended terminal outcomes (settled/flagged/rejected) and that the background server process was
  correctly torn down afterward (`ps aux` showed no orphaned `uvicorn` process).
- **A self-review catch**: an early draft of `README.md`'s Capstone Challenge note referenced
  `docs-tmp/SPECIFICATION-CHALLENGE.md` — the same "committed file depending on gitignored scratch"
  mistake found and fixed earlier in this project's `/write-spec` skill. Caught immediately by checking
  for other references to the old path, and fixed by moving the spec out of `docs-tmp/` into the committed
  `specification-challenge.md` before it shipped.

## Query 1: Python `decimal` module — rounding for monetary amounts

- Search: "decimal module ROUND_HALF_UP quantize for monetary rounding to 2 places"
- context7 library ID: `/python/cpython`
- Applied: Used `Decimal.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)` in
  `pipeline/settlement.py` to round the net settlement amount to exactly 2 decimal places after
  deducting the 0.5% fee — matches `specification.md` §3's stated `ROUND_HALF_UP` convention. Confirmed
  from the docs that `quantize` (not a raw `round()`) is the correct API for fixing a `Decimal`'s exponent,
  and that `ROUND_HALF_UP` ("ties going away from zero") is a distinct named constant from
  `ROUND_HALF_EVEN` (banker's rounding) — so the two are not interchangeable and had to be specified
  explicitly rather than relying on `Decimal`'s default context rounding.

## Query 2: FastAPI — serving static files alongside JSON routes

- Search: "serve static files and JSON GET endpoints returning dict responses"
- context7 library ID: `/websites/fastapi_tiangolo`
- Applied: Used `app.mount("/static", StaticFiles(directory="frontend/static"), name="static")` in
  `frontend/server.py` to serve `index.html`/`app.js`/`style.css`, alongside plain `@app.get(...)` route
  handlers that return a `dict` directly (FastAPI serializes it to JSON automatically) for `/api/summary`
  and `/api/results` — confirmed from the docs' "Successful JSON Response" example that returning a bare
  dict from a route handler is the idiomatic pattern, no manual `JSONResponse` wrapping needed.

## Query 3: FastMCP — defining tools and resource templates

- Search: "defining a tool with @mcp.tool and a resource with @mcp.resource including URI templates"
- context7 library ID: `/prefecthq/fastmcp`
- Applied: Used the `@mcp.tool` decorator (bare, no parentheses needed per the docs' `add(a, b)` example)
  for `get_transaction_status` and `list_pipeline_results` in `mcp/server.py`, and confirmed that
  `pipeline://summary` as a **static** resource URI (no `{placeholder}`) just needs `@mcp.resource
  ("pipeline://summary")` on a zero-argument function — the `{param}`-in-URI template pattern shown in the
  docs only applies when the resource itself is parameterized (e.g. `weather://{city}/current`), which
  `pipeline://summary` isn't, so no template mapping was needed for that one.
