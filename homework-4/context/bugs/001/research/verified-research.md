# Verified Research — Bug 001 (Off-by-one scoring)

Source document verified: `context/bugs/001/research/codebase-research.md`
Verified on: 2026-07-29
Verified against: the current working tree (`src/app.py`, `tests/test_app.py`, `src/questions.json`,
`src/static/quiz.js`) **and** `HEAD:homework-4/src/app.py` at commit `3085e0e`
("Homework 4: seeded-bug checkpoint before running the 4-agent pipeline").

> Note: this file replaces an earlier verification pass that assigned **Verified**. That pass was accurate
> when it ran, but the working tree has since changed (the fix has been applied on disk), so several
> present-tense claims in the research no longer hold against the current source. The level is downgraded
> accordingly — see Discrepancies Found.

## Verification Summary

**Overall: PASS with discrepancies.**

The diagnosis is correct and independently reproducible **against the seeded-bug commit**: there,
`compute_score` loops `range(len(answers) - 1)` and an all-correct 10-question submission scores 9. I
confirmed this by executing the HEAD version of `compute_score` in isolation — it returns `9` for
`answers=[0]*10` against 10 questions whose `answer_index` is `0`.

Two things the Bug Planner must know before planning:

1. **The buggy line is no longer on disk.** The working tree already contains the fix —
   `src/app.py:32` now reads `for i in range(len(answers)):`, an uncommitted modification against `3085e0e`
   (`git diff -- src/app.py`). The research's quoted snippet matches HEAD, not the current file.
2. **The research document is byte-identical to its own input**, `context/bugs/001/bug-context.md`
   (`diff` reports no differences). It restates the provided bug context rather than adding independent
   codebase investigation. Every claim in it is accurate, but none of them was independently sourced.

**Research Quality: Mostly Verified** (per `skills/research-quality-measurement.md`; reasoning below).

## Verified Claims

1. **`compute_score(answers, questions)` exists as claimed** — `src/app.py:30`.

2. **The buggy loop is at line 32** — confirmed against `HEAD:homework-4/src/app.py:32`, which reads exactly
   `    for i in range(len(answers) - 1):`. The cited line number is exact, not merely within drift
   tolerance.

3. **The quoted snippet matches the HEAD source** — the six-line `compute_score` block in the research
   (signature, `score = 0`, the loop, the `answer_index` comparison, `score += 1`, `return score`) reproduces
   `HEAD:homework-4/src/app.py:30-35` character-for-character. The inline `# <-- line 32: should be
   range(len(answers))` is a clearly-marked authoring annotation, not a claimed source line.

4. **`range(len(answers) - 1)` iterates `0..8` for a 10-item list, skipping index 9** — confirmed by
   execution, not just by reading: HEAD `compute_score([0]*10, [{"answer_index": 0}]*10)` returned `9`.
   The claim that the last answer is dropped whether right or wrong is correct — index 9 is never visited.

5. **`compute_score` is called from the `POST /api/submit` route handler** — route declared at
   `src/app.py:57`, handler `submit()` at `src/app.py:58`, call at `src/app.py:64`.

6. **The quiz has 10 questions, each with an `answer_index` field** — `src/questions.json` parses to a
   10-element list with keys `id`, `question`, `choices`, `answer_index`.

7. **The repro entry point is accurate** — `app.run(debug=True, port=5000)` at `src/app.py:81`; `/` serves
   `index.html` at `src/app.py:42-44`; `src/static/index.html` exists; the submit response is
   `{"score": ..., "total": len(questions)}` at `src/app.py:70`, rendered as
   `` `${result.score} / ${result.total}` `` at `src/static/quiz.js:80`. So the result screen does display
   `score / total`, and against the buggy code that is `9 / 10`.

8. **`tests/test_app.py::test_all_correct_answers_score_full_total` exists and encodes this bug** —
   `tests/test_app.py:13-22`: `total = 10`, `questions = _questions(total)`, `answers = [0] * total`,
   `assert score == total`. Against the HEAD implementation this assertion fails with exactly
   `assert 9 == 10`, which I confirmed by executing the test's inputs directly.

9. **The leaderboard bug is separate and out of scope** — `sorted_leaderboard` at `src/app.py:38-39` sorts
   ascending by `score` with no `reverse=True`, and `context/bugs/002/bug-context.md` exists. The scope note
   is accurate.

10. **The prescribed fix is correct** — `range(len(answers))` (or an equivalent `zip`/`enumerate` form) makes
    the loop cover index 9, yielding `10` for the test inputs and `10 / 10` on the UI, with no other line in
    `compute_score` needing to change. The change currently present in the working tree is exactly this form.

## Discrepancies Found

1. **The primary quoted snippet does not match the current on-disk file (working-tree drift).**
   - *Claimed*: `src/app.py:32` reads `for i in range(len(answers) - 1):`.
   - *Actually found on disk*: `src/app.py:32` reads `for i in range(len(answers)):` — the `- 1` is gone.
     `git diff -- src/app.py` shows this as an uncommitted modification against `3085e0e`.
   - *Assessment*: the citation is correct for the commit the research targeted, and the diagnosis is
     unaffected — but the document reads as present tense ("only checks the first 9 of 10 questions"), which
     is no longer true of the working tree. A plan that says "change line 32 from `range(len(answers) - 1)`"
     will not apply as written.

2. **Repro step 3 no longer reproduces.**
   - *Claimed*: submitting 10 correct answers shows **9 / 10**.
   - *Actually*: with the working tree as it stands, it shows 10 / 10. The claim is reproducible only after
     reverting `src/app.py` to `3085e0e`.

