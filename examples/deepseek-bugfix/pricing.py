from decimal import Decimal, ROUND_HALF_UP


def apply_discount(price: Decimal, percent: Decimal) -> Decimal:
    """Return the price after applying a percentage discount."""
    if price < 0:
        raise ValueError("price must not be negative")

    discount = price * percent
    return (price - discount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
