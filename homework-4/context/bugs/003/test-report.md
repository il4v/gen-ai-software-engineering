# Test Report — Bug 003: Reflected XSS via unsanitized player name

## Summary

**Status:** ✅ **PASS** — 18 unit tests written and executed against the fixed code.

**Test Framework:** Jest (JavaScript) + jsdom (DOM simulation)  
**Test File:** `tests/quiz.test.js`  
**Changed Code Covered:** `src/static/quiz.js` — `showLeaderboard()` function (lines 88–93)

---

## Files with New Tests

| File | Test Count | Purpose |
|------|-----------|---------|
| `tests/quiz.test.js` | 18 | Unit tests for XSS prevention and leaderboard display logic |

---

## Test Cases

### Group 1: XSS Prevention (Regression Tests)

#### 1. **REGRESSION: Should not execute script when player name contains `<img>` tag with onerror**
- **Description:** Validates that XSS payloads with `onerror` event handlers do not execute. This is the core regression test for Bug 003.
- **Scenario:** Leaderboard entry contains `<img src=x onerror=alert(1)>` as player name.
- **Expectation:** No `alert()` is called; the code does not trigger the script.
- **Validates Fix:** Confirms `textContent` prevents HTML/JavaScript parsing.

#### 2. **REGRESSION: Should display XSS payload as literal text, not HTML**
- **Description:** Verifies that XSS payloads appear as plain text on the page, not as rendered HTML elements.
- **Scenario:** Entry name is `<img src=x onerror=alert(1)>`, score is 100.
- **Expectation:** `textContent` is `<img src=x onerror=alert(1)> — 100`; no `<img>` tag in innerHTML.
- **Validates Fix:** Confirms safe display of malicious input.

#### 3. **REGRESSION: Should not execute `<script>` tags in player names**
- **Description:** Ensures `<script>` payloads cannot execute within leaderboard names.
- **Scenario:** Entry name is `<script>alert("xss")</script>`.
- **Expectation:** No `alert()` fires.
- **Validates Fix:** Confirms script tags are treated as text.

#### 4. **REGRESSION: Bold tags in player names should be displayed as text, not formatted**
- **Description:** Verifies the manual verification step from the fix summary (entering `<b>test</b>`).
- **Scenario:** Entry name is `<b>test</b>`, score is 75.
- **Expectation:** Displayed as literal string; no `<b>` element created in the DOM.
- **Validates Fix:** Confirms styling tags are not interpreted.

#### 5. **REGRESSION: iframe payloads should not be embedded**
- **Description:** Ensures iframe injection attempts are safely neutralized.
- **Scenario:** Entry name is `<iframe src="evil.com"></iframe>`.
- **Expectation:** No iframe element in leaderboard list; text displayed literally.
- **Validates Fix:** Confirms complex HTML payloads are blocked.

### Group 2: Happy Path & Normal Behavior

#### 6. **Should display normal player names correctly**
- **Description:** Verifies core functionality — normal names and scores display as expected.
- **Scenario:** Three players (Alice: 100, Bob: 85, Charlie: 70) in leaderboard.
- **Expectation:** All three entries render with correct text content.
- **Validates:** Normal operation is preserved by the fix.

#### 7. **Should clear previous leaderboard entries before adding new ones**
- **Description:** Ensures state management: stale entries are cleared before new data is added.
- **Scenario:** Pre-populate leaderboard with stale data, then load fresh data.
- **Expectation:** Only fresh entry is present; stale entry is removed.
- **Validates:** Fix does not break existing clear logic.

#### 8. **Should fetch from /api/leaderboard endpoint**
- **Description:** Confirms API integration — the function fetches from the correct endpoint.
- **Scenario:** Mock fetch is set up; `showLeaderboard()` is called.
- **Expectation:** `fetch()` is called with `/api/leaderboard`.
- **Validates:** Fix does not break API contract.

#### 9. **Should show leaderboard screen after loading data**
- **Description:** Verifies screen visibility logic — leaderboard screen is shown after data loads.
- **Scenario:** Leaderboard screen starts hidden; `showLeaderboard()` is called.
- **Expectation:** Screen becomes visible (not hidden).
- **Validates:** UI flow is unchanged by the fix.

