"""Custom FastMCP server making the pipeline queryable (TASKS.md Task 4).

Backed entirely by pipeline.results_reader — one implementation of "read shared/results/",
per agents.md domain rule 5, shared with the frontend and the orchestrator's own summary.
"""
from __future__ import annotations

import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastmcp import FastMCP

from pipeline.results_reader import get_transaction, summarize_results

BASE_DIR = Path(__file__).resolve().parent.parent
RESULTS_DIR = BASE_DIR / "shared" / "results"

mcp = FastMCP(name="pipeline-status")


@mcp.tool
def get_transaction_status(transaction_id: str) -> dict:
    """Return the current status of a transaction from shared/results/, or a not-found shape."""
    record = get_transaction(RESULTS_DIR, transaction_id)
    if record is None:
        return {"found": False, "transaction_id": transaction_id}
    return {"found": True, **record["data"]}


@mcp.tool
def list_pipeline_results() -> dict:
    """Return counts by outcome plus every processed transaction's summary data."""
    summary = summarize_results(RESULTS_DIR)
    return {
        "total": summary["total"],
        "counts": summary["counts"],
        "transactions": [r["data"] for r in summary["records"]],
    }


@mcp.resource("pipeline://summary")
def pipeline_summary_resource() -> str:
    """The latest pipeline run summary as human-readable text."""
    summary = summarize_results(RESULTS_DIR)
    lines = [f"Total processed: {summary['total']}"]
    for status, count in sorted(summary["counts"].items()):
        lines.append(f"  {status}: {count}")
    return "\n".join(lines)


if __name__ == "__main__":
    mcp.run()
