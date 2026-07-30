# Bug Context 001 — Off-by-one scoring (last question never counted)

## What the bug is

The quiz scoring function only checks the first 9 of 10 questions. The last question's answer is never
compared against the correct answer — so it never counts, whether the player got it right or wrong.

## Where it lives

`src/app.py`, function `compute_score(answers, questions)`, line 32:

```python
def compute_score(answers, questions):
    score = 0
    for i in range(len(answers) - 1):    # <-- line 32: should be range(len(answers))
        if answers[i] == questions[i]["answer_index"]:
            score += 1
    return score
```

`range(len(answers) - 1)` iterates indices `0..8` for a 10-item `answers` list, skipping index `9` (the tenth
question) entirely. `compute_score` is called from the `POST /api/submit` route handler.

## How to reproduce

1. Start the app (`cd src && python3 app.py`), open `http://localhost:5000`.
2. Answer all 10 questions correctly (check `src/questions.json`'s `answer_index` field per question if
   playing manually rather than knowing the trivia answers).
3. Submit. The result screen shows **9 / 10**, not 10/10.

Equivalently, `tests/test_app.py::test_all_correct_answers_score_full_total` currently fails with
`assert 9 == 10` — that failure is this bug's automated proof.

## What "fixed" looks like

The loop covers every index in `answers` (`range(len(answers))`, or an equivalent `zip`/`enumerate` form that
doesn't drop the last element). After the fix, an all-correct submission scores `10 / 10`, and
`test_all_correct_answers_score_full_total` passes without being modified.

## Scope note

Only touch `compute_score`. Don't change `questions.json`, the submit route's request/response shape, or the
leaderboard-sorting bug (that's a separate, unrelated bug — see `context/bugs/002/bug-context.md`).
