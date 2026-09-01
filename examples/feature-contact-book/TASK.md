# Feature Task

Add the missing contact import behavior in `contact_book.py`.

Requirements:

- Normalize email addresses by trimming whitespace and lowercasing them.
- Merge duplicate contacts by normalized email.
- Preserve the first non-empty name seen for a contact.
- Combine tags without duplicates while preserving first-seen tag order.
- Export contacts to CSV with columns `email,name,tags`; tags are joined with `|`.

Keep the implementation dependency-free and make `python3 -m unittest discover -v` pass.
