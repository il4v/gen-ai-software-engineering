import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from app import compute_score, sorted_leaderboard  # noqa: E402


def _questions(n):
    return [{"id": i, "answer_index": 0} for i in range(n)]


def test_all_correct_answers_score_full_total():
    """Regression seed for bug #1: an all-correct submission must score
    every question, not total - 1."""
    total = 10
    questions = _questions(total)
    answers = [0] * total

    score = compute_score(answers, questions)

    assert score == total


def test_leaderboard_sorted_descending_by_score():
    """Regression seed for bug #2: the highest score must be first."""
    entries = [{"name": "Low", "score": 3}, {"name": "High", "score": 8}]

    result = sorted_leaderboard(entries)

    assert [e["name"] for e in result] == ["High", "Low"]


# ============================================================================
# REGRESSION TESTS FOR BUG #1: Off-by-one scoring (last question never counted)
# ============================================================================


def test_last_question_correct_is_counted():
    """Regression: last question must be counted when correct (the core bug fix).

    Before fix: range(len(answers) - 1) skipped the last item.
    After fix: range(len(answers)) includes it.
    """
    questions = _questions(3)
    answers = [1, 1, 0]  # Only the last question correct

    score = compute_score(answers, questions)

    assert score == 1


def test_last_question_wrong_is_also_counted():
    """Regression: last question must be counted when wrong (not just ignored).

    This verifies that the bug fix correctly iterates through ALL answers,
    including the last one, even when it's incorrect.
    """
    questions = _questions(5)
    answers = [0, 0, 0, 0, 1]  # First 4 correct, last wrong

    score = compute_score(answers, questions)

    assert score == 4


def test_only_last_question_in_quiz():
    """Edge case: quiz with single question must work (no off-by-one possible).

    Verifies the scoring works at the minimal boundary.
    """
    questions = _questions(1)
    answers = [0]

    score = compute_score(answers, questions)

    assert score == 1


def test_two_question_quiz_both_correct():
    """Edge case: minimal multi-question quiz, boundary test for off-by-one.

    A 2-question quiz catches off-by-one errors easily (range(1) vs range(2)).
    """
    questions = _questions(2)
    answers = [0, 0]

    score = compute_score(answers, questions)

    assert score == 2


def test_two_question_quiz_only_last_correct():
    """Edge case: 2-question quiz where only the last is correct.

    Specifically targets the off-by-one bug: would score 0 with range(len-1).
    """
    questions = _questions(2)
    answers = [1, 0]  # First wrong, last correct

    score = compute_score(answers, questions)

    assert score == 1


# ============================================================================
# NORMAL/HAPPY PATH TESTS
# ============================================================================


def test_all_wrong_answers_score_zero():
    """Happy path: all-wrong submission should score zero."""
    questions = _questions(5)
    answers = [1, 1, 1, 1, 1]  # All wrong (correct answer is 0)

    score = compute_score(answers, questions)

    assert score == 0


def test_mixed_correct_and_wrong_answers():
    """Happy path: partial correct answers score correctly."""
    questions = _questions(5)
    answers = [0, 1, 0, 0, 1]  # 3 correct (indices 0, 2, 3), 2 wrong (indices 1, 4)

    score = compute_score(answers, questions)

    assert score == 3


def test_all_correct_answers_small_quiz():
    """Happy path: small all-correct quiz (boundary test)."""
    questions = _questions(3)
    answers = [0, 0, 0]

    score = compute_score(answers, questions)

    assert score == 3


def test_all_correct_answers_large_quiz():
    """Happy path: large all-correct quiz (stress test for loop boundary)."""
    total = 50
    questions = _questions(total)
    answers = [0] * total

    score = compute_score(answers, questions)

    assert score == total


# ============================================================================
# EDGE CASES FOR ROBUSTNESS
# ============================================================================


def test_score_with_varied_answer_indices():
    """Edge case: questions with varied answer_index values (not all 0)."""
    questions = [
        {"id": 0, "answer_index": 0},
        {"id": 1, "answer_index": 2},
        {"id": 2, "answer_index": 1},
    ]
    answers = [0, 2, 1]  # All correct

    score = compute_score(answers, questions)

    assert score == 3


def test_score_partial_with_varied_answer_indices():
    """Edge case: partial correct with varied answer indices."""
    questions = [
        {"id": 0, "answer_index": 0},
        {"id": 1, "answer_index": 2},
        {"id": 2, "answer_index": 1},
    ]
    answers = [0, 1, 1]  # First correct, second wrong (expected 2), third correct

    score = compute_score(answers, questions)

    assert score == 2


# ============================================================================
# REGRESSION TESTS FOR BUG #2: Leaderboard sorted ascending (not descending)
# ============================================================================


