"""Shared data types and pure helpers used across every pipeline stage.

Per specification.md's Shared models and results reader task: no I/O lives here, only data
types and validators every stage needs identically (never re-implemented per stage).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

SUPPORTED_CURRENCIES = {"USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "INR", "SGD"}


def utc_now_iso() -> str:
    """Current time as an ISO 8601 UTC timestamp, e.g. '2026-03-16T09:00:00Z'."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_decimal(amount_str: str) -> Decimal:
    """Parse a monetary amount from its original string form. Never accepts a float."""
    if not isinstance(amount_str, str):
        raise ValueError(f"amount must be a string, got {type(amount_str).__name__}")
    try:
        return Decimal(amount_str)
    except InvalidOperation as exc:
        raise ValueError(f"amount '{amount_str}' is not a valid decimal number") from exc


def mask_account(account_id: str) -> str:
    """Mask an account identifier to its last 4 characters, e.g. 'ACC-1001' -> '***1001'."""
    if not account_id:
        return "***"
    return f"***{account_id[-4:]}"


@dataclass(frozen=True)
class Envelope:
    message_id: str
    timestamp: str
    source_stage: str
    target_stage: str
    message_type: str
    data: dict

    def to_dict(self) -> dict:
        return {
            "message_id": self.message_id,
            "timestamp": self.timestamp,
            "source_stage": self.source_stage,
            "target_stage": self.target_stage,
            "message_type": self.message_type,
            "data": self.data,
        }


def make_envelope(source_stage: str, target_stage: str, data: dict) -> Envelope:
    return Envelope(
        message_id=str(uuid.uuid4()),
        timestamp=utc_now_iso(),
        source_stage=source_stage,
        target_stage=target_stage,
        message_type="transaction",
        data=data,
    )
