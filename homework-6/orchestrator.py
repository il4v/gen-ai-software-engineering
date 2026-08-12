"""Orchestrator — runs the full transaction processing pipeline end-to-end.

Serves MLO-4 (specification.md section 2, objective 4) and enforces the Idempotency and
Partial-failure/crash-recovery rules from section 3.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from pipeline import fraud_detector, settlement, validator
from pipeline.models import make_envelope
from pipeline.results_reader import list_results, summarize_results

BASE_DIR = Path(__file__).resolve().parent
SHARED_DIR = BASE_DIR / "shared"
SAMPLE_FILE = BASE_DIR / "sample-transactions.json"


def reset_shared_dirs(shared_dir: Path = SHARED_DIR) -> None:
    """Explicit hard reset: wipes input/processing/output — never results/, the audit trail.

    This is the /run-pipeline skill's own separate step 2 ("Clear shared/ directories"), distinct
    from step 3 ("Run the pipeline"/run_pipeline()) — a deliberate fresh-demo-run action, not
    something run_pipeline() does on every call (that would destroy crash-recovery state; see
    _recover_crashed_records below).
    """
    for name in ("input", "processing", "output"):
        d = shared_dir / name
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True, exist_ok=True)
    (shared_dir / "results").mkdir(parents=True, exist_ok=True)


def _ensure_dirs(shared_dir: Path) -> None:
    for name in ("input", "processing", "output", "results"):
        (shared_dir / name).mkdir(parents=True, exist_ok=True)


def _recover_crashed_records(shared_dir: Path) -> int:
    """Crash recovery (specification.md section 3): anything left in processing/ from a run that
    didn't finish is resubmitted to input/ rather than destroyed. Every stage's process_transaction
    is safe to rerun (agents.md domain rule 8), so resubmitting to input/ and reprocessing from
    validation onward is a correct, if not maximally efficient, recovery.
    """
    input_dir = shared_dir / "input"
    processing_dir = shared_dir / "processing"
    recovered = 0
    for path in sorted(processing_dir.glob("*.json")):
        shutil.move(str(path), str(input_dir / path.name))
        recovered += 1
    return recovered


def _already_processed_ids(results_dir: Path) -> set[str]:
    return {r.get("data", {}).get("transaction_id") for r in list_results(results_dir)}


def run_pipeline(shared_dir: Path = SHARED_DIR, sample_file: Path = SAMPLE_FILE) -> dict:
    """Crash-safe by default: does NOT wipe input/output (that would discard in-flight state from a
    prior run that didn't finish) — only recovers processing/ leftovers into input/. Call
    reset_shared_dirs() first for a deliberate fresh-demo-run reset (what /run-pipeline's step 2 does).
    """
    _ensure_dirs(shared_dir)
    recovered = _recover_crashed_records(shared_dir)

    with sample_file.open() as f:
        transactions = json.load(f)

    processed_ids = _already_processed_ids(shared_dir / "results")
    input_dir = shared_dir / "input"

    skipped = 0
    for txn in transactions:
        txn_id = txn.get("transaction_id")
        if txn_id in processed_ids:
            skipped += 1
            continue
        envelope = make_envelope("orchestrator", "validator", txn)
        (input_dir / f"{txn_id}.json").write_text(json.dumps(envelope.to_dict(), indent=2))

    validator.run(shared_dir)
    fraud_detector.run(shared_dir)
    settlement.run(shared_dir)

    summary = summarize_results(shared_dir / "results")
    summary["skipped_already_processed"] = skipped
    summary["recovered_from_processing"] = recovered
    return summary


def main() -> None:
    summary = run_pipeline()
    print("\nPipeline run summary")
    print(f"  Total records in shared/results/: {summary['total']}")
    for status, count in sorted(summary["counts"].items()):
        print(f"  {status}: {count}")
    if summary["skipped_already_processed"]:
        print(f"  (skipped {summary['skipped_already_processed']} already-processed transaction_id(s))")
    if summary["recovered_from_processing"]:
        print(f"  (recovered {summary['recovered_from_processing']} record(s) left in shared/processing/ by a prior crashed run)")

    rejected = [r for r in summary["records"] if r.get("data", {}).get("status") == "rejected"]
    if rejected:
        print("\nRejected transactions:")
        for r in rejected:
            d = r["data"]
            print(f"  {d.get('transaction_id')}: {d.get('reason')}")

    flagged = [r for r in summary["records"] if r.get("data", {}).get("status") == "flagged_for_review"]
    if flagged:
        print("\nFlagged for review:")
        for r in flagged:
            d = r["data"]
            print(f"  {d.get('transaction_id')}: score={d.get('risk_score')} flags={d.get('flags')}")


if __name__ == "__main__":
    main()
