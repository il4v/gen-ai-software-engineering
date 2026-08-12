from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import api.server as server_module

from .conftest import write_envelope


@pytest.fixture
def client(shared_dir: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(server_module, "RESULTS_DIR", shared_dir / "results")
    return TestClient(server_module.app)


@pytest.fixture
def client_with_tmp_rules(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """A client whose /rules endpoints read/write a throwaway copy of the real default rules —
    never the actual config/fraud_rules.yaml."""
    tmp_rules = tmp_path / "fraud_rules.yaml"
    tmp_rules.write_text(server_module.RULES_PATH.read_text())
    monkeypatch.setattr(server_module, "RULES_PATH", tmp_rules)
    return client


def test_submit_settled_transaction(client: TestClient, sample_transaction: dict):
    response = client.post("/transactions", json=sample_transaction)
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["status"] == "settled"
    assert body["data"]["transaction_id"] == "TXN001"
    assert body["data"]["fee"] == "7.50"


def test_submit_rejected_transaction(client: TestClient, sample_transaction: dict):
    sample_transaction["currency"] = "ZZZ"
    response = client.post("/transactions", json=sample_transaction)
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["status"] == "rejected"
    assert body["data"]["reason"] == "invalid_currency_code"


def test_submit_flagged_transaction(client: TestClient, sample_transaction: dict):
    sample_transaction["amount"] = "25000.00"
    response = client.post("/transactions", json=sample_transaction)
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["status"] == "flagged_for_review"
    assert "high_value" in body["data"]["flags"]


def test_submit_missing_transaction_id_is_rejected(client: TestClient, sample_transaction: dict):
    del sample_transaction["transaction_id"]
    response = client.post("/transactions", json=sample_transaction)
    assert response.status_code == 422


def test_duplicate_submission_returns_identical_result_not_reprocessed(
    client: TestClient, sample_transaction: dict, shared_dir: Path
):
    first = client.post("/transactions", json=sample_transaction).json()
    second = client.post("/transactions", json=sample_transaction).json()

    assert first == second
    # Only one result file was ever written for this transaction_id — proves it was returned as-is
    # on the second call, not reprocessed into a duplicate.
    assert len(list((shared_dir / "results").glob("TXN001*.json"))) == 1


def test_get_transaction_found(client: TestClient, sample_transaction: dict):
    client.post("/transactions", json=sample_transaction)
    response = client.get("/transactions/TXN001")
    assert response.status_code == 200
    assert response.json()["data"]["transaction_id"] == "TXN001"


def test_get_transaction_not_found(client: TestClient):
    response = client.get("/transactions/NOPE")
    assert response.status_code == 404


def test_list_transactions(client: TestClient, sample_transaction: dict, shared_dir: Path):
    write_envelope(shared_dir / "results", "settlement", "results", dict(sample_transaction, status="settled"))
    response = client.get("/transactions")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["counts"] == {"settled": 1}


def test_health(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_get_rules_returns_default_policy(client_with_tmp_rules: TestClient):
    response = client_with_tmp_rules.get("/rules")
    assert response.status_code == 200
    body = response.json()
    assert body["flag_threshold"] == 50
    assert {r["name"] for r in body["rules"]} == {"high_value", "cross_border", "unusual_timing"}


def test_preview_rules_does_not_persist_anything(client_with_tmp_rules: TestClient, shared_dir: Path):
    candidate = {
        "flag_threshold": 50,
        "rules": [{"name": "high_value", "field": "amount", "operator": "gt", "value": "10000", "score": 50}],
    }
    response = client_with_tmp_rules.post("/rules/preview", json=candidate)
    assert response.status_code == 200
    results = {r["transaction_id"]: r for r in response.json()["results"]}
    # TXN002 ($25,000) should flag on high_value alone; TXN004 (cross-border+timing) should NOT,
    # since this candidate ruleset only has the high_value rule.
    assert results["TXN002"]["status"] == "flagged_for_review"
    assert results["TXN004"]["status"] == "cleared"
    # Nothing was written anywhere — this is a preview only.
    assert list((shared_dir / "results").glob("*.json")) == []


def test_preview_rejects_malformed_ruleset(client_with_tmp_rules: TestClient):
    response = client_with_tmp_rules.post("/rules/preview", json={"flag_threshold": 50, "rules": [{"bad": "shape"}]})
    assert response.status_code == 422


def test_save_rules_persists_and_get_reflects_it(client_with_tmp_rules: TestClient):
    candidate = {
        "flag_threshold": 10,
        "rules": [{"name": "any_amount", "field": "amount", "operator": "gt", "value": "0", "score": 10}],
    }
    save_response = client_with_tmp_rules.put("/rules", json=candidate)
    assert save_response.status_code == 200
    assert save_response.json()["saved"] is True

    get_response = client_with_tmp_rules.get("/rules")
    assert get_response.json()["flag_threshold"] == 10
    assert get_response.json()["rules"][0]["name"] == "any_amount"


def test_save_rules_never_touches_real_config_file(client_with_tmp_rules: TestClient):
    """Sanity check on the test fixture itself: confirms the real project config file is untouched
    after a save, proving client_with_tmp_rules' isolation actually works."""
    import pipeline.fraud_detector as fd

    real_config_before = fd.DEFAULT_RULES_PATH.read_text()

    client_with_tmp_rules.put(
        "/rules",
        json={"flag_threshold": 1, "rules": [{"name": "x", "field": "amount", "operator": "gt", "value": "0", "score": 1}]},
    )

    assert fd.DEFAULT_RULES_PATH.read_text() == real_config_before
