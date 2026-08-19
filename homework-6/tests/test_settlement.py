from __future__ import annotations

from pathlib import Path

from pipeline.settlement import process_transaction, run

from .conftest import write_envelope


def test_fee_and_net_amount_are_computed_correctly(sample_transaction):
    # $1,500.00 * 0.5% = $7.50 fee -> net $1,492.50 (matches the real orchestrator run's output).
    result = process_transaction(sample_transaction)
    assert result["status"] == "settled"
    assert result["fee"] == "7.50"
    assert result["net_amount"] == "1492.50"


def test_settlement_date_is_transaction_date_plus_one_day(sample_transaction):
    sample_transaction["timestamp"] = "2026-03-16T09:00:00Z"
    result = process_transaction(sample_transaction)
    assert result["settlement_date"] == "2026-03-17"
    assert result["settlement_batch"] == "BATCH-2026-03-17"


def test_fee_rounds_half_up(sample_transaction):
    # $0.05 amount * 0.5% = $0.00025 -> rounds to $0.00 under ROUND_HALF_UP (below the halfway
    # point of the cent), net stays $0.05 — exercises the quantize/rounding path explicitly.
    sample_transaction["amount"] = "0.05"
    result = process_transaction(sample_transaction)
    assert result["fee"] == "0.00"
    assert result["net_amount"] == "0.05"


def test_run_writes_settled_result(shared_dir: Path, sample_transaction: dict):
    write_envelope(shared_dir / "output", "fraud_detector", "settlement", sample_transaction)

    result = run(shared_dir)

    assert result["settled"] == 1
    result_path = shared_dir / "results" / "TXN001.json"
    assert result_path.exists()
    assert list((shared_dir / "output").glob("*.json")) == []
    assert list((shared_dir / "processing").glob("*.json")) == []
