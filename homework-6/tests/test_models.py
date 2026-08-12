from __future__ import annotations

from decimal import Decimal

import pytest

from pipeline.models import mask_account, to_decimal


def test_to_decimal_parses_string_amount():
    assert to_decimal("1500.00") == Decimal("1500.00")


def test_to_decimal_rejects_non_string():
    with pytest.raises(ValueError):
        to_decimal(1500.0)  # type: ignore[arg-type]


def test_to_decimal_rejects_garbage_string():
    with pytest.raises(ValueError):
        to_decimal("not-a-number")


def test_mask_account_keeps_last_four_chars():
    assert mask_account("ACC-1001") == "***1001"


def test_mask_account_handles_empty():
    assert mask_account("") == "***"
