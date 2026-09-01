from __future__ import annotations

from dataclasses import dataclass, field
from io import StringIO
import csv


@dataclass
class Contact:
    email: str
    name: str = ""
    tags: list[str] = field(default_factory=list)


def normalize_email(value: str) -> str:
    return value.strip()


def merge_contacts(rows: list[Contact]) -> list[Contact]:
    merged: dict[str, Contact] = {}
    for row in rows:
        email = normalize_email(row.email)
        if email not in merged:
            merged[email] = Contact(email=email, name=row.name.strip(), tags=list(row.tags))
            continue
        existing = merged[email]
        if not existing.name:
            existing.name = row.name.strip()
        existing.tags = list(row.tags)
    return list(merged.values())


def export_contacts_csv(rows: list[Contact]) -> str:
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["email", "name"])
    for row in rows:
        writer.writerow([row.email, row.name])
    return output.getvalue()
