# Python Bugfix Fixture

- Keep all monetary calculations in integer cents.
- Avoid float arithmetic in invoice, tax, discount, or payment splitting logic.
- Run `python -m unittest discover -v` before claiming the task is complete.
- Prefer small, targeted fixes that preserve the existing public function names.
