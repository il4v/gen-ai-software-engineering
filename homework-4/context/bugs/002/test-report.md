# Test Report — Bug 002: Leaderboard sorted ascending instead of descending

## Files Modified

- **Tests added to:** `tests/test_app.py`

## Test Coverage Summary

**11 new tests** were written to comprehensively cover the bugfix in `sorted_leaderboard()`. These tests join the existing `test_leaderboard_sorted_descending_by_score` (which was already in place as a regression seed) to form a complete test suite.

## New Tests Written

### Regression Tests (3 tests)
These tests verify that the core bug is fixed and stay fixed.

1. **`test_leaderboard_multiple_entries_sorted_descending`**
   - Verifies multiple unsorted entries sort to descending order by score
   - Catches the exact bug: missing `reverse=True` would yield ascending order [3, 5, 7, 10]

2. **`test_leaderboard_reversed_input_order`**
   - Regression: input that is ascending (1, 2, 3) must become descending (3, 2, 1)
   - Directly tests the fix: without `reverse=True`, this would fail

3. **`test_leaderboard_already_sorted_descending`**
   - Regression: entries already in correct descending order must remain unchanged
   - Verifies stability and idempotence of the fix

### Happy Path Tests (3 tests)
Normal, expected behavior of the sorting function.

4. **`test_leaderboard_single_entry`**
   - Single entry returns unchanged (trivial case but important boundary)
   - Verifies no mutation or re-ordering of one-element lists

5. **`test_leaderboard_two_entries_ascending_input`**
   - Two entries in ascending order swap to descending
   - Minimal multi-element case; easy to verify both score and name ordering

6. **`test_leaderboard_many_entries_mixed_order`**
   - Five entries in random order sort correctly to descending
   - Represents typical real-world leaderboard scenario with realistic data volume

### Edge Cases (5 tests)
Boundary conditions and robustness scenarios.

7. **`test_leaderboard_empty_list`**
   - Empty entry list returns empty (boundary: zero entries)
   - Ensures no crashes or unexpected behavior on empty input

8. **`test_leaderboard_all_entries_same_score`**
   - Multiple entries with identical scores maintain insertion order (Python stable sort)
   - Verifies behavior when score discrimination is not possible
   - Tests all three ways equal-scoring entries could be sorted (any order is valid; stable sort chosen)

9. **`test_leaderboard_entries_with_same_name_different_scores`**
   - Multiple quiz submissions from same player sort by score descending
   - Real-world case: repeated submissions appear in the leaderboard
   - Verifies that name is not used as a tie-breaker (only score matters)

10. **`test_leaderboard_zero_and_high_scores`**
    - Mix of zero scores (failed quizzes) and high scores
    - Ensures scores at both extremes (0–100 range) sort correctly
    - Boundary test: zero is the minimum score in this domain

11. **`test_leaderboard_preserves_entry_structure`**
    - Sorting must not drop or corrupt fields beyond "name" and "score"
    - Verifies that additional entry metadata (e.g., timestamp) is preserved
    - Robustness test: future leaderboard schema extensions will not break sorting

## Test Run Results

```
============================= test session starts ==============================
platform darwin -- Python 3.11.5, pytest-9.1.1, pluggy-1.6.0
collected 24 items

tests/test_app.py::test_all_correct_answers_score_full_total PASSED      [  4%]
tests/test_app.py::test_leaderboard_sorted_descending_by_score PASSED    [  8%]
tests/test_app.py::test_last_question_correct_is_counted PASSED          [ 12%]
tests/test_app.py::test_last_question_wrong_is_also_counted PASSED       [ 16%]
tests/test_app.py::test_only_last_question_in_quiz PASSED                [ 20%]
tests/test_app.py::test_two_question_quiz_both_correct PASSED            [ 25%]
tests/test_app.py::test_two_question_quiz_only_last_correct PASSED       [ 29%]
tests/test_app.py::test_all_wrong_answers_score_zero PASSED              [ 33%]
tests/test_app.py::test_mixed_correct_and_wrong_answers PASSED           [ 37%]
tests/test_app.py::test_all_correct_answers_small_quiz PASSED            [ 41%]
tests/test_app.py::test_all_correct_answers_large_quiz PASSED            [ 45%]
tests/test_app.py::test_score_with_varied_answer_indices PASSED          [ 50%]
tests/test_app.py::test_score_partial_with_varied_answer_indices PASSED  [ 54%]
tests/test_app.py::test_leaderboard_multiple_entries_sorted_descending PASSED [ 58%]
tests/test_app.py::test_leaderboard_reversed_input_order PASSED          [ 62%]
tests/test_app.py::test_leaderboard_already_sorted_descending PASSED     [ 66%]
tests/test_app.py::test_leaderboard_single_entry PASSED                  [ 70%]
tests/test_app.py::test_leaderboard_two_entries_ascending_input PASSED   [ 75%]
tests/test_app.py::test_leaderboard_many_entries_mixed_order PASSED      [ 79%]
tests/test_app.py::test_leaderboard_empty_list PASSED                    [ 83%]
tests/test_app.py::test_leaderboard_all_entries_same_score PASSED        [ 87%]
tests/test_app.py::test_leaderboard_entries_with_same_name_different_scores PASSED [ 91%]
tests/test_app.py::test_leaderboard_zero_and_high_scores PASSED          [ 95%]
tests/test_app.py::test_leaderboard_preserves_entry_structure PASSED     [100%]

============================== 24 passed in 0.24s ==============================
```

