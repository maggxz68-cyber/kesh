"""Авторизация супер-админа (ТЗ 4.1): отдельная страница/эндпоинт, свой JWT-claim."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response

from app.core.deps import DbDep, csrf_guard, get_current_superadmin
from app.models.enums import AuditAction
from app.models.family import SuperAdmin
from app.schemas.auth import AuthResponse, OkResponse, SuperadminLoginRequest, UserOut
from app.services.audit import write_audit
from app.services.auth_service import issue_tokens
from app.api.auth import _set_session_cookies  # общий механизм cookie
from app.core.security import verify_password
from fastapi import HTTPException, status

router = APIRouter(dependencies=[Depends(csrf_guard)])


@router.post("/login", response_model=AuthResponse)
async def superadmin_login(body: SuperadminLoginRequest, request: Request, response: Response, db: DbDep):
    sa = (await db.execute(__import__("sqlalchemy").select(SuperAdmin).where(SuperAdmin.login == body.login))).scalar_one_or_none()
    if sa is None or not verify_password(body.password, sa.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный логин или пароль")
    from datetime import datetime, timezone
    sa.last_login_at = datetime.now(timezone.utc)
    await write_audit(db, action=AuditAction.LOGIN, actor_id=str(sa.id), actor_type="superadmin",
                      actor_label=sa.login, ip=request.client.host if request.client else None,
                      user_agent=request.headers.get("user-agent"), details={"scope": "superadmin"})
    pair = issue_tokens(user_id=sa.id, family_id=None, is_superadmin=True)
    _set_session_cookies(response, pair)
    return AuthResponse(
        user=UserOut(id=str(sa.id), email=sa.login, name="Супер-админ", role="superadmin",
                     must_change_password=sa.must_change_password),
        family=None, csrf_token=pair.csrf_token,
    )


@router.post("/logout", response_model=OkResponse)
async def superadmin_logout(request: Request, response: Response, db: DbDep,
                            sa: SuperAdmin = Depends(get_current_superadmin)):
    await write_audit(db, action=AuditAction.LOGOUT, actor_id=str(sa.id), actor_type="superadmin",
                      actor_label=sa.login, ip=request.client.host if request.client else None)
    from app.api.auth import _clear_session_cookies
    _clear_session_cookies(response)
    return OkResponse()


@router.get("/me", response_model=AuthResponse)
async def superadmin_me(sa: SuperAdmin = Depends(get_current_superadmin)):
    return AuthResponse(
        user=UserOut(id=str(sa.id), email=sa.login, name="Супер-админ", role="superadmin",
                     must_change_password=sa.must_change_password),
        family=None, csrf_token="",
    )

@router.get("/metrics")
async def get_superadmin_metrics(db: DbDep):
    """Возвращает реальные метрики для панели супер-админа."""
    from sqlalchemy import func, select
    from app.models.family import Family, User
    from app.models.transaction import Transaction
    from app.models.receipt import Receipt
    
    # Считаем семьи
    families_total = (await db.execute(select(func.count()).select_from(Family))).scalar() or 0
    
    # Считаем пользователей
    users_total = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    
    # Считаем транзакции
    transactions_total = (await db.execute(select(func.count()).select_from(Transaction))).scalar() or 0
    
    # Считаем чеки
    receipts_total = (await db.execute(select(func.count()).select_from(Receipt))).scalar() or 0
    
    # Считаем общий размер файлов чеков
    receipts_volume_bytes = (await db.execute(select(func.sum(Receipt.size_bytes)))).scalar() or 0
    
    # Размер БД (в MB)
    db_size = (await db.execute(select(func.pg_database_size('family_finance')))).scalar() or 0
    db_size_mb = round(db_size / (1024 * 1024), 2)
    
    def format_size(size_bytes):
        if not size_bytes:
            return "0 B"
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.2f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.2f} TB"

    return {
        "families_total": families_total,
        "families_active": families_total,
        "families_blocked": 0,
        "families_sandbox": 0,
        "users_total": users_total,
        "transactions_total": transactions_total,
        "receipts_total": receipts_total,
        "db_size": f"{db_size_mb} MB",
        "receipts_volume_bytes": receipts_volume_bytes,
        "receipts_volume_human": format_size(receipts_volume_bytes)
    }
