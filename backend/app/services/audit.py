"""Audit log (ТЗ 10): логин, impersonate, удаление семьи, сброс пароля."""
from __future__ import annotations

import uuid as _uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import AuditAction
from app.models.receipt import AuditLog


def _as_uuid(value: Any) -> _uuid.UUID | None:
    if value is None or isinstance(value, _uuid.UUID):
        return value  # type: ignore[return-value]
    try:
        return _uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


async def write_audit(
    session: AsyncSession,
    *,
    action: AuditAction | str,
    actor_id: str,
    actor_type: str = "user",           # user | superadmin | system
    actor_label: str | None = None,
    target_family_id: Any = None,
    target_user_id: Any = None,
    ip: str | None = None,
    user_agent: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    entry = AuditLog(
        action=str(action),
        actor_type=actor_type,
        actor_id=str(actor_id),
        actor_label=actor_label,
        target_family_id=_as_uuid(target_family_id),
        target_user_id=_as_uuid(target_user_id),
        ip=ip,
        user_agent=(user_agent or "")[:512] or None,
        details=details,
    )
    session.add(entry)
