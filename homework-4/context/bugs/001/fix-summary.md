# Fix Summary — Bug 001: Off-by-one scoring (last question never counted)

## Changes Made

### `src/app.py`
- **Location:** `compute_score(answers, questions)`, line 32
- **Before:**
  ```python
  for i in range(len(answers) - 1):
  ```
- **After:**
  ```python
  for i in range(len(answers)):
  ```
- **Test result:** `tests/test_app.py::test_all_correct_answers_score_full_total` — **PASSED**

## Overall Status

All planned changes were applied successfully. Only the single line described in the implementation
plan was touched (the `range(len(answers) - 1)` → `range(len(answers))` fix inside `compute_score`).
No other code, including `questions.json`, the submit route, or the leaderboard-sorting logic, was
modified.

Test run (`cd tests && pytest -v`, executed via `/usr/bin/python3 -m pytest -v` since no `pytest`
binary was on `PATH` and the project's `.venv` lacked the `pytest`/`flask` packages — see Manual
Verification for details):

- `test_app.py::test_all_correct_answers_score_full_total` — **PASSED** (this is the automated proof
  for bug 001 and now passes without modification, as required by the plan)
- `test_app.py::test_leaderboard_sorted_descending_by_score` — **FAILED**. This is the pre-existing,
  out-of-scope regression seed for bug #2 (leaderboard sorting), explicitly called out in the plan's
  "Scope note" as a separate, unrelated bug (`context/bugs/002/bug-context.md`). It was left untouched
  as instructed.

Bug 001 is fully fixed and verified.

## Manual Verification

1. Start the app:
   ```
   cd src && python3 app.py
   ```
   then open `http://localhost:5000`.
2. Answer all 10 questions correctly (check `src/questions.json`'s `answer_index` field per question).
3. Submit the quiz. The result screen should now show **10 / 10** (previously showed 9/10).
4. Run the automated test for this bug:
   ```
   cd tests && pytest -v -k test_all_correct_answers_score_full_total
   ```
   Expected: `1 passed`.
   (Note: in this environment, the project's own `.venv` at `src/.venv` did not have `pytest` or
   `flask` installed, and no `pytest` was on `PATH`. Tests were run with the system interpreter
   `/usr/bin/python3 -m pytest -v`, which had both packages available. If running elsewhere, ensure
   `pytest` and `flask` are installed in whichever interpreter runs the tests.)

## References

- Plan: `context/bugs/001/implementation-plan.md`
- Source file touched: `src/app.py`
