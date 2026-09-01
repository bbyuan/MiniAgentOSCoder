# Bugfix Task

Fix invoice tax behavior in `invoice.py`.

Use the project Skill and `docs/tax_rules.md` as the source of truth. The correct behavior is:

- CA uses 7.5 percent tax.
- NY uses 8.875 percent tax.
- OR has no tax.
- Digital goods are tax-exempt in OR only.
- Tax is calculated after discounts and rounded half-up to cents.

Make `python3 -m unittest discover -v` pass.
