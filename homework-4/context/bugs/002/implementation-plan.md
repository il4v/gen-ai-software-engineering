# Bug Context 002 — Leaderboard sorted ascending instead of descending

## What the bug is

The leaderboard shows the **worst** scores at the top instead of the best. Anyone comparing two different
scores sees the lower one ranked first.

## Where it lives

`src/app.py`, function `sorted_leaderboard(entries)`, line 39:

```python
def sorted_leaderboard(entries):
    return sorted(entries, key=lambda e: e["score"])    # <-- line 39: missing reverse=True
```

`sorted()` without `reverse=True` sorts ascending (lowest `score` first). `sorted_leaderboard` is called from
the `GET /api/leaderboard` route handler, which returns its result directly as the leaderboard payload.

## How to reproduce

1. Start the app, open `http://localhost:5000`.
2. Submit one quiz run scoring low (e.g. answer everything wrong — score near 0).
3. Submit a second run scoring higher (e.g. all-correct — 9/10, itself affected by Bug 001 above, but still
   clearly higher than the first run).
4. Open the leaderboard. The **low**-scoring entry appears above the **high**-scoring entry.

Equivalently, `tests/test_app.py::test_leaderboard_sorted_descending_by_score` currently fails, asserting
`['High', 'Low']` but getting `['Low', 'High']` — that failure is this bug's automated proof.

## What "fixed" looks like

`sorted_leaderboard` sorts by `score` descending (add `reverse=True`, or negate the sort key). After the fix,
the higher-scoring entry always appears first, and `test_leaderboard_sorted_descending_by_score` passes
without being modified.

## Scope note

Only touch `sorted_leaderboard`. Don't change how entries are stored in `leaderboard.json`, the top-10 slicing
in the route handler, or Bug 001's scoring logic — unrelated.
