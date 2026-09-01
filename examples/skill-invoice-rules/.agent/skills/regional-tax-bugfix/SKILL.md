# Regional Tax Bugfix Skill

## When To Use

Use this skill for invoice, sales tax, discount, or money rounding bugs in this workspace.

## Process

1. Read `docs/tax_rules.md` before editing code.
2. Inspect `invoice.py` and the failing tests.
3. Keep money in integer cents or `Decimal`; never use binary float for final cents.
4. Change only the smallest necessary code path.
5. Run `python3 -m unittest discover -v` before finishing.

## Completion Criteria

- The patch follows the regional tax rules document.
- The changed file list and validation command are visible in the final report.
- Any remaining uncertainty is called out explicitly.
