"""Stage 2 — Fraud Detection. Serves MLO-2 (specification.md section 2, objective 2)."""
from __future__ import annotations

import json
import shutil
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from pipeline.models import make_envelope, to_decimal, utc_now_iso

STAGE_NAME = "fraud_detector"
HIGH_VALUE_THRESHOLD = Decimal("10000")
HOME_COUNTRY = "US"
BUSINESS_HOURS_START = 6
BUSINESS_HOURS_END = 22
FLAG_THRESHOLD = 50


def process_transaction(data: dict) -> dict:
    """Pure scoring — never raises. amount/currency are already validated by this point."""
    amount = to_decimal(data["amount"])
    country = data.get("metadata", {}).get("country", HOME_COUNTRY)
    hour = _parse_hour(data.get("timestamp", ""))

    flags: list[str] = []
    score = 0

    if amount > HIGH_VALUE_THRESHOLD:
        score += 50
        flags.append("high_value")

    if country != HOME_COUNTRY:
        score += 25
        flags.append("cross_border")

    if hour is not None and not (BUSINESS_HOURS_START <= hour < BUSINESS_HOURS_END):
        score += 25
        flags.append("unusual_timing")

    status = "flagged_for_review" if score >= FLAG_THRESHOLD else "cleared"
    return {**data, "risk_score": score, "flags": flags, "status": status}


def _parse_hour(timestamp: str) -> int | None:
    if not timestamp:
        return None
    try:
        return datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%SZ").hour
    except ValueError:
        return None


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
