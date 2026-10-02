"""API панели супер-админа (ТЗ 4.1, 9). Все маршруты защищены токеном
superadmin_access (отдельный claim is_superadmin)."""
from __future__ import annotations

import uuid as _uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import CSRF_COOKIE, DbDep, get_current_superadmin
from app.core.security import check_csrf
from app.models.family import SuperAdmin
from app.schemas.superadmin import (
    BlockRequest,
    DeleteRequest,
    FamilyDetailOut,
    FamilyListOut,
    ImpersonateOut,
    LogsOut,
    MetricsOut,
    OkResponse,
    ResetPasswordRequest,
    SystemCategoryCreate,
    SystemCategoryOut,
    SystemCategoryUpdate,
    SuperAdminUserOut,
)
from app.services import superadmin_service as svc
from app.db.session import get_db

router = APIRouter()

SA = Annotated[SuperAdmin, Depends(get_current_superadmin)]


def _csrf(request: Request) -> None:
    """CSRF double-submit на mutation-запросах (ТЗ 10)."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    cookie = request.cookies.get(CSRF_COOKIE)
    header = request.headers.get("x-csrf-token")
    if not check_csrf(cookie, header):
        from fastapi import HTTPException

        raise HTTPException(status.HTTP_403_FORBIDDEN, "CSRF-проверка не пройдена")


def _ip_ua(request: Request) -> tuple[str | None, str | None]:
    fwd = request.headers.get("x-forwarded-for")
    ip = (fwd.split(",")[0].strip() if fwd else None) or (request.client.host if request.client else None)
    return ip, request.headers.get("user-agent")


# ---------------------------------------------------------------- семьи
@router.get("/families", response_model=FamilyListOut, dependencies=[Depends(_csrf)])
async def families(
    sa: SA,
    db: DbDep,
    search: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    include_deleted: bool = False,
) -> FamilyListOut:
    items, total = await svc.list_families(
        db, search=search, page=page, page_size=page_size, include_deleted=include_deleted
    )
    return FamilyListOut(items=items, total=total, page=page, page_size=page_size)


@router.get("/families/{family_id}", response_model=FamilyDetailOut)
async def family_detail(sa: SA, db: DbDep, family_id: _uuid.UUID) -> FamilyDetailOut:
    data = await svc.get_family_detail(db, family_id)
    return FamilyDetailOut.model_validate(data)


@router.patch("/families/{family_id}", response_model=OkResponse)
async def block_family(sa: SA, db: DbDep, request: Request, family_id: _uuid.UUID, body: BlockRequest) -> OkResponse:
    _csrf(request)
    ip, ua = _ip_ua(request)
    await svc.set_block(db, sa, family_id, is_blocked=body.is_blocked, reason=body.reason, ip=ip, ua=ua)
    return OkResponse(message="Семья заблокирована" if body.is_blocked else "Семья разблокирована")


@router.delete("/families/{family_id}", response_model=OkResponse)
async def delete_family(sa: SA, db: DbDep, request: Request, family_id: _uuid.UUID, hard: bool = False) -> OkResponse:
    _csrf(request)
    ip, ua = _ip_ua(request)
    msg = await svc.delete_family(db, sa, family_id, hard=hard, ip=ip, ua=ua)
    return OkResponse(message=msg)


@router.post("/families/{family_id}/impersonate/{user_id}", response_model=ImpersonateOut)
async def impersonate(sa: SA, db: DbDep, request: Request, response: Response,
                      family_id: _uuid.UUID, user_id: _uuid.UUID) -> ImpersonateOut:
    _csrf(request)
    ip, ua = _ip_ua(request)
    data = await svc.impersonate_user(db, sa, family_id, user_id, ip=ip, ua=ua)
    # ставим access-куку от имени пользователя — фронт попадёт в интерфейс семьи.
    # CSRF-кука не трогаем: superadmin-сессия сохраняет контроль над /api/superadmin/*.
    common = dict(httponly=True, samesite="lax", path="/")
    if settings.cookie_domain:
        common["domain"] = settings.cookie_domain
    if settings.cookie_secure:
        common["secure"] = True
    response.set_cookie("access_token", data["access_token"], **common)
    return ImpersonateOut(**data)


# ---------------------------------------------------------------- пользователи
@router.get("/users", response_model=list[SuperAdminUserOut])
async def users(
    sa: SA,
    db: DbDep,
    search: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> list[SuperAdminUserOut]:
    rows, _total = await svc.list_users(db, search=search, page=page, page_size=page_size)
    out = []
    for u, _fname in rows:
        d = SuperAdminUserOut.model_validate(u)
        out.append(d)
    return out


@router.post("/users/{user_id}/reset-password", response_model=OkResponse)
async def reset_password(sa: SA, db: DbDep, request: Request, user_id: _uuid.UUID, body: ResetPasswordRequest) -> OkResponse:
    _csrf(request)
    ip, ua = _ip_ua(request)
    await svc.reset_user_password(
        db, sa, user_id, body.new_password, force_change=body.force_change, ip=ip, ua=ua
    )
    return OkResponse(message="Пароль сброшен")


# ---------------------------------------------------------------- метрики / логи
@router.get("/metrics", response_model=MetricsOut)
async def metrics(sa: SA, db: DbDep) -> MetricsOut:
    return MetricsOut(**await svc.platform_metrics(db))


@router.get("/logs", response_model=LogsOut)
async def logs(
    sa: SA,
    db: DbDep,
    limit: int = Query(default=100, ge=1, le=1000),
    action: str | None = Query(default=None, max_length=64),
) -> LogsOut:
    items, total = await svc.list_logs(db, limit=limit, action=action)
    return LogsOut(items=items, total=total)


# ---------------------------------------------------------------- системные категории
@router.get("/system-categories", response_model=list[SystemCategoryOut])
async def system_categories(sa: SA, db: DbDep) -> list[SystemCategoryOut]:
    return list(await svc.list_system_categories(db))


@router.post("/system-categories", response_model=SystemCategoryOut, status_code=status.HTTP_201_CREATED)
async def create_system_category(sa: SA, db: DbDep, request: Request, body: SystemCategoryCreate) -> SystemCategoryOut:
    _csrf(request)
    cat = await svc.create_system_category(db, body.model_dump())
    return SystemCategoryOut.model_validate(cat)


@router.patch("/system-categories/{cat_id}", response_model=SystemCategoryOut)
async def update_system_category(
    sa: SA, db: DbDep, request: Request, cat_id: _uuid.UUID, body: SystemCategoryUpdate
) -> SystemCategoryOut:
    _csrf(request)
    cat = await svc.update_system_category(db, cat_id, body.model_dump(exclude_unset=True))
    return SystemCategoryOut.model_validate(cat)


@router.delete("/system-categories/{cat_id}", response_model=OkResponse)
async def delete_system_category(sa: SA, db: DbDep, request: Request, cat_id: _uuid.UUID) -> OkResponse:
    _csrf(request)
    await svc.delete_system_category(db, cat_id)
    return OkResponse(message="Категория удалена")
