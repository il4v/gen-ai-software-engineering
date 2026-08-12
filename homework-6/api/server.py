"""REST API gateway — HTTP entry point for submitting transactions and querying results.

Serves specification-challenge.md MLO-C3/MLO-C4. No new business logic: reuses the exact same
process_transaction functions the file-queue path (pipeline/*.run()) already uses, already covered by
tests/test_{validator,fraud_detector,settlement}.py. Kept as a separate service from frontend/server.py
on purpose — that dashboard's whole design point is staying read-only and never triggering a pipeline
run (specification.md's Web Dashboard Front-end task); a write-capable path lives here instead, so that
guarantee stays verifiable just by reading frontend/server.py alone.

No authentication (specification-challenge.md section 0, decision #3) — matches the existing
no-auth scope decision for the rest of this project.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import yaml
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from pipeline import fraud_detector, settlement, validator
from pipeline.results_reader import get_transaction, summarize_results
from pipeline.rule_engine import Rule, RuleSet, evaluate as rule_evaluate, load_rules

BASE_DIR = Path(__file__).resolve().parent.parent
RESULTS_DIR = BASE_DIR / "shared" / "results"
RULES_PATH = BASE_DIR / "config" / "fraud_rules.yaml"
SAMPLE_FILE = BASE_DIR / "sample-transactions.json"

app = FastAPI(title="Transaction Pipeline API Gateway")

# Local demo only, no auth by design (specification-challenge.md section 0, decision #3) — the
# dashboard (frontend/server.py, a different origin/port) calls these endpoints directly from the
# browser, so it needs CORS to be allowed at all.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _write_result(record: dict) -> dict:
    """Writes a terminal result envelope to shared/results/ — the same file the dashboard and MCP
    server already read, so an API-submitted transaction shows up everywhere else for free."""
    txn_id = record["transaction_id"]
    envelope = {
        "message_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_stage": "api",
        "target_stage": "results",
        "message_type": "transaction",
        "data": record,
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (RESULTS_DIR / f"{txn_id}.json").write_text(json.dumps(envelope, indent=2))
    return envelope


@app.post("/transactions")
def submit_transaction(record: dict) -> dict:
    """Runs a submitted transaction through validator -> fraud_detector -> settlement, same as the
    batch path. Idempotent: resubmitting a transaction_id already terminal in shared/results/ returns
    the existing result rather than reprocessing (specification.md section 3 Idempotency, extended
    here per MLO-C4)."""
    txn_id = record.get("transaction_id")
    if not txn_id:
        raise HTTPException(status_code=422, detail="transaction_id is required")

    existing = get_transaction(RESULTS_DIR, txn_id)
    if existing is not None:
        return existing

    validated = validator.process_transaction(record)
    if validated["status"] == "rejected":
        return _write_result(validated)

    scored = fraud_detector.process_transaction(validated)
    if scored["status"] == "flagged_for_review":
        return _write_result(scored)

    settled = settlement.process_transaction(scored)
    return _write_result(settled)


@app.get("/transactions/{transaction_id}")
def get_transaction_endpoint(transaction_id: str) -> dict:
    record = get_transaction(RESULTS_DIR, transaction_id)
    if record is None:
        raise HTTPException(status_code=404, detail="transaction not found")
    return record


@app.get("/transactions")
def list_transactions() -> dict:
    return summarize_results(RESULTS_DIR)


def _ruleset_to_dict(ruleset: RuleSet) -> dict:
    return {
        "flag_threshold": ruleset.flag_threshold,
        "rules": [
            {"name": r.name, "field": r.field, "operator": r.operator, "value": r.value, "score": r.score}
            for r in ruleset.rules
        ],
    }


def _dict_to_ruleset(data: dict) -> RuleSet:
    try:
        rules = tuple(
            Rule(name=r["name"], field=r["field"], operator=r["operator"], value=r["value"], score=r["score"])
            for r in data["rules"]
        )
        return RuleSet(flag_threshold=data["flag_threshold"], rules=rules)
    except (KeyError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=f"invalid rule set: {exc}") from exc


@app.get("/rules")
def get_rules() -> dict:
    """Current fraud-detection policy, as data — same file pipeline/fraud_detector.py reads
    (config/fraud_rules.yaml), just exposed over HTTP so a UI can display/edit it."""
    return _ruleset_to_dict(load_rules(RULES_PATH))


@app.post("/rules/preview")
def preview_rules(candidate: dict) -> dict:
    """Evaluates a candidate rule set against every transaction in sample-transactions.json WITHOUT
    persisting anything — lets a caller see an edit's effect before committing to it, same discipline
    the rule-engine-agent applies (specification-challenge.md MLO-C2), just reachable from a UI too."""
    ruleset = _dict_to_ruleset(candidate)

    with open(SAMPLE_FILE) as f:
        transactions = json.load(f)

    results = []
    for txn in transactions:
        validated = validator.process_transaction(txn)
        if validated["status"] == "rejected":
            results.append(
                {"transaction_id": txn["transaction_id"], "status": "rejected", "reason": validated["reason"]}
            )
            continue
        score, flags = rule_evaluate(validated, ruleset)
        status = "flagged_for_review" if score >= ruleset.flag_threshold else "cleared"
        results.append(
            {
                "transaction_id": txn["transaction_id"],
                "status": status,
                "risk_score": score,
                "flags": flags,
            }
        )

    return {"results": results}


@app.put("/rules")
def save_rules(candidate: dict) -> dict:
    """Persists a new rule set to config/fraud_rules.yaml. Validates it parses/evaluates before
    writing — never leaves a rules file pipeline.rule_engine.load_rules can't parse."""
    ruleset = _dict_to_ruleset(candidate)
    RULES_PATH.write_text(yaml.safe_dump(_ruleset_to_dict(ruleset), sort_keys=False))
    return {"saved": True, "rules": _ruleset_to_dict(ruleset)}


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
