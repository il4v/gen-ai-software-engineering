from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import frontend.server as server_module

from .conftest import write_envelope


@pytest.fixture
def client(shared_dir: Path, sample_transaction: dict, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    # Point the dashboard at an isolated tmp_path results dir instead of the real shared/results/.
    monkeypatch.setattr(server_module, "RESULTS_DIR", shared_dir / "results")
    write_envelope(shared_dir / "results", "settlement", "results", dict(sample_transaction, status="settled"))
    return TestClient(server_module.app)


def test_summary_endpoint(client: TestClient):
    response = client.get("/api/summary")
    assert response.status_code == 200
    assert response.json() == {"total": 1, "counts": {"settled": 1}}


def test_results_endpoint(client: TestClient):
    response = client.get("/api/results")
    assert response.status_code == 200
    records = response.json()
    assert len(records) == 1
    assert records[0]["data"]["transaction_id"] == "TXN001"


def test_index_html_is_served(client: TestClient):
    response = client.get("/")
    assert response.status_code == 200
    assert "Transaction Pipeline Dashboard" in response.text
