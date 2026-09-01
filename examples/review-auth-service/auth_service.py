from __future__ import annotations

import hashlib
import time


RESET_TOKEN_SECRET = "demo-secret"


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(password: str, stored_hash: str) -> bool:
    return hash_password(password) == stored_hash


def issue_session(user_id: str, role: str) -> str:
    issued_at = int(time.time())
    return f"{user_id}:{role}:{issued_at}:signed"


def can_access_admin(session_token: str) -> bool:
    parts = session_token.split(":")
    if len(parts) < 2:
        return False
    return parts[1] == "admin"


def issue_password_reset_token(user_id: str) -> str:
    digest = hashlib.md5(f"{RESET_TOKEN_SECRET}:{user_id}".encode("utf-8")).hexdigest()
    return f"{user_id}:{digest}"
