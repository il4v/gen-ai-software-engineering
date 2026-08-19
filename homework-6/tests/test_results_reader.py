from __future__ import annotations

from pathlib import Path

from pipeline.results_reader import get_transaction, list_results, summarize_results

from .conftest import write_envelope


def test_list_results_on_missing_dir_returns_empty(tmp_path: Path):
    assert list_results(tmp_path / "does-not-exist") == []


def test_summarize_results_counts_by_status(shared_dir: Path, sample_transaction: dict):
    settled = dict(sample_transaction, status="settled")
    rejected = dict(sample_transaction, transaction_id="TXN_BAD", status="rejected", reason="invalid_amount")
    write_envelope(shared_dir / "results", "settlement", "results", settled)
    write_envelope(shared_dir / "results", "validator", "results", rejected)

    summary = summarize_results(shared_dir / "results")

    assert summary["total"] == 2
    assert summary["counts"] == {"settled": 1, "rejected": 1}


def test_get_transaction_finds_by_id(shared_dir: Path, sample_transaction: dict):
    write_envelope(shared_dir / "results", "settlement", "results", dict(sample_transaction, status="settled"))

    found = get_transaction(shared_dir / "results", "TXN001")
    missing = get_transaction(shared_dir / "results", "NOPE")

    assert found is not None
    assert found["data"]["transaction_id"] == "TXN001"
    assert missing is None
