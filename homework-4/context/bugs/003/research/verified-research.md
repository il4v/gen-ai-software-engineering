# Verified Research — Bug 003 (XSS via unsanitized player name on the leaderboard)

Source document: `context/bugs/003/research/codebase-research.md` (51 lines, read in full)
Rubric applied: `skills/research-quality-measurement.md` (read in full)

## Verification Summary

**Overall: PASS** — the core diagnosis holds up. The vulnerable render line exists at the exact cited
file:line with a byte-accurate snippet, the data flow from user input → server persistence → leaderboard
render is confirmed end to end, the reproduction steps are executable as written, and the proposed fix
direction is correct.

**Research Quality: Mostly Verified** — one discrepancy found, terminological only: the document's title
classifies this as *reflected* XSS, while the code shows *stored* (persistent) XSS. The diagnosis, the
primary citation, and the fix are unaffected.

## Verified Claims

1. **Primary citation is exact, with no drift.** `src/static/quiz.js:90` reads verbatim:
   ``leaderboardList.innerHTML += `<li>${entry.name} — ${entry.score}</li>`;`` — path, line number, and
   quoted snippet match character for character, including the em dash.
2. **The line is inside `showLeaderboard()` as claimed.** The function is declared at `src/static/quiz.js:84`
   and spans lines 84–94; line 90 sits inside its `entries.forEach` callback (`src/static/quiz.js:89-91`).
3. **`innerHTML` string interpolation is genuinely the injection sink.** The row markup is built as a template
   string and assigned through `innerHTML`, so any `<`/`>` in `entry.name` is parsed by the browser as real
   HTML rather than rendered as literal text. The research's explanation of *why* this is a bug is an accurate
   reading of the code. (`src/static/quiz.js:88-91`)
4. **`entry.name` comes straight from `GET /api/leaderboard`.** `src/static/quiz.js:85-86` fetches
   `/api/leaderboard` and parses the JSON into `entries`, the array iterated at line 89. No escaping step
   exists between fetch and render.
5. **The server returns stored names unescaped.** `src/app.py:73-77` loads the leaderboard, slices the sorted
   list to 10, and `jsonify`s it — JSON encoding, not HTML escaping.
6. **The quoted server-side line is exact.** `src/app.py:60` is
   `name = (data.get("name") or "").strip() or "Anonymous"`, inside the `submit()` route decorated
   `@app.route("/api/submit", methods=["POST"])` (`src/app.py:57-58`).
7. **No HTML-escaping or sanitization anywhere server-side.** Confirmed by reading all 81 lines of
   `src/app.py`: no `escape`, `markupsafe`, `bleach`, or equivalent. The frontend is served as a *static* file
   (`src/app.py:42-44`, `static_folder="static"` at `src/app.py:10`), so Jinja autoescaping never applies
   either — a real detail in the research's favor.
8. **The payload is persisted, so it fires for every later viewer.** The raw name is appended at
   `src/app.py:67` (`entries.append({"name": name, "score": score})`) and written to disk by
   `save_leaderboard()` (`src/app.py:68`, `src/app.py:25-27`) at `LEADERBOARD_PATH` = `src/leaderboard.json`
   (`src/app.py:8`), then reloaded on every request by `load_leaderboard()` (`src/app.py:18-22`).
9. **Reproduction steps are accurate and currently executable.**
   - `http://localhost:5000` matches `app.run(debug=True, port=5000)` (`src/app.py:81`).
   - The landing screen has the name field `#name-input` (`src/static/index.html:14`), read into `playerName`
     by `startQuiz()` (`src/static/quiz.js:23-24`) and posted as `name` by `submitQuiz()`
     (`src/static/quiz.js:76`).
   - The leaderboard is reachable both from the landing screen (`#view-leaderboard-btn`) and the result screen
     (`#show-leaderboard-btn`), both wired to `showLeaderboard()` (`src/static/quiz.js:96-103`;
     `src/static/index.html:16`, `:27`).
   - The payload lands in the rendered top-10: `src/leaderboard.json` currently holds only 2 entries
     (`Elia`/8, `Elia`/0), so a third entry is always inside the `[:10]` slice at `src/app.py:76`.
   - The payload `<img src=x onerror=alert(1)>` is 28 characters, within the input's `maxlength="40"`
     (`src/static/index.html:14`), so the repro is viable through the UI as written.
10. **The `<li>` target container is real and correctly typed.** `src/static/index.html:33` declares
    `<ol id="leaderboard-list"></ol>`, bound at `src/static/quiz.js:13`, so `<li>` children are valid markup —
    a `createElement("li")` fix keeps the same structure.
11. **The leaderboard render is the *only* unsafe display path for the name.** Every other dynamic render in
    the codebase already uses `textContent` (`src/static/quiz.js:44`, `:51`, `:80`); the only other `innerHTML`
    uses assign constant empty strings (`src/static/quiz.js:36`, `:88`). So the research's "wherever it's
    displayed" scope resolves to exactly one line, and the file already contains the safe pattern the fix
    should follow.
12. **Scope exclusions are correct.** `compute_score` (`src/app.py:30-35`) and `sorted_leaderboard`
    (`src/app.py:38-39`) exist as distinct functions and are not on the XSS path — neither touches `name`.
    Fixing the render path also neutralizes the two existing `src/leaderboard.json` entries without any data
    migration, as the research claims.

## Discrepancies Found

