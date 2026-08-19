"""The one read path for shared/results/ — reused by the orchestrator summary, the frontend,
and the MCP server (agents.md domain rule 5: never re-implement this per consumer).
"""
from __future__ import annotations

import json
from pathlib import Path


def list_results(results_dir: Path) -> list[dict]:
    """Read every result envelope in shared/results/. Read-only, never writes."""
    if not results_dir.exists():
        return []
    records = []
    for path in sorted(results_dir.glob("*.json")):
        with path.open() as f:
            records.append(json.load(f))
    return records


def summarize_results(results_dir: Path) -> dict:
    """Counts by terminal status plus the full record list."""
    records = list_results(results_dir)
    counts: dict[str, int] = {}
    for record in records:
        status = record.get("data", {}).get("status", "unknown")
        counts[status] = counts.get(status, 0) + 1
    return {"total": len(records), "counts": counts, "records": records}


def get_transaction(results_dir: Path, transaction_id: str) -> dict | None:
    """Look up a single transaction's result envelope by transaction_id, or None if not found."""
    for record in list_results(results_dir):
        if record.get("data", {}).get("transaction_id") == transaction_id:
            return record
    return None
