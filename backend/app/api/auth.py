"""Auth API (ТЗ 5, 9): регистрация семьи, вход, demo-sandbox, refresh-ротация, восстановление пароля."""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import DbDep, csrf_guard, get_current_user
from app.core.security import (
    CSRF_COOKIE,
    limiter,
    create_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.enums import AuditAction
from app.models.family import Family, User
from app.schemas.auth import (
    AuthResponse,
    FamilyOut,
    ForgotPasswordRequest,
    LoginRequest,
    OkResponse,
    RegisterRequest,
    ResetPasswordRequest,
    UserOut,
)
from app.services.audit import write_audit
from app.services.auth_service import (
    TokenPair,
    authenticate_user,
    create_demo_sandbox,
    issue_tokens,
    register_family,
)
from app.services.email import send_email

router = APIRouter(dependencies=[Depends(csrf_guard)])

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"


def _set_session_cookies(response: Response, pair: TokenPair) -> None:
    common = dict(httponly=True, samesite="lax", path="/")
    if settings.cookie_domain:
        common["domain"] = settings.cookie_domain
    if settings.cookie_secure:
        common["secure"] = True
    response.set_cookie(ACCESS_COOKIE, pair.access_token, expires=int(pair.access_exp.timestamp()), **common)
    # refresh — только на эндпоинты обновления сессии
    response.set_cookie(
        REFRESH_COOKIE, pair.refresh_token, expires=int(pair.refresh_exp.timestamp()),
        httponly=True, samesite="strict", secure=settings.cookie_secure,
        domain=settings.cookie_domain or None, path="/api/auth",
    )
    # CSRF double-submit: читается JS, сверяется с заголовком на сервере
    response.set_cookie(
        CSRF_COOKIE, pair.csrf_token, httponly=False, samesite="lax",
        secure=settings.cookie_secure, domain=settings.cookie_domain or None, path="/",
    )


def _clear_session_cookies(response: Response) -> None:
    for name in (ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE):
        response.delete_cookie(name, domain=settings.cookie_domain or None,
                               path="/" if name != REFRESH_COOKIE else "/api/auth")


def _user_out(user: User, is_demo: bool) -> UserOut:
    return UserOut(id=str(user.id), email=user.email, name=user.name, role=str(user.role),
                   is_demo=is_demo, must_change_password=user.must_change_password)


def _family_out(fam: Family) -> FamilyOut:
    return FamilyOut(id=str(fam.id), name=fam.name, timezone=fam.timezone,
                     currency=fam.currency, is_demo=fam.is_demo, is_sandbox=fam.is_sandbox)


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, request: Request, response: Response, db: DbDep):
    """Создание семьи + владельца + полный шаблон справочников (ТЗ 5.1)."""
    fam, owner = await register_family(
        db, family_name=body.family_name, name=body.name, email=body.email,
        password=body.password, timezone_str=body.timezone, currency=body.currency,
    )
    await write_audit(db, action=AuditAction.LOGIN, actor_id=str(owner.id),
                      actor_label=owner.email, target_family_id=fam.id,
                      ip=request.client.host if request.client else None,
                      user_agent=request.headers.get("user-agent"))
    pair = issue_tokens(user_id=owner.id, family_id=fam.id)
    _set_session_cookies(response, pair)
    return AuthResponse(user=_user_out(owner, False), family=_family_out(fam),
                        csrf_token=pair.csrf_token)


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, request: Request, response: Response, db: DbDep):
    user = await authenticate_user(db, body.email, body.password)
    await write_audit(db, action=AuditAction.LOGIN, actor_id=str(user.id),
                      actor_label=user.email, target_family_id=user.family_id,
                      ip=request.client.host if request.client else None,
                      user_agent=request.headers.get("user-agent"))
    pair = issue_tokens(user_id=user.id, family_id=user.family_id)
    _set_session_cookies(response, pair)
    fam = await db.get(Family, user.family_id)
    return AuthResponse(user=_user_out(user, False), family=_family_out(fam), csrf_token=pair.csrf_token)


@router.post("/demo-login", response_model=AuthResponse)
async def demo_login(request: Request, response: Response, db: DbDep):
    """Вход в демо без пароля: персональная sandbox-копия демо-семьи, TTL 24ч (ТЗ 5.2)."""
    if not settings.demo_mode:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Демо-режим отключён")
    fam, guest = await create_demo_sandbox(db)
    await write_audit(db, action=AuditAction.DEMO_LOGIN, actor_id=str(guest.id),
                      actor_label="demo-guest", target_family_id=fam.id,
                      ip=request.client.host if request.client else None,
                      user_agent=request.headers.get("user-agent"),
                      details={"sandbox": True, "expires_at": fam.expires_at.isoformat() if fam.expires_at else None})
    pair = issue_tokens(user_id=guest.id, family_id=fam.id, is_demo=True)
    _set_session_cookies(response, pair)
    return AuthResponse(user=_user_out(guest, True), family=_family_out(fam),
                        csrf_token=pair.csrf_token, is_demo_session=True)


