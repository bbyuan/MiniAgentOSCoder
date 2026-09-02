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
    return value.strip().lower()


def merge_contacts(rows: list[Contact]) -> list[Contact]:
    merged: dict[str, Contact] = {}
    for row in rows:
        email = normalize_email(row.email)
        existing = merged.get(email)
        if existing is None:
            merged[email] = Contact(email=email, name=row.name.strip(), tags=list(row.tags))
            continue
        if not existing.name:
            existing.name = row.name.strip()
        for tag in row.tags:
            if tag not in existing.tags:
                existing.tags.append(tag)
    return list(merged.values())


def export_contacts_csv(rows: list[Contact]) -> str:
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["email", "name", "tags"])
    for row in rows:
        writer.writerow([row.email, row.name, "|".join(row.tags)])
    return output.getvalue()
