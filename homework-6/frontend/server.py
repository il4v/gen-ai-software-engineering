"""Read-only web dashboard for the transaction processing pipeline.

Serves TASKS.md Task 2's front-end requirement — see specification.md's Web Dashboard Front-end
Low-Level Task for why this stays read-only (never triggers a pipeline run itself).
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from pipeline.results_reader import summarize_results

BASE_DIR = Path(__file__).resolve().parent.parent
RESULTS_DIR = BASE_DIR / "shared" / "results"
STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(title="Transaction Pipeline Dashboard")


@app.get("/api/summary")
def get_summary() -> dict:
    summary = summarize_results(RESULTS_DIR)
    return {"total": summary["total"], "counts": summary["counts"]}


@app.get("/api/results")
def get_results() -> list[dict]:
    return summarize_results(RESULTS_DIR)["records"]


# Registered after the API routes above so /api/* is matched first — a static mount at "/" would
# otherwise shadow anything path-matching underneath it.
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