**Result:** ✅ **All 24 tests PASSED** (13 existing + 11 new)

## FIRST Compliance Checklist

### ✅ **F — Fast**
- All tests run in-memory with no I/O, no network calls, no sleep
- Data structures are small (max 5 entries, simulating real leaderboard snapshots)
- Total test suite executes in 0.24 seconds
- No external dependencies exercised

### ✅ **I — Independent**
- Each test creates its own fixture (list of entries)
- No shared mutable state between tests
- No test depends on another test having run first
- Tests can run in any order or in parallel with identical results
- All fixtures are created fresh within each test function

### ✅ **R — Repeatable**
- No dependency on wall-clock time, random values, or external services
- No reliance on system state (locale, timezone, environment variables)
- Tests pass identically on any machine (verified: macOS Python 3.11)
- Input data is hardcoded and deterministic
- Python's sort is deterministic; stable sort is guaranteed by language semantics

### ✅ **S — Self-validating**
- All 11 tests use explicit assertions (assert statements)
- No tests that print/log for manual inspection
- Each test has a boolean pass/fail outcome determined by assertions
- Assertions verify concrete return values (sorted order, preserved fields)

### ✅ **T — Timely**
- Tests written in same run as bugfix
- All tests directly cover the exact function that was modified: `sorted_leaderboard()`
- Three regression tests directly verify the core bug (missing `reverse=True`) is fixed
- Tests written only for changed code (Bug 002's `sorted_leaderboard` function)
- No tests for unrelated legacy code (Bug 001's `compute_score` tests unchanged)

## Coverage Analysis

**Function tested:** `sorted_leaderboard(entries)` in `src/app.py:38–39`

**Lines of code:** 1 line (the sort call)

**Branch coverage:**
- ✅ Ascending input → descending output (main branch; was broken before fix)
- ✅ Already-sorted input → unchanged output (main branch; idempotent)
- ✅ Empty input → empty output (boundary; main branch)
- ✅ All-equal scores → insertion-order preservation (main branch; stable sort)

**Input domain coverage:**
- ✅ Entry list size: 0, 1, 2, 3, 5 (representatives of common sizes)
- ✅ Score values: 0, 3, 5, 7, 10, 12, 15, 50, 100 (low, mid, high; includes boundary 0)
- ✅ Entry structure: standard {name, score}, with extra fields (metadata-resilience)
- ✅ Score distribution: identical, ascending, descending, mixed

## Test Organization

All tests added to existing file `tests/test_app.py` following the established pattern:
- Regression tests grouped under `# REGRESSION TESTS FOR BUG #2` header
- Happy-path tests grouped under `# NORMAL/HAPPY PATH TESTS FOR SORTED_LEADERBOARD` header
- Edge cases grouped under `# EDGE CASES FOR SORTED_LEADERBOARD ROBUSTNESS` header
- Each test function prefixed with `test_leaderboard_` for discoverability
- Each test includes a detailed docstring explaining what it verifies

## Related Issues Fixed

- ✅ Bug 002: Leaderboard sorted ascending instead of descending
- ✅ The previously-failing seed test `test_leaderboard_sorted_descending_by_score` now passes
- ✅ No regressions in existing tests for Bug 001 (all 13 existing tests still pass)

## Sign-Off

All tests follow FIRST principles. The test suite is production-ready.
