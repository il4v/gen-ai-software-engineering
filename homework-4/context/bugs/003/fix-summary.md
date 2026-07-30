# Fix Summary — Bug 003: Reflected XSS via unsanitized player name on the leaderboard

## Changes Made

### `src/static/quiz.js`
- **Location:** `showLeaderboard()`, formerly line 90 (inside the `entries.forEach(...)` loop)
- **Before:**
  ```javascript
  leaderboardList.innerHTML = "";
  entries.forEach((entry) => {
    leaderboardList.innerHTML += `<li>${entry.name} — ${entry.score}</li>`;
  });
  ```
- **After:**
  ```javascript
  leaderboardList.innerHTML = "";
  entries.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = `${entry.name} — ${entry.score}`;
    leaderboardList.appendChild(li);
  });
  ```
- **Interpretation notes:** The plan offered two acceptable approaches — `document.createTextNode`/`textContent`,
  or an explicit HTML-escaping helper kept alongside `innerHTML` concatenation. I used the `createElement` +
  `textContent` approach (consistent with the existing DOM-building style already used in `renderQuestion()`
  elsewhere in the same file), which guarantees `entry.name` is always inserted as literal text and can never be
  parsed as HTML/script, regardless of content.
- **Test result:** `cd tests && pytest -v` — **13 passed**, 0 failed (see below; this is a frontend-only change,
  so the existing Python test suite — which covers `compute_score` and `sorted_leaderboard` — was unaffected and
  used as a regression check per the plan's scope note).

## Overall Status

The single planned change was applied and the test suite passes in full. Nothing stopped early; there was only
one change item in the plan.

```
============================= test session starts ==============================
collected 13 items

test_app.py::test_all_correct_answers_score_full_total PASSED            [  7%]
test_app.py::test_leaderboard_sorted_descending_by_score PASSED          [ 15%]
test_app.py::test_last_question_correct_is_counted PASSED                [ 23%]
test_app.py::test_last_question_wrong_is_also_counted PASSED             [ 30%]
test_app.py::test_only_last_question_in_quiz PASSED                      [ 38%]
test_app.py::test_two_question_quiz_both_correct PASSED                  [ 46%]
test_app.py::test_two_question_quiz_only_last_correct PASSED             [ 53%]
test_app.py::test_all_wrong_answers_score_zero PASSED                    [ 61%]
test_app.py::test_mixed_correct_and_wrong_answers PASSED                 [ 69%]
test_app.py::test_all_correct_answers_small_quiz PASSED                  [ 76%]
test_app.py::test_all_correct_answers_large_quiz PASSED                  [ 84%]
test_app.py::test_score_with_varied_answer_indices PASSED                [ 92%]
test_app.py::test_score_partial_with_varied_answer_indices PASSED        [100%]

============================== 13 passed in 0.05s ==============================
```

## Manual Verification

1. Start the app (e.g. `cd src && python app.py`, or however this project is normally run) and open
   `http://localhost:5000` in a browser.
2. On the landing screen, enter this as the player name:
   ```
   <img src=x onerror=alert(1)>
   ```
3. Complete the quiz with any answers and submit.
4. Open the leaderboard screen (or navigate to it fresh in a new tab).
   - **Expected (fixed) behavior:** No `alert(1)` popup fires. The leaderboard row shows the literal text
     `<img src=x onerror=alert(1)> — <score>` on the page.
   - **Prior (buggy) behavior:** An `alert(1)` dialog would have fired immediately on view.
5. Non-alerting proof: submit a name of `<b>test</b>` and confirm the leaderboard shows the literal characters
   `<b>test</b> — <score>` rather than rendering the word **test** in bold.
6. Optional automated confirmation: run `cd tests && pytest -v` and confirm all 13 tests pass (this change is
   frontend-only, so these backend tests serve as a non-regression check, not a direct verification of the XSS
   fix itself — the browser steps above are the actual verification).

## References

- Plan: `context/bugs/003/implementation-plan.md`
- Source file touched: `src/static/quiz.js` (`showLeaderboard()` function)
