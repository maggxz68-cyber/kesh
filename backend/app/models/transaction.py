"""Транзакции (доход/расход/перевод) и бюджеты."""
from __future__ import annotations

import uuid as _uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Uuid,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
# (listens_for не используется: автопересчёт вынесен в app/services/balances.py)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import BudgetPeriod, TransactionType, enum_column
from app.models.family import Family, User
from app.models.mixins import SoftDeleteMixin, TimestampMixin

# M:N транзакции ↔ теги (ТЗ 7.3)
transaction_tags = Table(
    "transaction_tags",
    Base.metadata,
    Column("transaction_id", ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


# --- Автопересчёт балансов счетов --------------------------------------------
# Реализация вынесена в app/services/balances.py (явный контракт вместо ORM-хуков:
# в async-сессии mapper-события исполняются в sync-bridge и ненадёжны).
# Совместимые реэкспорты:
from app.services.balances import (  # noqa: E402,F401
    affected_account_ids,
    apply_pending_balance_recalc,
    mark_accounts_dirty,
    recalc_account_balance,
)


class Transaction(Base, TimestampMixin, SoftDeleteMixin):
    """Финансовая операция семьи.

    income  — поступление на account_id
    expense — списание с account_id
    transfer — account_id -> target_account_id (категория не обязательна)
    """

    __tablename__ = "transactions"

    id: Mapped[_uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=_uuid.uuid4)
    family_id: Mapped[_uuid.UUID] = mapped_column(
        ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[_uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    type: Mapped[TransactionType] = mapped_column(enum_column(TransactionType, "transaction_type"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="RUB")

    account_id: Mapped[_uuid.UUID] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Для переводов — счёт-получатель
    target_account_id: Mapped[_uuid.UUID | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    category_id: Mapped[_uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    counterparty_id: Mapped[_uuid.UUID | None] = mapped_column(
        ForeignKey("counterparties.id", ondelete="SET NULL"), nullable=True, index=True
    )

    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    comment: Mapped[str | None] = mapped_column(Text)
    has_receipt: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    family: Mapped[Family] = relationship(back_populates="transactions")
    author: Mapped[User | None] = relationship()
    account: Mapped["Account"] = relationship(back_populates="transactions", foreign_keys=[account_id])  # noqa: F821
    target_account: Mapped["Account | None"] = relationship(foreign_keys=[target_account_id])  # noqa: F821
    category: Mapped["Category | None"] = relationship(foreign_keys=[category_id])  # noqa: F821
    tags: Mapped[list["Tag"]] = relationship(secondary=transaction_tags, lazy="selectin")  # noqa: F821
    receipt_links: Mapped[list["ReceiptTransaction"]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint(
            "type <> 'transfer' OR target_account_id IS NOT NULL",
            name="transfer_has_target",
        ),
        CheckConstraint(
            "type <> 'transfer' OR account_id <> target_account_id",
            name="transfer_diff_accounts",
        ),
        Index("ix_transactions_family_occurred", "family_id", occurred_at.desc()),
        Index("ix_transactions_family_type", "family_id", "type"),
        Index("ix_transactions_author", "author_id"),
    )


class Budget(Base, TimestampMixin, SoftDeleteMixin):
    """Лимит по категории на период (неделя/месяц/год). Лимит 0 = пустой шаблон."""

    __tablename__ = "budgets"

    id: Mapped[_uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=_uuid.uuid4)
    family_id: Mapped[_uuid.UUID] = mapped_column(
        ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[_uuid.UUID] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    period: Mapped[BudgetPeriod] = mapped_column(enum_column(BudgetPeriod, "budget_period"), nullable=False)
    limit_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    # Границы периода; для monthly: period_start = первый день месяца
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    notify_on_overrun: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    family: Mapped[Family] = relationship(back_populates="budgets")
    category: Mapped["Category"] = relationship(foreign_keys=[category_id])  # noqa: F821

    __table_args__ = (
        UniqueConstraint("family_id", "category_id", "period", "period_start", name="uq_budget_unique"),
        CheckConstraint("limit_amount >= 0", name="limit_non_negative"),
    )


# --- Автопересчёт балансов счетов --------------------------------------------
# Реализация вынесена в app/services/balances.py (явный контракт вместо ORM-хуков:
# в async-сессии mapper-события исполняются в sync-bridge и ненадёжны).
# Совместимые реэкспорты:
from app.services.balances import (  # noqa: E402,F401
    affected_account_ids,
    apply_pending_balance_recalc,
    mark_accounts_dirty,
    recalc_account_balance,
)

