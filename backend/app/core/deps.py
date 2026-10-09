"""Зависимости FastAPI: аутентификация (JWT из httpOnly cookie), CSRF, мультиарендная изоляция."""
from __future__ import annotations

import uuid as _uuid
from dataclasses import dataclass, field
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import CSRF_COOKIE, CSRF_HEADER, check_csrf, decode_token
from app.db.session import get_db
from app.models.family import Family, SuperAdmin, User

DbDep = Annotated[AsyncSession, Depends(get_db)]

SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}


@dataclass
class CurrentUser:
    """Аутентифицированный пользователь семьи (+ контекст demo/impersonate)."""

    user: User
    family: Family
    is_demo: bool = False
    impersonator_id: int | None = None
    claims: dict[str, Any] = field(default_factory=dict)

    @property
    def family_id(self) -> _uuid.UUID:
        return self.family.id

    @property
    def is_owner(self) -> bool:
        from app.models.enums import UserRole

        return self.user.role == UserRole.OWNER


async def get_current_user(request: Request, db: DbDep) -> CurrentUser:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Не авторизован")
    payload = decode_token(token, expected_kind="access")
    if not payload or payload.get("is_superadmin"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Недействительный токен")

    user = await db.get(User, _uuid.UUID(payload["sub"]))
    if user is None or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пользователь не найден или заблокирован")
    family = await db.get(Family, user.family_id)
    if family is None or family.deleted_at is not None:
        # Самоизлечение демо-сессии (ТЗ 5.2): cookie гостя sandbox-семьи может
        # пережить удаление песочницы планировщиком (TTL 24ч) — frontend при
        # этом зацикливался на «Пользователь не найден». Возвращаем 401 с
        # явной причиной, чтобы клиент корректно перенаправил на /login,
        # где кнопка «Войти в демо» создаст новую песочницу.
        if bool(payload.get("is_demo")):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Демо-сессия истекла — войдите в демо заново",
                headers={"X-Demo-Expired": "1"},
            )
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Семья удалена")
    if family.is_blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Семья заблокирована администратором")

    return CurrentUser(
        user=user,
        family=family,
        is_demo=bool(payload.get("is_demo")),
        impersonator_id=payload.get("impersonator_id"),
        claims=payload,
    )


async def get_current_superadmin(request: Request, db: DbDep) -> SuperAdmin:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Не авторизован")
    payload = decode_token(token, expected_kind="superadmin_access")
    if not payload or not payload.get("is_superadmin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Требуются права супер-админа")
    sa = await db.get(SuperAdmin, int(payload["sub"]))
    if sa is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Супер-админ не найден")
    return sa


async def require_owner(current: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
    if not current.is_owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Только для владельца семьи")
    return current


async def csrf_guard(request: Request) -> None:
    """CSRF double-submit для всех mutation-запросов под сессией.

    Эндпоинты логина/регистрации помечаются в маршруте `request.state.csrf_exempt = True`
    (сессии ещё нет — атака CSRF на них бессмысленна, rate limit защищает от брутфорса).
    """
    if request.method in SAFE_METHODS:
        return
    if getattr(request.state, "csrf_exempt", False):
        return
    if not check_csrf(request.cookies.get(CSRF_COOKIE), request.headers.get(CSRF_HEADER)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Ошибка CSRF-проверки")


def family_scope(stmt, model, current: CurrentUser):
    """Мультиарендность: базовая изоляция ВСЕХ запросов по family_id (ТЗ 10)."""
    return stmt.where(model.family_id == current.family_id)


def parse_uuid(value: str, name: str = "id") -> _uuid.UUID:
    try:
        return _uuid.UUID(value)
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Некорректный {name}") from None


async def get_sandbox_cleanup_stmt():
    """Для scheduler'а: sandbox-семьи с истёкшим TTL."""
    from datetime import datetime, timezone

    return select(Family).where(
        Family.is_sandbox.is_(True),
        Family.expires_at.is_not(None),
        Family.expires_at < datetime.now(timezone.utc),
    )
