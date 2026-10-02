"""Сервис панели супер-админа (ТЗ 4.1): список/детали семей, блокировка,
удаление (soft/hard), impersonate, сброс паролей, метрики, логи."""
from __future__ import annotations

import shutil
import uuid as _uuid
from datetime import timezone as dt_timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_token, hash_password
from app.models.enums import AuditAction, CategoryKind, UserRole
from app.models.family import Family, SuperAdmin, User
from app.models.receipt import AuditLog, Receipt
from app.models.reference import Account, Category
from app.models.transaction import Transaction
from app.services.audit import write_audit


def _utcnow() -> Any:
    from datetime import datetime

    return datetime.now(dt_timezone.utc)


# ---------------------------------------------------------------- семьи
async def list_families(
    db: AsyncSession, *, search: str | None, page: int, page_size: int, include_deleted: bool = False,
) -> tuple[list[dict[str, Any]], int]:
    cond = [] if include_deleted else [Family.deleted_at.is_(None)]
    if search:
        cond.append(Family.name.ilike(f"%{search}%"))

    total = await db.scalar(select(func.count()).select_from(Family).where(*cond)) or 0

    users_cnt = (
        select(User.family_id, func.count().label("c"))
        .where(User.deleted_at.is_(None))
        .group_by(User.family_id)
        .subquery()
    )
    tx_cnt = (
        select(Transaction.family_id, func.count().label("c"))
        .where(Transaction.deleted_at.is_(None))
        .group_by(Transaction.family_id)
        .subquery()
    )
    q = (
        select(
            Family,
            func.coalesce(users_cnt.c.c, 0).label("users_count"),
            func.coalesce(tx_cnt.c.c, 0).label("transactions_count"),
        )
        .outerjoin(users_cnt, users_cnt.c.family_id == Family.id)
        .outerjoin(tx_cnt, tx_cnt.c.family_id == Family.id)
        .where(*cond)
        .order_by(Family.registered_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(q)).all()
    items = []
    for fam, ucnt, tcnt in rows:
        d = {
            "id": fam.id, "name": fam.name, "registered_at": fam.registered_at,
            "timezone": fam.timezone, "currency": fam.currency,
            "is_blocked": fam.is_blocked, "blocked_reason": fam.blocked_reason,
            "deleted_at": fam.deleted_at, "is_demo": fam.is_demo,
            "is_sandbox": fam.is_sandbox, "expires_at": fam.expires_at,
            "users_count": int(ucnt), "transactions_count": int(tcnt),
        }
        items.append(d)
    return items, int(total)


async def get_family_detail(db: AsyncSession, family_id: _uuid.UUID) -> dict[str, Any]:
    fam = await db.get(Family, family_id)
    if fam is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Семья не найдена")
    users = (
        await db.execute(
            select(User).where(User.family_id == family_id, User.deleted_at.is_(None)).order_by(User.created_at)
        )
    ).scalars().all()
    accounts = (
        await db.execute(select(Account).where(Account.family_id == family_id).order_by(Account.name))
    ).scalars().all()
    txs = (
        await db.execute(
            select(Transaction)
            .where(Transaction.family_id == family_id, Transaction.deleted_at.is_(None))
            .order_by(Transaction.occurred_at.desc())
            .limit(200)
        )
    ).scalars().all()
    receipts = (
        await db.execute(select(Receipt).where(Receipt.family_id == family_id).order_by(Receipt.created_at.desc()))
    ).scalars().all()

    users_cnt = len(users)
    tx_total = await db.scalar(
        select(func.count()).select_from(Transaction).where(
            Transaction.family_id == family_id, Transaction.deleted_at.is_(None)
        )
    )
    return {
        "family": {
            "id": fam.id, "name": fam.name, "registered_at": fam.registered_at,
            "timezone": fam.timezone, "currency": fam.currency,
            "is_blocked": fam.is_blocked, "blocked_reason": fam.blocked_reason,
            "deleted_at": fam.deleted_at, "is_demo": fam.is_demo,
            "is_sandbox": fam.is_sandbox, "expires_at": fam.expires_at,
            "users_count": users_cnt, "transactions_count": int(tx_total or 0),
        },
        "users": users,
        "accounts": accounts,
        "recent_transactions": txs,
        "receipts": receipts,
    }


async def set_block(
    db: AsyncSession, admin: SuperAdmin, family_id: _uuid.UUID, *, is_blocked: bool,
    reason: str | None, ip: str | None, ua: str | None,
) -> None:
    fam = await db.get(Family, family_id)
    if fam is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Семья не найдена")
    fam.is_blocked = is_blocked
    fam.blocked_reason = reason if is_blocked else None
    await write_audit(
        db, action=AuditAction.FAMILY_BLOCK if is_blocked else AuditAction.FAMILY_UNBLOCK,
        actor_type="superadmin", actor_id=str(admin.id), actor_label=admin.login,
        target_family_id=fam.id, ip=ip, user_agent=ua, details={"reason": reason},
    )


async def delete_family(
    db: AsyncSession, admin: SuperAdmin, family_id: _uuid.UUID, *, hard: bool,
    ip: str | None, ua: str | None,
) -> str:
    fam = await db.get(Family, family_id)
    if fam is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Семья не найдена")
    if fam.is_demo:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Демо-семью нельзя удалить")
    if hard:
        # Удаляем файлы чеков этой семьи из volume
        files = (
            await db.execute(select(Receipt.file_path).where(Receipt.family_id == family_id))
        ).scalars().all()
        base = Path(settings.receipts_dir)
        for rel in files:
            try:
                p = (base / rel).resolve()
                if p.is_file() and str(p).startswith(str(base.resolve())):
                    p.unlink(missing_ok=True)
            except OSError:
                pass
        await db.delete(fam)  # каскад по FK (ON DELETE CASCADE)
        message = "Семья удалена безвозвратно (hard delete)"
    else:
        now = _utcnow()
        await db.update(
            update(Family).where(Family.id == family_id).values(deleted_at=now, is_blocked=True)
        )
        await db.execute(update(User).where(User.family_id == family_id).values(deleted_at=now, is_active=False))
        message = "Семья удалена (soft delete, восстановима)"
    await write_audit(
        db, action=AuditAction.FAMILY_DELETE_HARD if hard else AuditAction.FAMILY_DELETE_SOFT,
        actor_type="superadmin", actor_id=str(admin.id), actor_label=admin.login,
        target_family_id=family_id, ip=ip, user_agent=ua,
    )
    return message


# ---------------------------------------------------------------- пользователи
async def list_users(db: AsyncSession, *, search: str | None, page: int, page_size: int):
    cond = [User.deleted_at.is_(None)]
    if search:
        cond.append(User.email.ilike(f"%{search}%") | User.name.ilike(f"%{search}%"))
    total = await db.scalar(select(func.count()).select_from(User).where(*cond)) or 0
    rows = (
        await db.execute(
            select(User, Family.name.label("family_name"))
            .join(Family, Family.id == User.family_id)
            .where(*cond)
            .order_by(User.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return rows, int(total)


async def reset_user_password(
    db: AsyncSession, admin: SuperAdmin, user_id: _uuid.UUID, new_password: str, *,
    force_change: bool, ip: str | None, ua: str | None,
) -> None:
    user = await db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь не найден")
    user.password_hash = hash_password(new_password)
    user.must_change_password = force_change
    await write_audit(
        db, action=AuditAction.PASSWORD_RESET,
        actor_type="superadmin", actor_id=str(admin.id), actor_label=admin.login,
        target_family_id=user.family_id, target_user_id=user.id, ip=ip, user_agent=ua,
    )


# ---------------------------------------------------------------- impersonate
async def impersonate_user(
    db: AsyncSession, admin: SuperAdmin, family_id: _uuid.UUID, user_id: _uuid.UUID,
    *, ip: str | None, ua: str | None,
) -> dict[str, Any]:
    user = await db.get(User, user_id)
    if user is None or user.family_id != family_id or user.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь не найден в этой семье")
    token, _exp = create_token(
        sub=str(user.id),
        kind="access",
        family_id=str(user.family_id),
        is_superadmin=False,
        is_demo=False,
        impersonator_id=str(admin.id),
    )
    await write_audit(
        db, action=AuditAction.IMPERSONATE,
        actor_type="superadmin", actor_id=str(admin.id), actor_label=admin.login,
        target_family_id=user.family_id, target_user_id=user.id, ip=ip, user_agent=ua,
        details={"email": user.email},
    )
    return {"access_token": token, "user_id": user.id, "family_id": user.family_id, "impersonator_id": admin.id}


# ---------------------------------------------------------------- метрики
async def platform_metrics(db: AsyncSession) -> dict[str, Any]:
    families_total = await db.scalar(select(func.count()).select_from(Family)) or 0
    families_active = await db.scalar(
        select(func.count()).select_from(Family).where(
            Family.deleted_at.is_(None), Family.is_blocked.is_(False)
        )
    ) or 0
    families_blocked = await db.scalar(
        select(func.count()).select_from(Family).where(Family.is_blocked.is_(True), Family.deleted_at.is_(None))
    ) or 0
    families_sandbox = await db.scalar(
        select(func.count()).select_from(Family).where(Family.is_sandbox.is_(True), Family.deleted_at.is_(None))
    ) or 0
    users_total = await db.scalar(select(func.count()).select_from(User).where(User.deleted_at.is_(None))) or 0
    tx_total = await db.scalar(
        select(func.count()).select_from(Transaction).where(Transaction.deleted_at.is_(None))
    ) or 0
    receipts_total = await db.scalar(select(func.count()).select_from(Receipt)) or 0

    # Размер БД: PostgreSQL — pg_database_size; SQLite — размер файла
    db_size: str | None = None
    try:
        if settings.database_url.startswith("postgresql"):
            dbname = await db.scalar(select(func.current_database()))
            size_bytes = await db.scalar(select(func.pg_database_size(dbname)))
            db_size = _human_bytes(int(size_bytes or 0))
        else:
            file = settings.database_url.split("///")[-1]
            p = Path(file)
            if not p.is_absolute():
                p = Path(__file__).resolve().parents[2] / file
            db_size = _human_bytes(p.stat().st_size) if p.exists() else None
    except Exception:  # noqa: BLE001 — метрики не должны ронять эндпоинт
        db_size = None

    vol_bytes = _dir_size(settings.receipts_dir)
    return {
        "families_total": int(families_total),
        "families_active": int(families_active),
        "families_blocked": int(families_blocked),
        "families_sandbox": int(families_sandbox),
        "users_total": int(users_total),
        "transactions_total": int(tx_total),
        "receipts_total": int(receipts_total),
        "db_size": db_size,
        "receipts_volume_bytes": vol_bytes,
        "receipts_volume_human": _human_bytes(vol_bytes),
    }


def _dir_size(path: str | Path) -> int:
    root = Path(path)
    if not root.exists():
        return 0
    return sum(f.stat().st_size for f in root.rglob("*") if f.is_file())


def _human_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(n) < 1024:
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024
    return f"{n:.1f} PB"


# ---------------------------------------------------------------- логи
async def list_logs(db: AsyncSession, *, limit: int, action: str | None):
    cond = []
    if action:
        cond.append(AuditLog.action == action)
    total = await db.scalar(select(func.count()).select_from(AuditLog).where(*cond)) or 0
    items = (
        await db.execute(select(AuditLog).where(*cond).order_by(AuditLog.ts.desc(), AuditLog.id.desc()).limit(limit))
    ).scalars().all()
    return items, int(total)


# ---------------------------------------------------------------- системные категории
async def list_system_categories(db: AsyncSession) -> list[Category]:
    return list(
        (
            await db.execute(
                select(Category).where(Category.is_system.is_(True), Category.deleted_at.is_(None)).order_by(
                    Category.kind, Category.name
                )
            )
        )
        .scalars()
        .all()
    )


async def create_system_category(db: AsyncSession, data: dict[str, Any]) -> Category:
    cat = Category(
        family_id=None,
        is_system=True,
        name=data["name"],
        kind=CategoryKind(data["kind"]),
        icon=data.get("icon"),
        color=data.get("color"),
        parent_id=data.get("parent_id"),
    )
    db.add(cat)
    return cat


async def update_system_category(db: AsyncSession, cat_id: _uuid.UUID, data: dict[str, Any]) -> Category:
    cat = await db.get(Category, cat_id)
    if cat is None or not cat.is_system:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Системная категория не найдена")
    for k, v in data.items():
        if v is not None:
            setattr(cat, k, v)
    return cat


async def delete_system_category(db: AsyncSession, cat_id: _uuid.UUID) -> None:
    cat = await db.get(Category, cat_id)
    if cat is None or not cat.is_system:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Системная категория не найдена")
    used = await db.scalar(
        select(func.count()).select_from(Transaction).where(Transaction.category_id == cat_id)
    )
    if used:
        raise HTTPException(status.HTTP_409_CONFLICT, "Категория используется в транзакциях семей")
    cat.deleted_at = _utcnow()