3. **"`test_all_correct_answers_score_full_total` currently fails with `assert 9 == 10`" is stale.**
   - *Claimed*: the test currently fails, and that failure is the bug's automated proof.
   - *Actually*: against the current working tree `compute_score` returns `10` and the assertion holds. The
     failure is real against HEAD only.
   - *Method note, stated plainly rather than glossed*: `pytest` is **not installed** in `src/.venv` and is
     not listed in `src/requirements.txt` (which contains only `flask`), so `python3 -m pytest` could not be
     invoked at all. I verified the underlying arithmetic by direct function execution instead. The literal
     claim about pytest output therefore remains unverified as stated.

4. **The document is not independent research.**
   `diff context/bugs/001/bug-context.md context/bugs/001/research/codebase-research.md` reports no
   differences — the research output is a verbatim copy of its own input. Nothing is factually wrong because
   of this, but no claim in it represents a fresh look at the codebase; its accuracy is inherited from the
   bug context rather than established by research. Flagging this plainly: the citation trail in *this*
   document, not the research document, is what establishes that the claims hold.

5. **Minor imprecision (non-blocking).** The research describes the loop as checking "the first 9 of 10
   questions," which is specific to a 10-item list. The actual defect is `n - 1` for any length `n` (it
   scores `0` for a single-question list). Not misleading here, since the quiz is fixed at 10 questions, but
   the fix rationale is more general than stated.

## Research Quality Assessment

**Level: Mostly Verified.**

Reasoning, against the criteria in `skills/research-quality-measurement.md`:

- **Core claims are correct.** The root cause (`range(len(answers) - 1)` dropping the final index), the
  mechanism (index 9 never compared), the call site (`POST /api/submit`), the observable symptom (`9 / 10`),
  the regression test, and the prescribed fix are all accurate, and I confirmed the 9-vs-10 outcome by
  executing the code rather than by reading alone. The primary file:line citation (`src/app.py:32`) is exact
  against the commit the research targeted.
- **Not `Verified`**, because that level requires zero discrepancies and requires every quoted snippet to
  match the actual source. Against the file as it exists on disk right now, the primary quoted snippet does
  not match, and three present-tense claims (the snippet, repro step 3, the failing test) are stale. That is
  a real, non-zero discrepancy set, and per rule 3 of the skill I am not rounding it up out of politeness.
- **Not `Needs Rework`**, because no discrepancy touches the correctness of the diagnosis. The mismatch is
  source drift from a fix already applied downstream in the working tree, not a misreading of the code —
  every stale claim is verifiably true at `3085e0e`. The `Mostly Verified` description covers exactly this
  shape: core claims correct, drift-induced staleness, diagnosis intact.
- **Not `Unverifiable`**, because every cited file, function, and line exists and the document gives
  concrete file:line citations that I checked directly.
- Discrepancy 4 (the document duplicating its input) is a **process** weakness rather than a factual error,
  so under a rubric that weighs discrepancies by their effect on the core diagnosis it does not lower the
  level on its own. It does, however, mean the document earns no credit for independent corroboration.

**Action for the Bug Planner:** safe to plan from, but first re-read `src/app.py:30-35` to confirm the
current state of the loop — the fix may already be present in the working tree. Do not plan an edit that
assumes `- 1` is still there. Also account for installing `pytest` before relying on `python3 -m pytest` as
the verification step.

## References

Every location I personally opened and checked:

- `context/bugs/001/research/codebase-research.md` — read in full (43 lines)
- `src/app.py:1-81` — read in full
- `src/app.py:30` — `def compute_score(answers, questions):`
- `src/app.py:32` — working-tree loop: `for i in range(len(answers)):` (fix already applied)
- `src/app.py:33` — `if answers[i] == questions[i]["answer_index"]:`
- `src/app.py:38-39` — `sorted_leaderboard`, ascending sort (bug 002, out of scope)
- `src/app.py:42-44` — `/` route serving `index.html`
- `src/app.py:57-58` — `POST /api/submit` route + `submit()` handler
- `src/app.py:64` — `score = compute_score(answers, questions)`
- `src/app.py:70` — `jsonify({"score": score, "total": len(questions)})`
- `src/app.py:81` — `app.run(debug=True, port=5000)`
- `HEAD:homework-4/src/app.py:30-35` (commit `3085e0e`) — original buggy `compute_score`; loop with `- 1` at
  line 32
- `tests/test_app.py:1-6` — imports `compute_score`, `sorted_leaderboard` from `src/app.py`
- `tests/test_app.py:9-10` — `_questions(n)` helper (`answer_index: 0`)
- `tests/test_app.py:13-22` — `test_all_correct_answers_score_full_total`
- `tests/test_app.py:25` — `test_leaderboard_sorted_descending_by_score` (bug 002)
- `src/questions.json` — parsed: 10 entries, keys `id`, `question`, `choices`, `answer_index`
- `src/static/index.html` — confirmed to exist
- `src/static/quiz.js:80` — `` scoreDisplay.textContent = `${result.score} / ${result.total}` ``
- `src/requirements.txt` — contains only `flask` (no pytest)
- `context/bugs/001/bug-context.md` — byte-identical to the research document (`diff`: no differences)
- `context/bugs/002/bug-context.md` — confirmed to exist
- `skills/research-quality-measurement.md:1-53` — read in full, rubric applied above

Executed checks:
- `HEAD` version: `compute_score([0]*10, [{"answer_index": 0}]*10)` → returned `9` (test expects `10`)
- `git log --oneline`, `git diff -- src/app.py` → established the working-tree drift
- `python3 -m pytest tests/test_app.py` → could not run: `No module named pytest` in `src/.venv`

Research Quality: Mostly Verified
