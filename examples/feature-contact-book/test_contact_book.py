import csv
from io import StringIO
import unittest

from contact_book import Contact, export_contacts_csv, merge_contacts, normalize_email


class ContactBookTests(unittest.TestCase):
    def test_normalizes_email_for_identity(self) -> None:
        self.assertEqual(normalize_email("  ALICE@Example.COM "), "alice@example.com")

    def test_merges_duplicates_and_combines_tags_in_order(self) -> None:
        contacts = merge_contacts([
            Contact("ALICE@example.com", "Alice", ["customer", "vip"]),
            Contact(" alice@example.com ", "", ["vip", "newsletter"]),
            Contact("bob@example.com", "Bob", ["trial"]),
        ])

        self.assertEqual([contact.email for contact in contacts], ["alice@example.com", "bob@example.com"])
        self.assertEqual(contacts[0].name, "Alice")
        self.assertEqual(contacts[0].tags, ["customer", "vip", "newsletter"])

    def test_preserves_first_non_empty_name(self) -> None:
        contacts = merge_contacts([
            Contact("sam@example.com", "", ["lead"]),
            Contact("SAM@example.com", "Sam Rivera", ["sales"]),
        ])

        self.assertEqual(contacts[0].name, "Sam Rivera")
        self.assertEqual(contacts[0].tags, ["lead", "sales"])

    def test_exports_csv_with_tags_column(self) -> None:
        csv_text = export_contacts_csv([
            Contact("alice@example.com", "Alice", ["customer", "vip"]),
            Contact("bob@example.com", "Bob", []),
        ])
        rows = list(csv.DictReader(StringIO(csv_text)))

        self.assertEqual(rows[0], {"email": "alice@example.com", "name": "Alice", "tags": "customer|vip"})
        self.assertEqual(rows[1], {"email": "bob@example.com", "name": "Bob", "tags": ""})


if __name__ == "__main__":
    unittest.main()
