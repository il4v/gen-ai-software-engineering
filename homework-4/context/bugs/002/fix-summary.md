# Fix Summary — Bug 002: Leaderboard sorted ascending instead of descending

## Changes Made

### `src/app.py`
- **Location:** `sorted_leaderboard(entries)`, line 39
- **Before:**
  ```python
  def sorted_leaderboard(entries):
      return sorted(entries, key=lambda e: e["score"])
  ```
- **After:**
  ```python
  def sorted_leaderboard(entries):
      return sorted(entries, key=lambda e: e["score"], reverse=True)
  ```
- **Test result:** `cd tests && pytest -v` → 13 passed, 0 failed, including
  `test_app.py::test_leaderboard_sorted_descending_by_score` (previously failing, now PASSED).

## Overall Status

Every planned change was applied and passing. Only `sorted_leaderboard` was touched, as scoped by the plan —
no changes were made to `leaderboard.json` storage, the top-10 slicing in the route handler, or Bug 001's
scoring logic.

## Manual Verification

1. From the repo root, start the app: `cd src && python app.py` (or the project's usual run command), then
   open `http://localhost:5000`.
2. Submit one quiz run scoring low (e.g. answer everything wrong — score near 0).
3. Submit a second run scoring higher (e.g. all-correct).
4. Open the leaderboard page/endpoint (`GET /api/leaderboard`) and confirm the **high**-scoring entry now
   appears **above** the low-scoring entry.
5. Automated check: run `cd tests && pytest -v` and confirm all 13 tests pass, in particular
   `test_leaderboard_sorted_descending_by_score`.

## References

- Plan: `context/bugs/002/implementation-plan.md`
- Source file touched: `src/app.py`
