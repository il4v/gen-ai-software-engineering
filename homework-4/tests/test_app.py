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
