from decimal import Decimal

import pytest

from pricing import apply_discount


def test_applies_percentage_discount() -> None:
    assert apply_discount(Decimal("100.00"), Decimal("20")) == Decimal("80.00")


def test_rounds_money_to_two_decimal_places() -> None:
    assert apply_discount(Decimal("59.90"), Decimal("15")) == Decimal("50.92")


@pytest.mark.parametrize("percent", [Decimal("-1"), Decimal("101")])
def test_rejects_discount_outside_valid_range(percent: Decimal) -> None:
    with pytest.raises(ValueError, match="percent must be between 0 and 100"):
        apply_discount(Decimal("100.00"), percent)


def test_rejects_negative_price() -> None:
    with pytest.raises(ValueError, match="price must not be negative"):
        apply_discount(Decimal("-0.01"), Decimal("10"))
