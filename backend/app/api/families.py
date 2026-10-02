"""Семья и участники (ТЗ 5.1, 9): профиль семьи, пользователи, приглашения, вход по коду."""
from __future__ import annotations

import secrets
import uuid as uuid_mod
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbDep, csrf_guard, get_current_user, require_owner
from app.core.security import hash_password
from app.models.enums import UserRole
from app.models.family import Family, Invitation, User
from app.schemas.reports import FamilyOut, FamilyUserOut, InviteCreate, InviteOut, JoinRequest
from app.services.audit import write_audit
from app.services.email import send_email

router = APIRouter(dependencies=[Depends(csrf_guard)])
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
OwnerDep = Annotated[CurrentUser, Depends(require_owner)]


@router.get("/me", response_model=FamilyOut)
async def my_family(db: DbDep, current: CurrentUserDep) -> FamilyOut:
    f = current.family
    return FamilyOut(
        id=f.id, name=f.name, timezone=f.timezone, currency=f.currency,
        registered_at=f.created_at, is_demo=f.is_demo,
    )


@router.get("/users", response_model=list[FamilyUserOut])
async def family_users(db: DbDep, current: CurrentUserDep) -> list[FamilyUserOut]:
    rows = (
        await db.execute(
            select(User)
            .where(User.family_id == current.family_id, User.deleted_at.is_(None))
            .order_by(User.role, User.name)
        )
    ).scalars().all()
    return [
        FamilyUserOut(
            id=u.id, email=u.email, name=u.name, role=str(u.role),
            is_active=u.is_active, last_login_at=u.last_login_at,
        )
        for u in rows
    ]


@router.post("/invite", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(body: InviteCreate, db: DbDep, owner: OwnerDep) -> InviteOut:
    """Приглашение участника (только owner). Ссылка с кодом — в лог/SMTP (для MVP — лог)."""
    existing_member = (
        await db.execute(
            select(User.id).where(
                User.email == body.email.lower(), User.family_id == owner.family_id, User.deleted_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    if existing_member:
        raise HTTPException(status.HTTP_409_CONFLICT, "Этот email уже в семье")

    code = secrets.token_urlsafe(24)
    inv = Invitation(
        family_id=owner.family_id,
        email=body.email.lower(),
        code=code,
        invited_by_id=owner.user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(inv)
    await db.flush()

    link = f"https://{settings.domain}/join?code={code}"
    # для MVP без SMTP send_email пишет в лог (ТЗ 5.3)
    await send_email(
        to=inv.email,
        subject=f"Приглашение в семью «{owner.family.name}»",
        body=f"Вас приглашают в семейный учёт финансов. Принять: {link}",
    )
    return InviteOut(id=inv.id, email=inv.email, code=code, expires_at=inv.expires_at)


@router.get("/invites")
async def list_invites(db: DbDep, owner: OwnerDep) -> list[dict]:
    rows = (
        await db.execute(
            select(Invitation)
            .where(Invitation.family_id == owner.family_id)
            .order_by(Invitation.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    return [
        {
            "id": i.id, "email": i.email,
            "expires_at": i.expires_at, "accepted_at": i.accepted_at,
        }
        for i in rows
    ]


@router.post("/join", status_code=status.HTTP_201_CREATED)
async def join_by_code(request, body: JoinRequest, db: DbDep) -> dict:  # noqa: ARG001
    """Присоединение к семье по коду приглашения с созданием аккаунта участника."""
    inv = (
        await db.execute(select(Invitation).where(Invitation.code == body.code))
    ).scalar_one_or_none()
    if inv is None or inv.accepted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Приглашение не найдено")
    if inv.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_410_GONE, "Приглашение истекло")
    if inv.email.lower() != body.email.lower():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Email не совпадает с приглашением")

    dup = (
        await db.execute(select(User.id).where(User.email == body.email.lower(), User.deleted_at.is_(None)))
    ).scalar_one_or_none()
    if dup:
        raise HTTPException(status.HTTP_409_CONFLICT, "Пользователь с таким email уже существует")

    fam = (await db.execute(select(Family).where(Family.id == inv.family_id))).scalar_one()
    if fam.is_blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Семья заблокирована")

    user = User(
        family_id=fam.id,
        email=body.email.lower(),
        name=body.name.strip(),
        password_hash=hash_password(body.password),
        role=UserRole.MEMBER,
        is_active=True,
    )
    inv.accepted_at = datetime.now(timezone.utc)
    db.add(user)
    await db.flush()
    await write_audit(
        db, action="family_join", actor_type="user", actor_id=str(user.id),
        actor_label=user.email, target_family_id=fam.id, target_user_id=user.id,
        ip=request.client.host if request.client else None,
    )
    return {"ok": True, "family": fam.name}


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_member(user_id: str, db: DbDep, owner: OwnerDep) -> None:
    """Исключение участника (owner; soft delete, транзакции остаются за автором)."""
    uid = __import__("uuid").UUID(user_id) if "-" in user_id else None
    if uid is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Некорректный id")
    u = (
        await db.execute(select(User).where(User.id == uid, User.family_id == owner.family_id))
    ).scalar_one_or_none()
    if u is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь не найден")
    if u.role == UserRole.OWNER:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нельзя удалить владельца семьи")
    u.deleted_at = datetime.now(timezone.utc)
    u.is_active = False
    await db.flush()