#### 10. **Should create li elements dynamically**
- **Description:** Confirms that the fixed code uses `createElement()` to create list items.
- **Scenario:** Leaderboard data is loaded; DOM is checked.
- **Expectation:** `<li>` elements are present in DOM as true Node objects.
- **Validates:** Fix uses DOM API correctly (not innerHTML concatenation).

### Group 3: Edge Cases

#### 11. **Should handle empty leaderboard**
- **Description:** Boundary condition — no entries in leaderboard.
- **Scenario:** Leaderboard JSON is `[]`.
- **Expectation:** No list items are created; list remains empty.
- **Validates:** Code handles edge case gracefully.

#### 12. **Should handle player names with special characters**
- **Description:** Robustness — names with punctuation, Unicode, and emoji.
- **Scenario:** Players named `Player@#$%`, `José`, `🎮Player`.
- **Expectation:** All special characters display correctly via `textContent`.
- **Validates:** No character set issues with the fix.

#### 13. **Should handle player names with quotes and apostrophes**
- **Description:** Robustness — names containing quote characters.
- **Scenario:** Players named `O'Brien`, `Player "Admin"`.
- **Expectation:** Quotes are displayed literally.
- **Validates:** Quote handling doesn't break the fix.

#### 14. **Should handle player names with HTML entity characters**
- **Description:** Robustness — names containing `&`, `<`, `>`.
- **Scenario:** Players named `Player & Friends`, `<Tag>`.
- **Expectation:** Characters are displayed literally; no entity interpretation.
- **Validates:** textContent prevents entity parsing.

#### 15. **Should handle very long player names**
- **Description:** Robustness — 1000-character name.
- **Scenario:** Player name is 1000 'A' characters.
- **Expectation:** Full string is displayed without truncation or errors.
- **Validates:** No buffer overflow or length issues.

#### 16. **Should handle scores with various numeric values**
- **Description:** Robustness — zero, very high, negative scores.
- **Scenario:** Scores: 0, 9999, -100.
- **Expectation:** All numeric values display correctly in the string.
- **Validates:** Score handling is robust.

#### 17. **Should handle multiple entries with various payloads**
- **Description:** Comprehensive scenario — mix of normal names and XSS attempts across multiple entries.
- **Scenario:** Four entries: two normal, two with XSS payloads.
- **Expectation:** All displayed safely; no images or iframes created.
- **Validates:** Fix works reliably across mixed input.

#### 18. **Should properly escape HTML content in textContent**
- **Description:** Complex payloads — SVG and style tags.
- **Scenario:** Entry names are `<svg onload=alert(1)>` and `<style>body{display:none}</style>`.
- **Expectation:** No SVG or style elements in leaderboard; text displayed literally.
- **Validates:** Complex HTML payloads are neutralized.

---

## FIRST Principles Compliance Checklist

Each test satisfies the FIRST criteria:

| Criterion | Status | Details |
|-----------|--------|---------|
| **F**ast | ✅ PASS | No real I/O, network, or `sleep`. All tests run in ~0.4 seconds total. DOM operations and mocked fetch are in-memory. |
| **I**ndependent | ✅ PASS | Each test calls `beforeEach(setupDOM())` for fresh DOM state. No shared mutable state. Tests run in any order with same result. |
| **R**epeatable | ✅ PASS | No time/random/locale/external dependencies. All data is hardcoded. Same result every run, same machine or CI. |
| **S**elf-validating | ✅ PASS | Every test ends with explicit assertions (`expect()`). No manual inspection required. Pass/fail is boolean. |
| **T**imely | ✅ PASS | Tests written same run as fix. Cover the exact changed bug (XSS via unsanitized `innerHTML` concatenation). Regression + happy path + edge cases. |

---

## Test Execution Result

