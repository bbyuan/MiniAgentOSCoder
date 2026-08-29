import unittest
from decimal import Decimal

from pricing import apply_discount


class PricingTest(unittest.TestCase):
    def test_applies_percentage_discount(self) -> None:
        self.assertEqual(apply_discount(Decimal("100.00"), Decimal("20")), Decimal("80.00"))

    def test_rounds_half_up(self) -> None:
        self.assertEqual(apply_discount(Decimal("59.90"), Decimal("15")), Decimal("50.92"))

    def test_rejects_invalid_percent(self) -> None:
        for percent in (Decimal("-1"), Decimal("101")):
            with self.subTest(percent=percent):
                with self.assertRaisesRegex(ValueError, "percent must be between 0 and 100"):
                    apply_discount(Decimal("100.00"), percent)

    def test_rejects_negative_price(self) -> None:
        with self.assertRaisesRegex(ValueError, "price must not be negative"):
            apply_discount(Decimal("-0.01"), Decimal("10"))


if __name__ == "__main__":
    unittest.main()
