"""Stage 3 — Settlement Processing. Serves MLO-3 (specification.md section 2, objective 3)."""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from pipeline.models import make_envelope, to_decimal, utc_now_iso

STAGE_NAME = "settlement"
FEE_RATE = Decimal("0.005")
TWO_PLACES = Decimal("0.01")


def process_transaction(data: dict) -> dict:
    """Pure settlement math — never raises. amount is already validated by this point."""
    amount = to_decimal(data["amount"])
    fee = (amount * FEE_RATE).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    net_amount = (amount - fee).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    txn_date = _parse_date(data.get("timestamp", ""))
    settlement_date = (txn_date + timedelta(days=1)).date().isoformat() if txn_date else None
    settlement_batch = f"BATCH-{settlement_date}" if settlement_date else "BATCH-UNKNOWN"

    return {
        **data,
        "status": "settled",
        "fee": str(fee),
        "net_amount": str(net_amount),
        "settlement_batch": settlement_batch,
        "settlement_date": settlement_date,
    }


def _parse_date(timestamp: str) -> datetime | None:
    if not timestamp:
        return None
    try:
        return datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _log(transaction_id: str, outcome: str) -> None:
    print(f"{utc_now_iso()} stage={STAGE_NAME} transaction_id={transaction_id} outcome={outcome}")


def run(shared_dir: Path) -> dict:
    """Reads shared/output/ (cleared transactions from fraud_detector), writes shared/results/."""
    stage_dir = shared_dir / "output"
    processing_dir = shared_dir / "processing"
    results_dir = shared_dir / "results"
    for d in (stage_dir, processing_dir, results_dir):
        d.mkdir(parents=True, exist_ok=True)

    pending = [(path, json.loads(path.read_text())) for path in sorted(stage_dir.glob("*.json"))]

    count = 0
    for path, envelope in pending:
        record = envelope["data"]
        txn_id = record.get("transaction_id", "unknown")

        processing_path = processing_dir / path.name
        shutil.move(str(path), str(processing_path))

        result_data = process_transaction(record)
        count += 1
        _log(txn_id, "settled")

        out_envelope = make_envelope(STAGE_NAME, "results", result_data)
        (results_dir / f"{txn_id}.json").write_text(json.dumps(out_envelope.to_dict(), indent=2))

        processing_path.unlink(missing_ok=True)

    return {"settled": count}
