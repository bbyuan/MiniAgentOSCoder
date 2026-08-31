import unittest

from calculator import (
    LineItem,
    add,
    build_invoice,
    calculate_discount_cents,
    calculate_subtotal_cents,
    calculate_tax_cents,
    cents_to_money,
    money_to_cents,
    normalize_coupon,
    split_evenly,
)


class CalculatorSmokeTest(unittest.TestCase):
    def test_adds_two_numbers(self) -> None:
        self.assertEqual(add(2, 3), 5)

    def test_money_rounds_half_up_to_cents(self) -> None:
        self.assertEqual(money_to_cents("19.995"), 2000)
        self.assertEqual(money_to_cents("0.004"), 0)

    def test_money_formatting_keeps_two_digits(self) -> None:
        self.assertEqual(cents_to_money(123456), "$1234.56")
        self.assertEqual(cents_to_money(5), "$0.05")


class InvoiceCalculationTest(unittest.TestCase):
    def test_line_items_validate_core_fields(self) -> None:
        with self.assertRaises(ValueError):
            LineItem("", "Notebook", 1299, 1)
        with self.assertRaises(ValueError):
            LineItem("sku-1", "Notebook", -1, 1)
        with self.assertRaises(ValueError):
            LineItem("sku-1", "Notebook", 1299, 0)

    def test_subtotal_handles_quantities(self) -> None:
        items = [
            LineItem("pen", "Gel pen", 250, 3),
            LineItem("book", "Notebook", 1299, 2),
        ]

        self.assertEqual(calculate_subtotal_cents(items), 3348)

    def test_coupon_codes_are_normalized_for_human_input(self) -> None:
        self.assertEqual(normalize_coupon(" save10 "), "SAVE10")
        self.assertEqual(calculate_discount_cents(10000, " save10 "), 1000)

    def test_tax_is_charged_after_discount(self) -> None:
        items = [LineItem("desk", "Desk lamp", 10000, 1)]

        self.assertEqual(calculate_tax_cents(items, "CA", discount_cents=1000), 743)

    def test_non_taxable_items_are_excluded_from_tax(self) -> None:
        items = [
            LineItem("book", "Reference book", 3000, 1, taxable=False),
            LineItem("lamp", "Desk lamp", 2000, 1, taxable=True),
        ]

        self.assertEqual(calculate_tax_cents(items, "OR"), 0)
        self.assertEqual(calculate_tax_cents(items, "CA"), 165)

    def test_invoice_total_combines_discount_and_tax(self) -> None:
        items = [
            LineItem("keyboard", "Keyboard", 8000, 1),
            LineItem("mouse", "Mouse", 2000, 1),
        ]

        invoice = build_invoice(items, region="CA", coupon_code="SAVE10")

        self.assertEqual(invoice["subtotal_cents"], 10000)
        self.assertEqual(invoice["discount_cents"], 1000)
        self.assertEqual(invoice["tax_cents"], 743)
        self.assertEqual(invoice["total_cents"], 9743)
        self.assertEqual(invoice["total"], "$97.43")


class PaymentSplitTest(unittest.TestCase):
    def test_split_evenly_preserves_every_cent(self) -> None:
        self.assertEqual(split_evenly(1000, 3), [334, 333, 333])
        self.assertEqual(sum(split_evenly(1000, 3)), 1000)

    def test_split_evenly_handles_exact_division(self) -> None:
        self.assertEqual(split_evenly(1200, 4), [300, 300, 300, 300])

    def test_split_evenly_rejects_invalid_inputs(self) -> None:
        with self.assertRaises(ValueError):
            split_evenly(1000, 0)
        with self.assertRaises(ValueError):
            split_evenly(-1, 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
