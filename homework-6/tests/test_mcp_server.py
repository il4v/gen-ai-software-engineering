"""Tests for mcp/server.py.

Loaded via importlib file-path loading, never `from mcp.server import ...` — the real `mcp` SDK
package (a fastmcp dependency) always wins that dotted import over our mcp/ directory.
See agents.md domain rule 10.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
from fastmcp import Client

from .conftest import write_envelope


def _load_mcp_server_module():
    server_path = Path(__file__).resolve().parent.parent / "mcp" / "server.py"
    spec = importlib.util.spec_from_file_location("pipeline_mcp_server_under_test", server_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def mcp_module(shared_dir: Path, sample_transaction: dict):
    module = _load_mcp_server_module()
    module.RESULTS_DIR = shared_dir / "results"
    write_envelope(shared_dir / "results", "settlement", "results", dict(sample_transaction, status="settled"))
    return module


@pytest.mark.asyncio
async def test_get_transaction_status_found(mcp_module):
    async with Client(mcp_module.mcp) as client:
        result = await client.call_tool("get_transaction_status", {"transaction_id": "TXN001"})
    assert result.data["found"] is True
    assert result.data["status"] == "settled"


@pytest.mark.asyncio
async def test_get_transaction_status_not_found(mcp_module):
    async with Client(mcp_module.mcp) as client:
        result = await client.call_tool("get_transaction_status", {"transaction_id": "NOPE"})
    assert result.data == {"found": False, "transaction_id": "NOPE"}


@pytest.mark.asyncio
async def test_list_pipeline_results(mcp_module):
    async with Client(mcp_module.mcp) as client:
        result = await client.call_tool("list_pipeline_results", {})
    assert result.data["total"] == 1
    assert result.data["counts"] == {"settled": 1}


@pytest.mark.asyncio
async def test_pipeline_summary_resource(mcp_module):
    async with Client(mcp_module.mcp) as client:
        result = await client.read_resource("pipeline://summary")
    assert "Total processed: 1" in result[0].text
    assert "settled: 1" in result[0].text
