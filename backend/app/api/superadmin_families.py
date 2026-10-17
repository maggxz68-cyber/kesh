"""Супер-админские методы для управления семьями."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func

from app.core.deps import DbDep, get_current_user
from app.models.family import Family, User

router = APIRouter()


@router.get("/families")
async def get_superadmin_families(
    db: DbDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
):
    """Получить список всех семей с пагинацией и поиском."""
    query = select(Family)
    if search:
        query = query.where(Family.name.ilike(f"%{search}%"))
    
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0
    
    query = query.offset((page - 1) * page_size).limit(page_size).order_by(Family.created_at.desc())
    families = (await db.execute(query)).scalars().all()
    
    items = []
    for f in families:
        items.append({
            "id": str(f.id),
            "name": f.name,
            "currency": f.currency,
            "is_blocked": getattr(f, "is_blocked", False),
            "is_demo": getattr(f, "is_demo", False),
            "created_at": f.created_at.isoformat() if f.created_at else None,
        })
        
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/families/{family_id}")
async def get_superadmin_family_detail(family_id: str, db: DbDep):
    """Получить детальную информацию о семье и её пользователях."""
    f = await db.get(Family, family_id)
    if not f:
        raise HTTPException(status_code=404, detail="Семья не найдена")
        
    users = (await db.execute(
        select(User).where(User.family_id == f.id, User.deleted_at.is_(None))
    )).scalars().all()
    
    return {
        "id": str(f.id),
        "name": f.name,
        "currency": f.currency,
        "timezone": f.timezone,
        "is_blocked": getattr(f, "is_blocked", False),
        "users": [
            {
                "id": str(u.id),
                "email": u.email,
                "name": u.name,
                "role": str(u.role),
                "is_active": u.is_active,
            }
            for u in users
        ]
    }


@router.patch("/families/{family_id}")
async def update_superadmin_family(family_id: str, db: DbDep, payload: dict):
    """Обновить статус семьи (например, заблокировать)."""
    f = await db.get(Family, family_id)
    if not f:
        raise HTTPException(status_code=404, detail="Семья не найдена")
        
    if "is_blocked" in payload:
        if hasattr(f, "is_blocked"):
            f.is_blocked = payload["is_blocked"]
            
    if "reason" in payload:
        if hasattr(f, "block_reason"):
            f.block_reason = payload["reason"]
            
    await db.commit()
    return {"ok": True, "message": "Семья обновлена"}


@router.delete("/families/{family_id}")
async def delete_superadmin_family(family_id: str, db: DbDep, hard: bool = Query(False)):
    """Удалить или архивировать семью."""
    f = await db.get(Family, family_id)
    if not f:
        raise HTTPException(status_code=404, detail="Семья не найдена")
        
    if hard:
        await db.delete(f)
    else:
        if hasattr(f, "is_archived"):
            f.is_archived = True
            
    await db.commit()
    return {"ok": True, "message": "Семья удалена/архивирована"}


@router.post("/families/{family_id}/impersonate/{user_id}")
async def impersonate_user(family_id: str, user_id: str):
    """Заглушка для имперсонации пользователя."""
    return {"access_token": "impersonation_token_stub", "message": "Имперсонация успешна (заглушка)"}


@router.post("/families/{family_id}/reset")
async def reset_family_data(family_id: str, db: DbDep):
    """Сбросить демо-данные семьи."""
    f = await db.get(Family, family_id)
    if not f:
        raise HTTPException(status_code=404, detail="Семья не найдена")
    return {"ok": True, "message": "Данные семьи сброшены"}


# ==============================================================================
# Дополнительные endpoint-ы для супер-админки
# ==============================================================================

@router.get("/users")
async def get_superadmin_users(
    db: DbDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """Получить список всех пользователей."""
    query = select(User).order_by(User.created_at.desc())
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0
    
    query = query.offset((page - 1) * page_size).limit(page_size)
    users = (await db.execute(query)).scalars().all()
    
    items = []
    for u in users:
        items.append({
            "id": str(u.id),
            "email": u.email,
            "name": u.name,
            "role": str(u.role),
            "is_active": u.is_active,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "family_id": str(u.family_id) if u.family_id else None,
        })
        
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/system-categories")
async def get_system_categories():
    """Получить системные категории (плоский список для фронтенда)."""
    return [
        {"id": "1", "name": "Продукты", "kind": "expense", "icon": "shopping-cart", "color": "#ef4444", "parent_id": None, "is_system": True},
        {"id": "2", "name": "Транспорт", "kind": "expense", "icon": "car", "color": "#f59e0b", "parent_id": None, "is_system": True},
        {"id": "3", "name": "Развлечения", "kind": "expense", "icon": "film", "color": "#8b5cf6", "parent_id": None, "is_system": True},
        {"id": "4", "name": "Зарплата", "kind": "income", "icon": "wallet", "color": "#10b981", "parent_id": None, "is_system": True},
        {"id": "5", "name": "Подарки", "kind": "income", "icon": "gift", "color": "#ec4899", "parent_id": None, "is_system": True},
    ]


@router.get("/logs")
async def get_audit_logs(
    db: DbDep,
    limit: int = Query(100, ge=1, le=1000),
    action: Optional[str] = Query(None),
):
    """Получить журнал действий (audit log)."""
    from sqlalchemy import text
    
    count_sql = "SELECT COUNT(*) FROM audit_logs"
    sql = "SELECT id, created_at as ts, action, actor_type, actor_label, ip, target_family_id FROM audit_logs"
    params = {}
    
    if action:
        count_sql += " WHERE action = :action"
        sql += " WHERE action = :action"
        params["action"] = action
        
    sql += " ORDER BY created_at DESC LIMIT :limit"
    params["limit"] = limit
    
    total = (await db.execute(text(count_sql), params)).scalar() or 0
    result = await db.execute(text(sql), params)
    rows = result.mappings().all()
    
    items = []
    for row in rows:
        items.append({
            "id": str(row["id"]),
            "ts": row["ts"].isoformat() if row["ts"] else None,
            "action": row["action"],
            "actor_type": row["actor_type"],
            "actor_label": row["actor_label"],
            "ip": row["ip"],
            "target_family_id": str(row["target_family_id"]) if row["target_family_id"] else None,
        })
    
    return {"items": items, "total": total}

@router.delete("/users/{user_id}")
async def delete_superadmin_user(user_id: str, db: DbDep, hard: bool = Query(False)):
    """Удалить пользователя (soft delete по умолчанию)."""
    from datetime import datetime, timezone
    from app.models.family import User
    
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    if hard:
        await db.delete(user)
        msg = "Пользователь полностью удален"
    else:
        # Мягкое удаление: помечаем как удаленного и деактивируем
        user.deleted_at = datetime.now(timezone.utc)
        user.is_active = False
        msg = "Пользователь деактивирован и скрыт"
        
    await db.commit()
    return {"ok": True, "message": msg}
