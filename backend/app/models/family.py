"""Модели: семья (family), пользователь (user), супер-админ, приглашение."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Uuid,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import UserRole, enum_column
from app.models.mixins import SoftDeleteMixin, TimestampMixin

import uuid as _uuid


def _uuid_default() -> _uuid.UUID:
    return _uuid.uuid4()


class Family(Base, TimestampMixin, SoftDeleteMixin):
    """Тенант. Вся бизнес-логика изолируется по family_id."""

    __tablename__ = "families"

    id: Mapped[_uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=_uuid_default)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Europe/Moscow")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="RUB")

    # Статусы платформы
    is_blocked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    blocked_reason: Mapped[str | None] = mapped_column(String(500))

    # Демо/песочница: sandbox-копии демо-семьи живут TTL и удаляются cron'ом
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_sandbox: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    users: Mapped[list[User]] = relationship(back_populates="family", cascade="all, delete-orphan", lazy="noload")
    accounts: Mapped[list["Account"]] = relationship(back_populates="family", cascade="all, delete-orphan", lazy="noload")  # noqa: F821
    categories: Mapped[list["Category"]] = relationship(back_populates="family", cascade="all, delete-orphan", lazy="noload")  # noqa: F821
    tags: Mapped[list["Tag"]] = relationship(back_populates="family", cascade="all, delete-orphan", lazy="noload")  # noqa: F821
    counterparties: Mapped[list["Counterparty"]] = relationship(back_populates="family", cascade="all, delete-orphan", lazy="noload")  # noqa: F821
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="family", cascade="all, delete-orphan", lazy="noload")  # noqa: F821
    budgets: Mapped[list["Budget"]] = relationship(back_populates="family", cascade="all, delete-orphan", lazy="noload")  # noqa: F821
    receipts: Mapped[list["Receipt"]] = relationship(back_populates="family", cascade="all, delete-orphan", lazy="noload")  # noqa: F821

    __table_args__ = (Index("ix_families_is_sandbox_expires", "is_sandbox", "expires_at"),)


class User(Base, TimestampMixin, SoftDeleteMixin):
    """Пользователь семьи (owner/member). Супер-админ — отдельная таблица."""

    __tablename__ = "users"

    id: Mapped[_uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=_uuid_default)
    family_id: Mapped[_uuid.UUID] = mapped_column(
        ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(enum_column(UserRole, "user_role"), nullable=False, default=UserRole.MEMBER)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    family: Mapped[Family] = relationship(back_populates="users", lazy="noload")
    memberships: Mapped[list["FamilyMemberVisibility"]] = relationship(
        back_populates="user", cascade="all, delete-orphan",
        foreign_keys="FamilyMemberVisibility.user_id",
    )

    __table_args__ = (Index("ix_users_family_email", "family_id", "email"),)


class SuperAdmin(Base, TimestampMixin):
    """Платформенный администратор. Не привязан ни к одной семье."""

    __tablename__ = "superadmins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    login: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Invitation(Base, TimestampMixin):
    """Приглашение в семью (владелец отправляет, участник принимает по коду)."""

    __tablename__ = "invitations"

    id: Mapped[_uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=_uuid_default)
    family_id: Mapped[_uuid.UUID] = mapped_column(
        ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    invited_by_id: Mapped[_uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (UniqueConstraint("family_id", "email", name="uq_invitations_family_email"),)


class FamilyMemberVisibility(Base, TimestampMixin):
    """Настройка видимости данных участника для остальных членов семьи (ТЗ 4.3)."""

    __tablename__ = "member_visibility"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[_uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Кому видна активность (NULL = всем членам семьи)
    visible_to_user_id: Mapped[_uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    show_transactions: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_balances: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    user: Mapped[User] = relationship(back_populates="memberships", lazy="noload", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("user_id", "visible_to_user_id", name="uq_member_visibility_pair"),
    )
