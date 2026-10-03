"""Финансовые справочники: счета, категории, теги, контрагенты."""
from __future__ import annotations

import uuid as _uuid
from decimal import Decimal

from sqlalchemy import (
    Uuid,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AccountType, CategoryKind, enum_column
from app.models.family import Family
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class Account(Base, TimestampMixin, SoftDeleteMixin):
    """Счёт семьи: наличные/карта/банк/кредитка. Баланс пересчитывается из транзакций."""

    __tablename__ = "accounts"

    id: Mapped[_uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=_uuid.uuid4)
    family_id: Mapped[_uuid.UUID] = mapped_column(
        ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[AccountType] = mapped_column(enum_column(AccountType, "account_type"), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="RUB")

    opening_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    # Кэшированный текущий баланс; источник истины — транзакции (пересчёт на записи).
    balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))

    icon: Mapped[str | None] = mapped_column(String(64))       # имя lucide-иконки
    color: Mapped[str | None] = mapped_column(String(16))      # hex
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    family: Mapped[Family] = relationship(back_populates="accounts", lazy="noload")
    transactions: Mapped[list["Transaction"]] = relationship(  # noqa: F821
        back_populates="account", foreign_keys="Transaction.account_id"
    )

    __table_args__ = (UniqueConstraint("family_id", "name", name="uq_accounts_family_name"),)


class Category(Base, TimestampMixin, SoftDeleteMixin):
    """Категория дохода/расхода. Иерархия через parent_id.

    is_system=True — глобальный шаблонный справочник (для семей только чтение);
    обычные пользовательские категории привязаны к family_id.
    """

    __tablename__ = "categories"

    id: Mapped[_uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=_uuid.uuid4)
    # NULL family_id => системный шаблон (управляется супер-админом)
    family_id: Mapped[_uuid.UUID | None] = mapped_column(
        ForeignKey("families.id", ondelete="CASCADE"), nullable=True, index=True
    )
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[CategoryKind] = mapped_column(enum_column(CategoryKind, "category_kind"), nullable=False)
    parent_id: Mapped[_uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )

    icon: Mapped[str | None] = mapped_column(String(64))   # lucide
    color: Mapped[str | None] = mapped_column(String(16))  # hex
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # lazy="selectin" — обязательна для async-движка: сериализация не должна вызывать IO вне greenlet
    family: Mapped[Family | None] = relationship(back_populates="categories", lazy="noload")
    children: Mapped[list["Category"]] = relationship(
        back_populates="parent", cascade="all", foreign_keys="Category.parent_id", lazy="selectin"
    )
    parent: Mapped["Category | None"] = relationship(
        back_populates="children", remote_side="Category.id", foreign_keys="Category.parent_id", lazy="selectin"
    )

    __table_args__ = (
        UniqueConstraint("family_id", "name", "kind", name="uq_categories_family_name_kind"),
        Index("ix_categories_family_kind", "family_id", "kind"),
    )


class Tag(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "tags"

    id: Mapped[_uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=_uuid.uuid4)
    family_id: Mapped[_uuid.UUID] = mapped_column(
        ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str | None] = mapped_column(String(16))

    family: Mapped[Family] = relationship(back_populates="tags", lazy="noload")

    __table_args__ = (UniqueConstraint("family_id", "name", name="uq_tags_family_name"),)


class Counterparty(Base, TimestampMixin, SoftDeleteMixin):
    """Магазины/поставщики/люди (контрагент транзакции)."""

    __tablename__ = "counterparties"

    id: Mapped[_uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=_uuid.uuid4)
    family_id: Mapped[_uuid.UUID] = mapped_column(
        ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    inn: Mapped[str | None] = mapped_column(String(12))
    category_id: Mapped[_uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )

    family: Mapped[Family] = relationship(back_populates="counterparties", lazy="noload")

    __table_args__ = (UniqueConstraint("family_id", "name", name="uq_counterparties_family_name"),)
