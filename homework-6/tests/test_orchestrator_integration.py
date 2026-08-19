from __future__ import annotations

import json
from pathlib import Path

import orchestrator

from .conftest import write_envelope


def test_full_pipeline_matches_known_outcome_baseline(shared_dir: Path, tmp_sample_file: Path):
    """specification.md section 4's known-outcome table: 3 settled, 3 flagged, 2 rejected."""
    summary = orchestrator.run_pipeline(shared_dir=shared_dir, sample_file=tmp_sample_file)

    assert summary["total"] == 8
    assert summary["counts"] == {"settled": 3, "flagged_for_review": 3, "rejected": 2}

    reasons = {
        r["data"]["transaction_id"]: r["data"]["reason"]
        for r in summary["records"]
        if r["data"]["status"] == "rejected"
    }
    assert reasons == {"TXN006": "invalid_currency_code", "TXN007": "invalid_amount"}


def test_rerun_is_idempotent_no_duplicates(shared_dir: Path, tmp_sample_file: Path):
    orchestrator.run_pipeline(shared_dir=shared_dir, sample_file=tmp_sample_file)
    second = orchestrator.run_pipeline(shared_dir=shared_dir, sample_file=tmp_sample_file)

    assert second["total"] == 8
    assert second["skipped_already_processed"] == 8
    assert len(list((shared_dir / "results").glob("*.json"))) == 8


def test_reset_shared_dirs_clears_transient_dirs_not_results(shared_dir: Path, tmp_sample_file: Path):
    orchestrator.run_pipeline(shared_dir=shared_dir, sample_file=tmp_sample_file)
    assert len(list((shared_dir / "results").glob("*.json"))) == 8

    orchestrator.reset_shared_dirs(shared_dir)

    assert list((shared_dir / "input").glob("*.json")) == []
    assert list((shared_dir / "output").glob("*.json")) == []
    assert list((shared_dir / "processing").glob("*.json")) == []
    assert len(list((shared_dir / "results").glob("*.json"))) == 8  # never cleared


def test_crash_leftover_in_processing_is_recovered_not_lost(shared_dir: Path, sample_transaction: dict):
    empty_sample_file = shared_dir.parent / "sample-transactions.json"
    empty_sample_file.write_text("[]")

    write_envelope(shared_dir / "processing", "validator", "fraud_detector", sample_transaction)

    summary = orchestrator.run_pipeline(shared_dir=shared_dir, sample_file=empty_sample_file)

    assert summary["recovered_from_processing"] == 1
    assert summary["total"] == 1
    assert summary["counts"] == {"settled": 1}
    assert list((shared_dir / "processing").glob("*.json")) == []