@router.post("/refresh", response_model=AuthResponse)
async def refresh(request: Request, response: Response, db: DbDep):
    """Ротация refresh: старый jti одноразовый (выдаётся новый, access обновляется)."""
    token = request.cookies.get(REFRESH_COOKIE)
    payload = decode_token(token, expected_kind="refresh") if token else None
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Сессия истекла, войдите заново")
    user = await db.get(User, _uuid.UUID(payload["sub"]))
    if user is None or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пользователь не найден")
    fam = await db.get(Family, user.family_id)
    if fam is None or fam.deleted_at is not None or fam.is_blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Семья недоступна")
    pair = issue_tokens(user_id=user.id, family_id=user.family_id,
                        is_demo=bool(payload.get("is_demo")))
    _set_session_cookies(response, pair)
    return AuthResponse(user=_user_out(user, bool(payload.get("is_demo"))),
                        family=_family_out(fam), csrf_token=pair.csrf_token,
                        is_demo_session=bool(payload.get("is_demo")))


@router.post("/logout", response_model=OkResponse)
async def logout(request: Request, response: Response, db: DbDep,
                 current=Depends(get_current_user)):
    await write_audit(db, action=AuditAction.LOGOUT, actor_id=str(current.user.id),
                      actor_label=current.user.email, target_family_id=current.family_id,
                      ip=request.client.host if request.client else None)
    _clear_session_cookies(response)
    return OkResponse()


@router.get("/me", response_model=AuthResponse)
async def me(current=Depends(get_current_user)):
    return AuthResponse(user=_user_out(current.user, current.is_demo),
                        family=_family_out(current.family),
                        csrf_token="", is_demo_session=current.is_demo)


@router.post("/forgot-password", response_model=OkResponse)
async def forgot_password(body: ForgotPasswordRequest, db: DbDep):
    """ТЗ 5.3: письмо со ссылкой; без SMTP — ссылка в лог. Ответ одинаковый для
    несуществующего email (защита от перечисления)."""
    from sqlalchemy import func, select

    user = (
        await db.execute(select(User).where(func.lower(User.email) == body.email.strip().lower()))
    ).scalar_one_or_none()
    if user and user.deleted_at is None:
        # одноразовый токен сброса (тип refresh не используется для сессии здесь)
        reset_token, _ = create_token(sub=str(user.id), kind="refresh", family_id=str(user.family_id))
        link = f"https://{settings.domain}/reset-password?token={reset_token}"
        await send_email(body.email, "Восстановление пароля",
                         f"Для сброса пароля откройте ссылку (действует 24 часа):\n{link}\n"
                         f"Если запрос отправляли не вы — игнорируйте письмо.")
    return OkResponse()


@router.post("/reset-password", response_model=OkResponse)
async def reset_password(body: ResetPasswordRequest, request: Request, db: DbDep):
    payload = decode_token(body.token, expected_kind="refresh")
    if not payload:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Недействительная или просроченная ссылка")
    user = await db.get(User, _uuid.UUID(payload["sub"]))
    if user is None or user.deleted_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Пользователь не найден")
    user.password_hash = hash_password(body.password)
    user.must_change_password = False
    await write_audit(db, action=AuditAction.PASSWORD_RESET, actor_id=str(user.id),
                      actor_label=user.email, target_family_id=user.family_id,
                      target_user_id=user.id, ip=request.client.host if request.client else None,
                      details={"via": "email"})
    return OkResponse()


@router.post("/change-password", response_model=OkResponse)
async def change_password(
    request: Request, db: DbDep,
    current=Depends(get_current_user),
    old_password: str = "", new_password: str = "",
):
    if len(new_password) < 8:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Новый пароль слишком короткий")
    if not verify_password(old_password, current.user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Текущий пароль неверен")
    current.user.password_hash = hash_password(new_password)
    current.user.must_change_password = False
    await write_audit(db, action=AuditAction.PASSWORD_CHANGE, actor_id=str(current.user.id),
                      actor_label=current.user.email, target_family_id=current.family_id,
                      ip=request.client.host if request.client else None)
    return OkResponse()
