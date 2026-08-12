"""Configurable rule engine for fraud-detection scoring — data-driven, not hardcoded.

No I/O beyond loading its own YAML file, same discipline as pipeline/models.py. Serves
specification-challenge.md MLO-C1.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

from pipeline.models import to_decimal


@dataclass(frozen=True)
class Rule:
    name: str
    field: str
    operator: str
    value: Any
    score: int


@dataclass(frozen=True)
class RuleSet:
    flag_threshold: int
    rules: tuple[Rule, ...]


def load_rules(path: Path) -> RuleSet:
    with open(path) as f:
        data = yaml.safe_load(f)
    rules = tuple(
        Rule(name=r["name"], field=r["field"], operator=r["operator"], value=r["value"], score=r["score"])
        for r in data["rules"]
    )
    return RuleSet(flag_threshold=data["flag_threshold"], rules=rules)


def _parse_hour(timestamp: str) -> int | None:
    if not timestamp:
        return None
    try:
        return datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%SZ").hour
    except ValueError:
        return None


def _get_field(record: dict, field: str) -> Any:
    if field == "timestamp_hour":
        return _parse_hour(record.get("timestamp", ""))
    value: Any = record
    for part in field.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def _apply_operator(operator: str, actual: Any, expected: Any) -> bool:
    if actual is None:
        return False
    if operator == "gt":
        return to_decimal(str(actual)) > to_decimal(str(expected))
    if operator == "lt":
        return to_decimal(str(actual)) < to_decimal(str(expected))
    if operator == "eq":
        return str(actual) == str(expected)
    if operator == "ne":
        return str(actual) != str(expected)
    if operator == "outside_hours":
        start, end = expected
        return not (start <= actual < end)
    raise ValueError(f"unknown rule operator: {operator}")


def evaluate(record: dict, ruleset: RuleSet) -> tuple[int, list[str]]:
    """Returns (risk_score, flags) — never raises on a well-formed record."""
    score = 0
    flags: list[str] = []
    for rule in ruleset.rules:
        actual = _get_field(record, rule.field)
        if _apply_operator(rule.operator, actual, rule.value):
            score += rule.score
            flags.append(rule.name)
    return score, flags
