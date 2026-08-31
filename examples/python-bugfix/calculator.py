from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP


CENT = Decimal("0.01")
COUPONS = {
    "SAVE10": Decimal("0.10"),
    "WELCOME5": Decimal("0.05"),
    "VIP20": Decimal("0.20"),
}
TAX_RATES = {
    "CA": Decimal("0.0825"),
    "NY": Decimal("0.08875"),
    "OR": Decimal("0.00"),
}


@dataclass(frozen=True)
class LineItem:
    sku: str
    name: str
    unit_price_cents: int
    quantity: int
    taxable: bool = True

    def __post_init__(self) -> None:
        if not self.sku.strip():
            raise ValueError("sku is required")
        if self.unit_price_cents < 0:
            raise ValueError("unit price cannot be negative")
        if self.quantity <= 0:
            raise ValueError("quantity must be positive")


def add(left: int, right: int) -> int:
    return left + right


def money_to_cents(value: str | int | float | Decimal) -> int:
    amount = Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)
    if amount < 0:
        raise ValueError("money cannot be negative")
    return int((amount * 100).to_integral_value(rounding=ROUND_HALF_UP))


def cents_to_money(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    absolute = abs(cents)
    return f"{sign}${absolute // 100}.{absolute % 100:02d}"


def normalize_coupon(code: str | None) -> str:
    if not code:
        return ""
    return code.upper()


def calculate_subtotal_cents(items: list[LineItem]) -> int:
    return sum(item.unit_price_cents * item.quantity for item in items)


def calculate_discount_cents(subtotal_cents: int, coupon_code: str | None) -> int:
    rate = COUPONS.get(normalize_coupon(coupon_code), Decimal("0"))
    return int((Decimal(subtotal_cents) * rate).to_integral_value(rounding=ROUND_HALF_UP))


def calculate_tax_cents(items: list[LineItem], region: str, discount_cents: int = 0) -> int:
    rate = TAX_RATES.get(region.upper(), Decimal("0"))
    taxable_subtotal = sum(
        item.unit_price_cents * item.quantity
        for item in items
        if item.taxable
    )
    return int((Decimal(taxable_subtotal) * rate).to_integral_value(rounding=ROUND_HALF_UP))


def split_evenly(total_cents: int, parts: int) -> list[int]:
    if parts <= 0:
        raise ValueError("parts must be positive")
    if total_cents < 0:
        raise ValueError("total cannot be negative")
    share = total_cents // parts
    return [share for _ in range(parts)]


def build_invoice(
    items: list[LineItem],
    *,
    region: str,
    coupon_code: str | None = None,
) -> dict[str, int | str]:
    subtotal = calculate_subtotal_cents(items)
    discount = calculate_discount_cents(subtotal, coupon_code)
    tax = calculate_tax_cents(items, region, discount_cents=discount)
    total = subtotal - discount + tax

    return {
        "subtotal_cents": subtotal,
        "discount_cents": discount,
        "tax_cents": tax,
        "total_cents": total,
        "total": cents_to_money(total),
    }
