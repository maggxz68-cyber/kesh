"""Безопасность: хэширование паролей (argon2), JWT (access/refresh), CSRF double-submit."""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from jose import JWTError, jwt

from app.core.config import settings

ph = PasswordHasher(time_cost=3, memory_cost=64_000, parallelism=1)

TokenType = Literal["access", "refresh", "superadmin_access", "superadmin_refresh"]


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return ph.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return ph.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def _ttl(kind: TokenType) -> timedelta:
    if kind in ("access", "superadmin_access"):
        return timedelta(minutes=settings.jwt_access_token_expire_minutes)
    return timedelta(days=settings.jwt_refresh_token_expire_days)


def create_token(
    *,
    sub: str,
    kind: TokenType,
    family_id: str | None = None,
    is_superadmin: bool = False,
    is_demo: bool = False,
    impersonator_id: str | None = None,
) -> tuple[str, datetime]:
    """Выдаёт JWT и абсолютный срок жизни. Refresh-токены имеют уникальный jti (ротация)."""
    now = datetime.now(timezone.utc)
    exp = now + _ttl(kind)
    payload: dict[str, Any] = {
        "sub": sub,
        "typ": kind,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "jti": str(uuid.uuid4()) if kind.startswith("refresh") else None,
        "family_id": family_id,
        "is_superadmin": is_superadmin or None,
        "is_demo": is_demo or None,
        "impersonator_id": impersonator_id,
    }
    payload = {k: v for k, v in payload.items() if v is not None}
    token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    return token, exp


def decode_token(token: str, expected_kind: TokenType | None = None) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except JWTError:
        return None
    if expected_kind and payload.get("typ") != expected_kind:
        return None
    return payload


# --- CSRF double-submit -------------------------------------------------------
CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def check_csrf(cookie_value: str | None, header_value: str | None) -> bool:
    """Для mutation-запросов: заголовок должен совпадать с cookie (браузер не может
    подставить чужое значение заголовка в cross-site запросе)."""
    if not cookie_value or not header_value:
        return False
    return secrets.compare_digest(cookie_value, header_value)


# --- Rate limiting (slowapi) ---------------------------------------------------
from slowapi import Limiter  # noqa: E402
from slowapi.util import get_remote_address  # noqa: E402

limiter = Limiter(key_func=get_remote_address, default_limits=["200/hour"])
