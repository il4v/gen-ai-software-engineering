"""Shared pytest fixtures. Every fixture here uses tmp_path — tests never touch the real shared/."""
from __future__ import annotations

import json
from pathlib import Path

import pytest


@pytest.fixture
def shared_dir(tmp_path: Path) -> Path:
    d = tmp_path / "shared"
    for name in ("input", "processing", "output", "results"):
        (d / name).mkdir(parents=True)
    return d


@pytest.fixture
def sample_transaction() -> dict:
    """A single known-good transaction record, matching TXN001's shape."""
    return {
        "transaction_id": "TXN001",
        "timestamp": "2026-03-16T09:00:00Z",
        "source_account": "ACC-1001",
        "destination_account": "ACC-2001",
        "amount": "1500.00",
        "currency": "USD",
        "transaction_type": "transfer",
        "description": "Monthly rent payment",
        "metadata": {"channel": "online", "country": "US"},
    }


@pytest.fixture
def real_sample_file() -> Path:
    """Path to the actual shipped sample-transactions.json (read-only, never modified by tests)."""
    return Path(__file__).resolve().parent.parent / "sample-transactions.json"


@pytest.fixture
def tmp_sample_file(tmp_path: Path, real_sample_file: Path) -> Path:
    """A private copy of sample-transactions.json under tmp_path, safe for tests to point at."""
    dest = tmp_path / "sample-transactions.json"
    dest.write_text(real_sample_file.read_text())
    return dest


def write_envelope(directory: Path, source_stage: str, target_stage: str, data: dict) -> Path:
    """Test helper: write a stage envelope file, bypassing pipeline.models to keep tests decoupled
    from its internals (only the on-disk shape matters here, per TASKS.md's envelope format)."""
    import uuid
    from datetime import datetime, timezone

    envelope = {
        "message_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_stage": source_stage,
        "target_stage": target_stage,
        "message_type": "transaction",
        "data": data,
    }
    path = directory / f"{data['transaction_id']}.json"
    path.write_text(json.dumps(envelope))
    return path
