# Discount Bugfix Task

Fix `pricing.apply_discount` so that it treats `percent` as a percentage, rounds the result to two decimal places with `ROUND_HALF_UP`, and rejects percentage values outside the inclusive range from 0 to 100.

Preserve the existing negative-price validation and make all tests pass. Keep the change focused on `pricing.py`.