def test_leaderboard_multiple_entries_sorted_descending():
    """Regression: multiple entries must sort descending (highest score first).

    Before fix: sorted(entries, key=...) without reverse=True → ascending order.
    After fix: sorted(entries, key=..., reverse=True) → descending order.
    """
    entries = [
        {"name": "Alice", "score": 5},
        {"name": "Bob", "score": 10},
        {"name": "Charlie", "score": 3},
        {"name": "Diana", "score": 7},
    ]

    result = sorted_leaderboard(entries)

    scores = [e["score"] for e in result]
    assert scores == [10, 7, 5, 3]


def test_leaderboard_reversed_input_order():
    """Regression: even if input is reverse-sorted ascending, output must be descending."""
    entries = [
        {"name": "First", "score": 1},
        {"name": "Second", "score": 2},
        {"name": "Third", "score": 3},
    ]

    result = sorted_leaderboard(entries)

    names = [e["name"] for e in result]
    assert names == ["Third", "Second", "First"]


def test_leaderboard_already_sorted_descending():
    """Regression: entries already in descending order must remain descending."""
    entries = [
        {"name": "Top", "score": 100},
        {"name": "Middle", "score": 50},
        {"name": "Bottom", "score": 10},
    ]

    result = sorted_leaderboard(entries)

    assert result == entries


# ============================================================================
# NORMAL/HAPPY PATH TESTS FOR SORTED_LEADERBOARD
# ============================================================================


def test_leaderboard_single_entry():
    """Happy path: single entry should return that entry unchanged."""
    entries = [{"name": "Solo", "score": 42}]

    result = sorted_leaderboard(entries)

    assert result == entries


def test_leaderboard_two_entries_ascending_input():
    """Happy path: two entries in ascending input order should be swapped to descending."""
    entries = [{"name": "Low", "score": 3}, {"name": "High", "score": 8}]

    result = sorted_leaderboard(entries)

    assert [e["name"] for e in result] == ["High", "Low"]
    assert [e["score"] for e in result] == [8, 3]


def test_leaderboard_many_entries_mixed_order():
    """Happy path: many entries in random order should sort descending by score."""
    entries = [
        {"name": "E", "score": 5},
        {"name": "A", "score": 10},
        {"name": "D", "score": 7},
        {"name": "B", "score": 20},
        {"name": "C", "score": 3},
    ]

    result = sorted_leaderboard(entries)

    scores = [e["score"] for e in result]
    assert scores == [20, 10, 7, 5, 3]


# ============================================================================
# EDGE CASES FOR SORTED_LEADERBOARD ROBUSTNESS
# ============================================================================


def test_leaderboard_empty_list():
    """Edge case: empty entry list should return empty list."""
    entries = []

    result = sorted_leaderboard(entries)

    assert result == []


def test_leaderboard_all_entries_same_score():
    """Edge case: all entries with identical scores.

    Python's sort is stable, so entries with equal keys should maintain
    their relative order from the input.
    """
    entries = [
        {"name": "First", "score": 5},
        {"name": "Second", "score": 5},
        {"name": "Third", "score": 5},
    ]

    result = sorted_leaderboard(entries)

    # All scores should remain 5, order preserved (stable sort)
    assert len(result) == 3
    assert all(e["score"] == 5 for e in result)
    assert [e["name"] for e in result] == ["First", "Second", "Third"]


def test_leaderboard_entries_with_same_name_different_scores():
    """Edge case: multiple entries with the same name but different scores.

    This can happen if the same player submits multiple quiz runs.
    They should sort by score descending, regardless of name.
    """
    entries = [
        {"name": "Alice", "score": 5},
        {"name": "Alice", "score": 15},
        {"name": "Alice", "score": 10},
    ]

    result = sorted_leaderboard(entries)

    scores = [e["score"] for e in result]
    assert scores == [15, 10, 5]


def test_leaderboard_zero_and_high_scores():
    """Edge case: mix of zero scores and high scores."""
    entries = [
        {"name": "Zeros", "score": 0},
        {"name": "HighScore", "score": 100},
        {"name": "Mid", "score": 50},
        {"name": "AlsoZero", "score": 0},
    ]

    result = sorted_leaderboard(entries)

    scores = [e["score"] for e in result]
    assert scores == [100, 50, 0, 0]


def test_leaderboard_preserves_entry_structure():
    """Edge case: sorting must preserve all fields in each entry.

    Ensures that additional entry fields (beyond 'name' and 'score') are
    not lost during sorting.
    """
    entries = [
        {"name": "Alice", "score": 8, "timestamp": "2026-01-01"},
        {"name": "Bob", "score": 12, "timestamp": "2026-01-02"},
    ]

    result = sorted_leaderboard(entries)

    assert len(result) == 2
    assert result[0]["name"] == "Bob"
    assert result[0]["score"] == 12
    assert result[0]["timestamp"] == "2026-01-02"
    assert result[1]["name"] == "Alice"
    assert result[1]["score"] == 8
    assert result[1]["timestamp"] == "2026-01-01"
