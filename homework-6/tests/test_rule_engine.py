from __future__ import annotations

from pathlib import Path

from pipeline.fraud_detector import DEFAULT_RULES_PATH
from pipeline.rule_engine import Rule, RuleSet, evaluate, load_rules

DEFAULT_TRANSACTIONS = [
    # (record fragment relevant to scoring, expected_score, expected_flags)
    ({"amount": "1500.00", "timestamp": "2026-03-16T09:00:00Z", "metadata": {"country": "US"}}, 0, []),
    ({"amount": "25000.00", "timestamp": "2026-03-16T09:15:00Z", "metadata": {"country": "US"}}, 50, ["high_value"]),
    ({"amount": "9999.99", "timestamp": "2026-03-16T09:30:00Z", "metadata": {"country": "US"}}, 0, []),
    (
        {"amount": "500.00", "timestamp": "2026-03-16T02:47:00Z", "metadata": {"country": "DE"}},
        50,
        ["cross_border", "unusual_timing"],
    ),
]


def test_default_rules_reproduce_known_scores():
    """The refactored rule engine must score every sample-transaction case identically to the
    original hardcoded fraud_detector.py (specification-challenge.md MLO-C1)."""
    ruleset = load_rules(DEFAULT_RULES_PATH)
    for record, expected_score, expected_flags in DEFAULT_TRANSACTIONS:
        score, flags = evaluate(record, ruleset)
        assert score == expected_score
        assert flags == expected_flags


def test_default_flag_threshold_is_50():
    ruleset = load_rules(DEFAULT_RULES_PATH)
    assert ruleset.flag_threshold == 50


def test_missing_field_does_not_crash_and_does_not_fire():
    ruleset = RuleSet(
        flag_threshold=10,
        rules=(Rule(name="test", field="metadata.country", operator="ne", value="US", score=10),),
    )
    score, flags = evaluate({"amount": "1.00"}, ruleset)
    assert score == 0
    assert flags == []


def test_custom_rule_set_changes_scoring():
    """A different rule set (e.g. what rule-engine-agent would write) produces different flags —
    confirms the engine is genuinely data-driven, not secretly still hardcoded."""
    ruleset = RuleSet(
        flag_threshold=20,
        rules=(Rule(name="always_flag", field="amount", operator="gt", value="0", score=20),),
    )
    score, flags = evaluate({"amount": "1.00"}, ruleset)
    assert score == 20
    assert flags == ["always_flag"]


def test_load_rules_from_real_config_file(tmp_path: Path):
    custom = tmp_path / "custom_rules.yaml"
    custom.write_text(
        "flag_threshold: 5\n"
        "rules:\n"
        "  - name: any_amount\n"
        "    field: amount\n"
        "    operator: gt\n"
        "    value: \"0\"\n"
        "    score: 5\n"
    )
    ruleset = load_rules(custom)
    assert ruleset.flag_threshold == 5
    assert ruleset.rules[0].name == "any_amount"
