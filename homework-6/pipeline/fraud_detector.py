"""Stage 2 — Fraud Detection. Serves MLO-2 (specification.md section 2, objective 2).

Scoring rules are data, not code — see pipeline/rule_engine.py and config/fraud_rules.yaml
(specification-challenge.md MLO-C1). This module only wires the rule engine into the file-queue
protocol; it holds no scoring logic of its own.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from pipeline.models import make_envelope, utc_now_iso
from pipeline.rule_engine import evaluate, load_rules

STAGE_NAME = "fraud_detector"
DEFAULT_RULES_PATH = Path(__file__).resolve().parent.parent / "config" / "fraud_rules.yaml"


def process_transaction(data: dict, rules_path: Path = DEFAULT_RULES_PATH) -> dict:
    """Pure scoring — never raises. amount/currency are already validated by this point."""
    ruleset = load_rules(rules_path)
    score, flags = evaluate(data, ruleset)
    status = "flagged_for_review" if score >= ruleset.flag_threshold else "cleared"
    return {**data, "risk_score": score, "flags": flags, "status": status}


def _log(transaction_id: str, outcome: str) -> None:
    print(f"{utc_now_iso()} stage={STAGE_NAME} transaction_id={transaction_id} outcome={outcome}")


def run(shared_dir: Path) -> dict:
    """Reads shared/output/ (written by the validator), writes shared/output/ (cleared, for
    settlement) or shared/results/ (flagged, terminal).
    """
    stage_dir = shared_dir / "output"
    processing_dir = shared_dir / "processing"
    results_dir = shared_dir / "results"
    for d in (stage_dir, processing_dir, results_dir):
        d.mkdir(parents=True, exist_ok=True)

    # Snapshot the directory before writing anything back into it, so this run never reprocesses
    # its own output — required for the sequential orchestrator to hand off cleanly stage to stage.
    pending = [(path, json.loads(path.read_text())) for path in sorted(stage_dir.glob("*.json"))]

    counts = {"cleared": 0, "flagged": 0}

    for path, envelope in pending:
        record = envelope["data"]
        txn_id = record.get("transaction_id", "unknown")

        processing_path = processing_dir / path.name
        shutil.move(str(path), str(processing_path))

        result_data = process_transaction(record)

        if result_data["status"] == "flagged_for_review":
            counts["flagged"] += 1
            _log(txn_id, f"flagged:score={result_data['risk_score']}")
            out_envelope = make_envelope(STAGE_NAME, "results", result_data)
            (results_dir / f"{txn_id}.json").write_text(json.dumps(out_envelope.to_dict(), indent=2))
        else:
            counts["cleared"] += 1
            _log(txn_id, "cleared")
            out_envelope = make_envelope(STAGE_NAME, "settlement", result_data)
            (stage_dir / f"{txn_id}.json").write_text(json.dumps(out_envelope.to_dict(), indent=2))

        processing_path.unlink(missing_ok=True)

    return {"counts": counts}
