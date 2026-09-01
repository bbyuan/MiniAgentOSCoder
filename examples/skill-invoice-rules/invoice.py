from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP


@dataclass(frozen=True)
class LineItem:
    sku: str
    unit_cents: int
    quantity: int
    digital: bool = False


def calculate_subtotal_cents(items: list[LineItem]) -> int:
    return sum(item.unit_cents * item.quantity for item in items)


def calculate_discount_cents(subtotal_cents: int, discount_percent: Decimal) -> int:
    discount = Decimal(subtotal_cents) * (discount_percent / Decimal("100"))
    return int(discount.to_integral_value(rounding=ROUND_HALF_UP))


def tax_rate_for(region: str, *, digital: bool = False) -> Decimal:
    if digital:
        return Decimal("0")
    rates = {
        "CA": Decimal("0.07"),
        "NY": Decimal("0.08875"),
        "OR": Decimal("0.00"),
    }
    return rates.get(region.upper(), Decimal("0.00"))


def calculate_tax_cents(taxable_cents: int, region: str, *, digital: bool = False) -> int:
    tax = Decimal(taxable_cents) * tax_rate_for(region, digital=digital)
    return int(tax.to_integral_value(rounding=ROUND_HALF_UP))


def build_invoice(items: list[LineItem], region: str, discount_percent: Decimal = Decimal("0")) -> dict[str, int]:
    subtotal = calculate_subtotal_cents(items)
    discount = calculate_discount_cents(subtotal, discount_percent)
    taxable = subtotal - discount
    digital_only = all(item.digital for item in items)
    tax = calculate_tax_cents(taxable, region, digital=digital_only)
    return {
        "subtotal_cents": subtotal,
        "discount_cents": discount,
        "tax_cents": tax,
        "total_cents": taxable + tax,
    }
