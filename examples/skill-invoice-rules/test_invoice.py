from decimal import Decimal
import unittest

from invoice import LineItem, build_invoice, calculate_tax_cents


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


if __name__ == "__main__":
    unittest.main()