```
> homework-4@1.0.0 test
> jest

 PASS  tests/quiz.test.js
  showLeaderboard() - XSS Prevention (Bug 003 Regression Tests)
    ✓ REGRESSION: Should not execute script when player name contains <img> tag with onerror (4 ms)
    ✓ REGRESSION: Should display XSS payload as literal text, not HTML (2 ms)
    ✓ REGRESSION: Should not execute <script> tags in player names (2 ms)
    ✓ REGRESSION: Bold tags in player names should be displayed as text, not formatted (1 ms)
    ✓ REGRESSION: iframe payloads should not be embedded (1 ms)
  showLeaderboard() - Happy Path & Normal Behavior
    ✓ Should display normal player names correctly (1 ms)
    ✓ Should clear previous leaderboard entries before adding new ones (1 ms)
    ✓ Should fetch from /api/leaderboard endpoint (1 ms)
    ✓ Should show leaderboard screen after loading data (1 ms)
    ✓ Should create li elements dynamically (1 ms)
  showLeaderboard() - Edge Cases
    ✓ Should handle empty leaderboard (1 ms)
    ✓ Should handle player names with special characters (2 ms)
    ✓ Should handle player names with quotes and apostrophes (1 ms)
    ✓ Should handle player names with HTML entity characters (1 ms)
    ✓ Should handle very long player names (2 ms)
    ✓ Should handle scores with various numeric values (1 ms)
    ✓ Should handle multiple entries with various payloads (2 ms)
    ✓ Should properly escape HTML content in textContent (1 ms)

Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
Snapshots:   0 total
Time:        0.394 s
```

---

## Test Coverage Analysis

### What is tested:

1. **XSS Regression (Core Bug):** 5 tests directly validate that the fix prevents script execution via `textContent`.
2. **Normal Operation:** 5 tests ensure the fix doesn't break existing functionality (API calls, screen toggling, clear logic).
3. **Edge Cases:** 8 tests ensure robustness with special characters, long names, varied scores, and complex payloads.

### Coverage of changed code:

The changed lines in `src/static/quiz.js` (lines 88–93):
```javascript
leaderboardList.innerHTML = "";
entries.forEach((entry) => {
  const li = document.createElement("li");
  li.textContent = `${entry.name} — ${entry.score}`;
  leaderboardList.appendChild(li);
});
```

- ✅ `innerHTML = ""` — tested via "Should clear previous leaderboard entries"
- ✅ `createElement("li")` — tested via "Should create li elements dynamically"
- ✅ `textContent = ...` — tested in all 18 tests; core to XSS prevention
- ✅ `appendChild(li)` — tested via list presence in DOM queries

### Why not tested:

- **Backend (Python):** Bug 003 is frontend-only; Python tests in `tests/test_app.py` serve as non-regression check (13 Python tests already pass).
- **Browser integration:** Manual verification (open browser, view leaderboard, check no alert fires) confirmed in fix-summary.md step 3. Automated integration tests would require Selenium/Playwright but are beyond scope of unit testing this changed code.

---

## Regression Test Justification

### Before (Buggy Code):
```javascript
entries.forEach((entry) => {
  leaderboardList.innerHTML += `<li>${entry.name} — ${entry.score}</li>`;
});
```
**Vulnerability:** If `entry.name` contains `<img src=x onerror=alert(1)>`, the browser parses it as HTML and executes the JavaScript.

### After (Fixed Code):
```javascript
entries.forEach((entry) => {
  const li = document.createElement("li");
  li.textContent = `${entry.name} — ${entry.score}`;
  leaderboardList.appendChild(li);
});
```
**Fix:** `textContent` always treats input as literal text, never parsing it as HTML. Payloads are displayed as-is.

### Tests Confirm:
- **Regression tests (5):** Directly verify that XSS payloads no longer execute (`alert()` is not called, `<img>`/`<script>`/`<iframe>` tags are not created).
- **Happy path tests (5):** Confirm normal functionality still works (names display, API calls, screen toggles).
- **Edge case tests (8):** Ensure robustness under diverse input (special chars, quotes, long names, complex payloads).

---

## Conclusion

All 18 unit tests pass with 100% success rate. The tests:
1. ✅ Directly validate the XSS fix (regression tests for the exact vulnerability)
2. ✅ Confirm normal behavior is preserved (happy path tests)
3. ✅ Ensure robustness with edge cases
4. ✅ Follow FIRST principles (Fast, Independent, Repeatable, Self-validating, Timely)
5. ✅ Are written for changed code only (no unrelated legacy tests)

The fix is complete, tested, and ready for production.

---

## References

- **Fixed Code:** `src/static/quiz.js` — `showLeaderboard()` function
- **Fix Summary:** `context/bugs/003/fix-summary.md`
- **Test Framework:** Jest (Node.js) with jsdom (DOM simulation)
- **Test Location:** `tests/quiz.test.js` (18 tests)
