"""Stage 1 — Validation. Serves MLO-1 (specification.md section 2, objective 1)."""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

if __package__ in (None, ""):
    # Allows `python pipeline/validator.py --dry-run` (TASKS.md's own example invocation) to find
    # the `pipeline` package — otherwise sys.path[0] is pipeline/ itself, not its parent.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.models import SUPPORTED_CURRENCIES, make_envelope, to_decimal, utc_now_iso

STAGE_NAME = "validator"
REQUIRED_FIELDS = ["transaction_id", "timestamp", "source_account", "destination_account", "amount", "currency"]


def process_transaction(data: dict) -> dict:
    """Pure validation — never raises, always returns data with a 'status' (and 'reason' if rejected)."""
    for field_name in REQUIRED_FIELDS:
        if data.get(field_name) in (None, ""):
            return {**data, "status": "rejected", "reason": f"missing_field:{field_name}"}

    try:
        amount = to_decimal(data["amount"])
    except ValueError:
        return {**data, "status": "rejected", "reason": "invalid_amount"}

    if amount <= 0:
        return {**data, "status": "rejected", "reason": "invalid_amount"}

    if data["currency"] not in SUPPORTED_CURRENCIES:
        return {**data, "status": "rejected", "reason": "invalid_currency_code"}

    return {**data, "status": "validated"}


def _log(transaction_id: str, outcome: str) -> None:
    print(f"{utc_now_iso()} stage={STAGE_NAME} transaction_id={transaction_id} outcome={outcome}")


def run(shared_dir: Path) -> dict:
    """Orchestrator-driven run: consumes shared/input/, writes shared/output/ or shared/results/."""
    input_dir = shared_dir / "input"
    processing_dir = shared_dir / "processing"
    output_dir = shared_dir / "output"
    results_dir = shared_dir / "results"
    for d in (input_dir, processing_dir, output_dir, results_dir):
        d.mkdir(parents=True, exist_ok=True)

    counts = {"total": 0, "valid": 0, "invalid": 0}
    reasons: list[dict] = []

    for path in sorted(input_dir.glob("*.json")):
        with path.open() as f:
            envelope = json.load(f)
        counts["total"] += 1
        record = envelope["data"]
        txn_id = record.get("transaction_id", "unknown")

        processing_path = processing_dir / path.name
        shutil.move(str(path), str(processing_path))

        result_data = process_transaction(record)

        if result_data["status"] == "rejected":
            counts["invalid"] += 1
            reasons.append({"transaction_id": txn_id, "reason": result_data["reason"]})
            _log(txn_id, f"rejected:{result_data['reason']}")
            out_envelope = make_envelope(STAGE_NAME, "results", result_data)
            (results_dir / f"{txn_id}.json").write_text(json.dumps(out_envelope.to_dict(), indent=2))
        else:
            counts["valid"] += 1
            _log(txn_id, "validated")
            out_envelope = make_envelope(STAGE_NAME, "fraud_detector", result_data)
            (output_dir / f"{txn_id}.json").write_text(json.dumps(out_envelope.to_dict(), indent=2))

        processing_path.unlink(missing_ok=True)

    return {"counts": counts, "reasons": reasons}


def run_dry(sample_file: Path) -> dict:
    """--dry-run: validates sample-transactions.json directly, touches no files in shared/."""
    with sample_file.open() as f:
        transactions = json.load(f)

    counts = {"total": 0, "valid": 0, "invalid": 0}
    reasons: list[dict] = []

    for record in transactions:
        counts["total"] += 1
        result_data = process_transaction(record)
        if result_data["status"] == "rejected":
            counts["invalid"] += 1
            reasons.append({"transaction_id": record.get("transaction_id", "unknown"), "reason": result_data["reason"]})
        else:
            counts["valid"] += 1

    return {"counts": counts, "reasons": reasons}


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate transactions.")
    parser.add_argument("--dry-run", action="store_true", help="Validate sample-transactions.json without touching shared/.")
    parser.add_argument("--shared-dir", default="shared")
    parser.add_argument("--sample-file", default="sample-transactions.json")
    args = parser.parse_args()

    if args.dry_run:
        result = run_dry(Path(args.sample_file))
    else:
        result = run(Path(args.shared_dir))

    counts = result["counts"]
    print(f"\nValidation summary: total={counts['total']} valid={counts['valid']} invalid={counts['invalid']}")
    if result["reasons"]:
        print("\n%-15s %s" % ("transaction_id", "reason"))
        for r in result["reasons"]:
            print("%-15s %s" % (r["transaction_id"], r["reason"]))


if __name__ == "__main__":
    main()