1. **Vulnerability class mislabeled in the title: "reflected" should be "stored".**
   - *Claimed*: line 1 heading — "Reflected XSS via unsanitized player name on the leaderboard"; body line 6-7
     hedges as "a stored/reflected XSS vulnerability".
   - *Actually found*: this is unambiguously **stored** XSS. The name is written to disk
     (`src/app.py:67-68` → `src/app.py:25-27`) and re-served to every subsequent visitor of
     `/api/leaderboard` (`src/app.py:73-77`). There is no request-echo path anywhere in `src/app.py`; nothing
     reflects a parameter back into an immediate response.
   - *Impact*: **secondary — does not change the diagnosis, the file:line, or the fix.** It does understate
     severity: stored XSS hits every visitor to the leaderboard, not just a victim who follows a crafted link.
     The Bug Planner should classify it as stored XSS in the plan. Note the document's own parenthetical
     ("persisted in `leaderboard.json`, executed on every later leaderboard view") describes the stored
     behavior correctly, so this reads as loose naming rather than a misunderstanding of the code.

No other discrepancies. Every file:line citation in the document was checked and found correct; no quoted
snippet was mismatched; no cited file, function, or line was missing or unverifiable; no claimed behavior was
a misreading of the source.

*Correction to a prior revision of this file*: an earlier version of `verified-research.md` asserted that
`sorted_leaderboard` sorts **ascending** and flagged the repro as conditional on that. That was wrong —
`src/app.py:39` is `sorted(entries, key=lambda e: e["score"], reverse=True)`, i.e. **descending**. That
finding is withdrawn and is not counted as a discrepancy against the research.

## Research Quality Assessment

**Level: Mostly Verified**

Reasoning, against the rubric in `skills/research-quality-measurement.md`:

- Not **Verified**: that level requires *zero* discrepancies, and Discrepancy #1 is a genuine
  mischaracterization sitting in the document's own title. Per the rubric's "do not round up out of
  politeness," a real (if minor) inaccuracy keeps it off the top level.
- Not **Needs Rework**: no claim central to the diagnosis is wrong. The root cause (unescaped `innerHTML`
  interpolation of attacker-controlled `entry.name`) and the primary citation (`src/static/quiz.js:90`) are
  both exactly correct, snippet included.
- Not **Unverifiable**: every cited file, function, and line exists in the current codebase at the stated
  location, and the citations were concrete enough to check line by line.
- **Mostly Verified** fits precisely: core claims correct, minor issue only — "a paraphrase that's slightly
  imprecise but not misleading" — and no discrepancy changes the diagnosis.

**Guidance for the Bug Planner**: safe to plan from directly. Treat `src/static/quiz.js:90` as a trustworthy,
un-drifted citation and the single point of fix. The one sanity-check to apply: describe the issue as *stored*
XSS affecting all leaderboard viewers, and do not let the title's "reflected" wording lead to a fix or test
scoped only to the submitting session. If a regression test drives the UI, respect the `maxlength="40"` cap at
`src/static/index.html:14`.

## References

Every location below was opened and read directly during this verification.

| Location | What was checked |
|---|---|
| `context/bugs/003/research/codebase-research.md:1-51` | Source research document, full read |
| `skills/research-quality-measurement.md:1-53` | Rubric used to assign the quality level |
| `src/static/quiz.js:1-109` | Full file read |
| `src/static/quiz.js:13` | `leaderboardList` bound to `#leaderboard-list` |
| `src/static/quiz.js:23-24` | Player name read from `#name-input` into `playerName` |
| `src/static/quiz.js:36, 44, 51, 80` | Other render paths — all safe (`textContent` / constant `""`) |
| `src/static/quiz.js:76` | Name sent as `name` in the `POST /api/submit` body |
| `src/static/quiz.js:84-94` | `showLeaderboard()` body |
| `src/static/quiz.js:85-86` | Fetch + JSON parse of `/api/leaderboard` |
| `src/static/quiz.js:88` | `leaderboardList.innerHTML = ""` reset (constant, safe) |
| **`src/static/quiz.js:90`** | **Primary vulnerable line — snippet confirmed exact** |
| `src/static/quiz.js:96-103` | Both leaderboard entry-point listeners |
| `src/app.py:1-81` | Full file read |
| `src/app.py:8` | `LEADERBOARD_PATH` → `src/leaderboard.json` |
| `src/app.py:10` | `static_folder="static"` — frontend served statically, no Jinja autoescape |
| `src/app.py:18-22` | `load_leaderboard()` re-reads stored entries per request |
| `src/app.py:25-27` | `save_leaderboard()` writes entries verbatim |
| `src/app.py:30-35` | `compute_score` — out of scope, confirmed off the XSS path |
| `src/app.py:38-39` | `sorted_leaderboard` — `reverse=True` (descending) |
| `src/app.py:42-44` | `index()` serves `index.html` as a static file |
| `src/app.py:57-70` | `submit()` route |
| `src/app.py:60` | `name = (data.get("name") or "").strip() or "Anonymous"` — quoted line exact |
| `src/app.py:67-68` | Raw name persisted with no escaping |
| `src/app.py:73-77` | `/api/leaderboard` route, sorted top-10 slice |
| `src/app.py:81` | `app.run(debug=True, port=5000)` |
| `src/static/index.html:1-40` | Full file read |
| `src/static/index.html:14` | `#name-input`, `maxlength="40"` |
| `src/static/index.html:16, 33` | `#view-leaderboard-btn`; `<ol id="leaderboard-list">` |
| `src/static/index.html:27` | `#show-leaderboard-btn` on the result screen |
| `src/leaderboard.json:1-10` | Exists; 2 entries (`Elia`/8, `Elia`/0) — confirms stored-data claim |
| `src/` tree listing + repo-wide search for `leaderboard-list` / `leaderboard.json` | No other render or storage path exists |

Research Quality: Mostly Verified
