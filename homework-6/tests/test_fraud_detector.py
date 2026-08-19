from __future__ import annotations

from pathlib import Path

from pipeline.fraud_detector import process_transaction, run

from .conftest import write_envelope


def test_low_risk_transaction_clears(sample_transaction):
    # $1,500, US, 09:00Z — no signal fires.
    result = process_transaction(sample_transaction)
    assert result["status"] == "cleared"
    assert result["risk_score"] == 0
    assert result["flags"] == []


def test_high_value_alone_flags(sample_transaction):
    sample_transaction["amount"] = "25000.00"
    result = process_transaction(sample_transaction)
    assert result["status"] == "flagged_for_review"
    assert result["risk_score"] == 50
    assert result["flags"] == ["high_value"]


def test_amount_just_under_threshold_does_not_flag_on_value_alone(sample_transaction):
    sample_transaction["amount"] = "9999.99"
    result = process_transaction(sample_transaction)
    assert "high_value" not in result["flags"]
    assert result["status"] == "cleared"


def test_cross_border_plus_unusual_timing_together_reach_flag_threshold(sample_transaction):
    # TXN004-equivalent: neither signal alone (25) reaches 50, but together they do.
    sample_transaction["amount"] = "500.00"
    sample_transaction["timestamp"] = "2026-03-16T02:47:00Z"
    sample_transaction["metadata"] = {"channel": "api", "country": "DE"}
    result = process_transaction(sample_transaction)
    assert result["status"] == "flagged_for_review"
    assert result["risk_score"] == 50
    assert set(result["flags"]) == {"cross_border", "unusual_timing"}


def test_cross_border_alone_does_not_flag(sample_transaction):
    sample_transaction["metadata"] = {"channel": "online", "country": "DE"}
    result = process_transaction(sample_transaction)
    assert result["status"] == "cleared"
    assert result["flags"] == ["cross_border"]
    assert result["risk_score"] == 25


def test_run_routes_cleared_to_output_and_flagged_to_results(shared_dir: Path, sample_transaction: dict):
    flagged_transaction = dict(sample_transaction, transaction_id="TXN_HIGH", amount="99999.00")
    write_envelope(shared_dir / "output", "validator", "fraud_detector", sample_transaction)
    write_envelope(shared_dir / "output", "validator", "fraud_detector", flagged_transaction)

    result = run(shared_dir)

    assert result["counts"] == {"cleared": 1, "flagged": 1}
    assert (shared_dir / "output" / "TXN001.json").exists()
    assert (shared_dir / "results" / "TXN_HIGH.json").exists()
    assert not (shared_dir / "output" / "TXN_HIGH.json").exists()
    assert list((shared_dir / "processing").glob("*.json")) == []
