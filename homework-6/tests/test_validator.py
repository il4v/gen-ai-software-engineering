from __future__ import annotations

import json
from pathlib import Path

from pipeline.validator import process_transaction, run, run_dry

from .conftest import write_envelope


def test_valid_transaction_passes(sample_transaction):
    result = process_transaction(sample_transaction)
    assert result["status"] == "validated"


def test_missing_required_field_is_rejected(sample_transaction):
    del sample_transaction["currency"]
    result = process_transaction(sample_transaction)
    assert result["status"] == "rejected"
    assert result["reason"] == "missing_field:currency"


def test_negative_amount_is_rejected(sample_transaction):
    sample_transaction["amount"] = "-100.00"
    result = process_transaction(sample_transaction)
    assert result["status"] == "rejected"
    assert result["reason"] == "invalid_amount"


def test_zero_amount_is_rejected(sample_transaction):
    sample_transaction["amount"] = "0.00"
    result = process_transaction(sample_transaction)
    assert result["status"] == "rejected"
    assert result["reason"] == "invalid_amount"


def test_non_numeric_amount_is_rejected(sample_transaction):
    sample_transaction["amount"] = "not-a-number"
    result = process_transaction(sample_transaction)
    assert result["status"] == "rejected"
    assert result["reason"] == "invalid_amount"


def test_unsupported_currency_is_rejected(sample_transaction):
    sample_transaction["currency"] = "XYZ"
    result = process_transaction(sample_transaction)
    assert result["status"] == "rejected"
    assert result["reason"] == "invalid_currency_code"


def test_amount_just_under_high_value_threshold_still_validates(sample_transaction):
    # TXN003-equivalent edge case: validation only cares that amount is positive, not the
    # fraud threshold — $9,999.99 is a perfectly valid amount at this stage.
    sample_transaction["amount"] = "9999.99"
    result = process_transaction(sample_transaction)
    assert result["status"] == "validated"


def test_run_writes_valid_to_output_and_invalid_to_results(shared_dir: Path, sample_transaction: dict):
    bad_transaction = dict(sample_transaction, transaction_id="TXN_BAD", currency="ZZZ")
    write_envelope(shared_dir / "input", "orchestrator", "validator", sample_transaction)
    write_envelope(shared_dir / "input", "orchestrator", "validator", bad_transaction)

    result = run(shared_dir)

    assert result["counts"] == {"total": 2, "valid": 1, "invalid": 1}
    assert list((shared_dir / "output").glob("*.json"))[0].name == "TXN001.json"
    assert (shared_dir / "results" / "TXN_BAD.json").exists()
    assert list((shared_dir / "input").glob("*.json")) == []
    assert list((shared_dir / "processing").glob("*.json")) == []

    rejected_envelope = json.loads((shared_dir / "results" / "TXN_BAD.json").read_text())
    assert rejected_envelope["data"]["reason"] == "invalid_currency_code"


def test_run_dry_touches_no_files(tmp_sample_file: Path, shared_dir: Path):
    result = run_dry(tmp_sample_file)

    assert result["counts"]["total"] == 8
    assert result["counts"]["valid"] == 6
    assert result["counts"]["invalid"] == 2
    assert list(shared_dir.rglob("*.json")) == []
