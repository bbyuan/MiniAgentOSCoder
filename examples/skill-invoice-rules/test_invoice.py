from decimal import Decimal
import unittest

from invoice import LineItem, build_invoice, calculate_discount_cents, calculate_subtotal_cents, calculate_tax_cents


class InvoiceRuleTests(unittest.TestCase):
    def test_ca_uses_seven_point_five_percent_tax(self) -> None:
        self.assertEqual(calculate_tax_cents(10000, "CA"), 750)

    def test_ny_tax_is_calculated_after_discount(self) -> None:
        invoice = build_invoice(
            [LineItem("desk", unit_cents=10000, quantity=1)],
            "NY",
            discount_percent=Decimal("10"),
        )

        self.assertEqual(invoice["tax_cents"], 799)
        self.assertEqual(invoice["total_cents"], 9799)

    def test_or_digital_goods_are_tax_exempt(self) -> None:
        invoice = build_invoice(
            [LineItem("ebook", unit_cents=1299, quantity=2, digital=True)],
            "OR",
        )

        self.assertEqual(invoice["tax_cents"], 0)
        self.assertEqual(invoice["total_cents"], 2598)

    def test_ca_digital_goods_are_not_exempt(self) -> None:
        invoice = build_invoice(
            [LineItem("template", unit_cents=1999, quantity=1, digital=True)],
            "CA",
        )

        self.assertEqual(invoice["tax_cents"], 150)
        self.assertEqual(invoice["total_cents"], 2149)

    def test_subtotal_sums_quantity_and_unit_price(self) -> None:
        items = [
            LineItem("pen", unit_cents=250, quantity=3),
            LineItem("pad", unit_cents=999, quantity=1),
        ]
        self.assertEqual(calculate_subtotal_cents(items), 1749)

    def test_discount_rounds_half_up(self) -> None:
        self.assertEqual(calculate_discount_cents(101, Decimal("50")), 51)

    def test_tax_rounds_half_up(self) -> None:
        self.assertEqual(calculate_tax_cents(100, "CA"), 8)

    def test_unknown_region_has_no_tax(self) -> None:
        self.assertEqual(calculate_tax_cents(10000, "ZZ"), 0)

    def test_mixed_digital_and_physical_items_are_taxed_in_ca(self) -> None:
        invoice = build_invoice(
            [
                LineItem("ebook", unit_cents=1000, quantity=1, digital=True),
                LineItem("book", unit_cents=2000, quantity=1),
            ],
            "CA",
        )
        self.assertEqual(invoice["tax_cents"], 225)
        self.assertEqual(invoice["total_cents"], 3225)

    def test_full_invoice_flow_with_ca_discount(self) -> None:
        invoice = build_invoice(
            [LineItem("desk", unit_cents=10000, quantity=1)],
            "CA",
            discount_percent=Decimal("10"),
        )
        self.assertEqual(invoice["subtotal_cents"], 10000)
        self.assertEqual(invoice["discount_cents"], 1000)
        self.assertEqual(invoice["tax_cents"], 675)
        self.assertEqual(invoice["total_cents"], 9675)


if __name__ == "__main__":
    unittest.main()
