# Verified Research — Bug 002 (Leaderboard sorted ascending instead of descending)

Source document: `context/bugs/002/research/codebase-research.md`
Rubric applied: `skills/research-quality-measurement.md`

## Verification Summary

**Overall: PASS (with secondary discrepancies noted)**

**Research Quality: Mostly Verified**

The core diagnosis is correct and independently reproduced. `sorted_leaderboard` at `src/app.py:38-39` calls
`sorted()` without `reverse=True`, so entries come back lowest-score-first. The primary file:line citation is
exact, the quoted snippet matches the source character-for-character, and the cited regression test fails in
exactly the way the research describes. Two secondary claims are stale or imprecise; neither touches the root
cause or the fix.

## Verified Claims

1. **`src/app.py` exists and defines `sorted_leaderboard(entries)`** — confirmed, `src/app.py:38`.
2. **The bug is on line 39** — confirmed. `src/app.py:39` is exactly
   `    return sorted(entries, key=lambda e: e["score"])`. The research's quoted two-line snippet (def line +
   return line) matches the source verbatim.
3. **`sorted()` without `reverse=True` sorts ascending (lowest `score` first)** — accurate reading of the
   code, and confirmed empirically by the failing test output below.
4. **`sorted_leaderboard` is called from the `GET /api/leaderboard` route handler** — confirmed,
   `src/app.py:73-77`. The handler is decorated `@app.route("/api/leaderboard")` (GET by default) and calls
   `sorted_leaderboard(entries)` on line 76.
5. **`tests/test_app.py::test_leaderboard_sorted_descending_by_score` exists and asserts `['High', 'Low']`** —
   confirmed, `tests/test_app.py:25-31`; entries `{"Low": 3}` / `{"High": 8}` on line 27, assertion on line 31.
6. **That test currently fails, getting `['Low', 'High']`** — confirmed by running it:
   `AssertionError: assert ['Low', 'High'] == ['High', 'Low']` at `tests/test_app.py:31`. It is the only
   failing test in the file (`1 failed, 12 passed`), so it is a clean, isolated proof of this bug.
7. **Fix direction ("add `reverse=True`, or negate the sort key")** — correct and sufficient; either form makes
   line 39 return descending order and satisfies the line-31 assertion with no test modification.
8. **Scope-note items are all real, separate code paths** — `leaderboard.json` persistence
   (`src/app.py:25-27` and `66-68`), the top-10 slicing (`src/app.py:76`), and Bug 001's scoring logic
   (`src/app.py:30-35`). None is required for this fix.
9. **Port 5000 in the reproduction steps** — confirmed, `src/app.py:81`: `app.run(debug=True, port=5000)`.

## Discrepancies Found

1. **Stale: "all-correct — 9/10, itself affected by Bug 001 above"** (research reproduction step 3).
   - *Claimed*: an all-correct 10-question run currently scores 9/10 because Bug 001's off-by-one is present.
   - *Actually found*: Bug 001 is **already fixed** in the current working tree. `src/app.py:32` reads
     `for i in range(len(answers)):`, not `range(len(answers) - 1)` as Bug 001's own research document
     (`context/bugs/001/research/codebase-research.md:13-19`) quotes. `tests/test_app.py`'s Bug 001 test
     (`test_all_correct_answers_score_full_total`, lines 13-22) now **passes**, and `src/questions.json`
     contains 10 questions — so an all-correct run scores **10/10**.
   - *Impact*: secondary. The reproduction steps still produce the bug (run 2 still scores higher than run 1);
     only the specific expected number is wrong. Diagnosis and fix unaffected.

2. **Imprecise: the route handler "returns its result directly as the leaderboard payload"** (research
   line 18).
   - *Claimed*: the handler returns `sorted_leaderboard`'s result directly.
   - *Actually found*: `src/app.py:76` slices it — `top = sorted_leaderboard(entries)[:10]` — and line 77
     returns `jsonify(top)`.
   - *Impact*: secondary, and the research's own Scope note does acknowledge the slicing exists, so this reads
     as loose phrasing rather than a misreading. Worth flagging because it *understates* severity: with
     ascending sort plus `[:10]`, once there are more than 10 entries the highest scores are dropped from the
     payload entirely, not merely displayed last.

3. **Not verified (not contradicted): the manual browser reproduction** (research steps 1-4).
   - The Flask app was not started and the UI was not observed firsthand. The underlying logic was verified
     directly instead (items 3 and 6 above), and the port claim checks out at `src/app.py:81`. Listed for
     completeness of the citation trail, not as an error.

## Research Quality Assessment

**Level: Mostly Verified**

Reasoning, per `skills/research-quality-measurement.md`:

- **Verified** requires zero discrepancies. Two claims are inaccurate (the stale 9/10 Bug 001 figure, and
  "returns its result directly" when the handler slices `[:10]`), so Verified does not apply.
- **Needs Rework** requires at least one claim *central to the diagnosis* to be wrong. Nothing central is
  wrong: root cause (missing `reverse=True`), primary citation (`src/app.py:39`), the failing-test proof, and
  the proposed fix all check out against the source and against actual test execution.
- **Unverifiable** does not apply — every cited file, function, and line exists, and all citations are
  concrete and exact.
- **Mostly Verified** matches precisely: correct core claims plus minor secondary issues confined to the
  supporting narrative.

Guidance for the Bug Planner: plan the fix from this document, but (a) ignore the "9/10" figure — Bug 001 is
already fixed and an all-correct run scores 10/10, so a fresh reproduction will show different numbers; and
(b) note that the route handler slices to the top 10 *after* sorting, so the ascending sort can hide high
scores, not just misorder them. The slice itself is out of scope per the research's Scope note, and correctly
so — fixing the sort direction resolves both symptoms.

## References

Every file:line personally opened and checked during this verification:

- `context/bugs/002/research/codebase-research.md:1-41` — full source research document.
- `skills/research-quality-measurement.md:1-54` — rubric levels and assignment procedure.
- `src/app.py:25-27` — `save_leaderboard` (scope-note reference).
- `src/app.py:30-35` — `compute_score`; line 32 shows Bug 001 already fixed.
- `src/app.py:38-39` — `sorted_leaderboard`; **line 39 is the bug** (primary citation, confirmed exact).
- `src/app.py:66-68` — entry append + persist inside `/api/submit` (scope-note reference).
- `src/app.py:73-77` — `/api/leaderboard` handler; line 76 calls `sorted_leaderboard` and slices `[:10]`.
- `src/app.py:81` — `app.run(debug=True, port=5000)`.
- `tests/test_app.py:1-31` — imports and both regression seeds, including the line-31 assertion.
- `tests/test_app.py:34-182` — existing Bug 001 regression suite (further evidence Bug 001 is resolved).
- `src/leaderboard.json:1-10` — current stored entries (`Elia` 8, `Elia` 0) — unsorted on disk, as expected.
- `src/questions.json` — parsed, 10 questions (count verified, not line-cited).
- `src/static/quiz.js:26-28,76` — frontend sends one answer per question (`new Array(questions.length)`),
  confirming a full 10-element `answers` payload reaches `compute_score`.
- `context/bugs/001/research/codebase-research.md:1-40` — consulted only to confirm what Bug 001 originally
  claimed, for discrepancy 1.

Execution evidence:

- `python3 -m pytest tests/test_app.py -q` → `1 failed, 12 passed`; the sole failure is
  `test_leaderboard_sorted_descending_by_score` with `assert ['Low', 'High'] == ['High', 'Low']`.

Research Quality: Mostly Verified
