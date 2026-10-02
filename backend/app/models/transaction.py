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
from sqlalchemy.event import listens_for
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


async def recalc_account_balance(session, account_id: _uuid.UUID | None) -> None:
    """Пересчёт кэшированного баланса счёта по проводкам (источник истины — транзакции).

    Вызывается из FamilySession.commit() (async). UPDATE выполняется через Core
    с synchronize_session=False, затем ORM-объект принудительно refresh()ится —
    так баланс корректно обновляется даже если объект уже был загружен в identity map.
    """
    if account_id is None:
        return
    from sqlalchemy import func, select, update
    from app.models.reference import Account

    acc = await session.get(Account, account_id)
    if acc is None:
        return
    T = Transaction.__table__
    live = T.c.deleted_at.is_(None)

    outflow = (
        await session.execute(
            select(func.coalesce(func.sum(T.c.amount), 0)).where(
                T.c.account_id == account_id, live, T.c.type.in_(["expense", "transfer"])
            )
        )
    ).scalar_one()
    inflow_part1 = (
        await session.execute(
            select(func.coalesce(func.sum(T.c.amount), 0)).where(
                T.c.account_id == account_id, live, T.c.type == "income"
            )
        )
    ).scalar_one()
    inflow_part2 = (
        await session.execute(
            select(func.coalesce(func.sum(T.c.amount), 0)).where(
                T.c.target_account_id == account_id, live, T.c.type == "transfer"
            )
        )
    ).scalar_one()
    new_balance = acc.opening_balance + Decimal(inflow_part1) + Decimal(inflow_part2) - Decimal(outflow)
    # UPDATE через Core (synchronize_session=False), затем принудительный refresh()
    # ORM-объекта: иначе identity map может держать старое значение и затереть его
    # при следующем flush().
    await session.execute(
        update(Account.__table__)
        .where(Account.__table__.c.id == account_id)
        .values(balance=new_balance)
        .execution_options(synchronize_session=False)
    )
    await session.refresh(acc)


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


# --- Автопересчёт балансов счетов при изменении транзакций -------------------
# after-события mapper исполняются в sync-bridge внутри async-сессии,
# поэтому берём object_session(target) и накапливаем «грязные» счета на сессии.

def _affected_accounts(target) -> list:
    ids = [target.account_id, target.target_account_id]
    return [i for i in ids if i is not None]


def mark_accounts_dirty(session, account_ids) -> None:
    """Публичный хелпер: отметить счета для пересчёта баланса перед коммитом.

    Используется сервисами при soft-delete (deleted_at = now()), когда ORM-update
    не меняет account_id и after_update-хук не срабатывает на нужный счёт.
    """
    _mark_dirty(session, account_ids)


def _mark_dirty(session, account_ids) -> None:
    dirty = getattr(session, "_dirty_accounts", None)
    if dirty is None:
        dirty = set()
        session._dirty_accounts = dirty  # type: ignore[attr-defined]
    dirty.update(account_ids)


def _register_dirty(session, account_ids) -> None:
    """Надёжная регистрация «грязных» счетов.

    Внутри after-хуков SQLAlchemy (sync-bridge) `object_session(target)` может
    возвращать sync-обёртку AsyncSession, отличную от самого объекта AsyncSession,
    поэтому пишем множество и в sync-сессию, и (если это обёртка) в её async-владелца.
    """
    _mark_dirty(session, account_ids)
    inner = getattr(session, "_session", None)  # AsyncSession._session -> SyncSession
    if inner is not None and inner is not session:
        _mark_dirty(inner, account_ids)
    owner = getattr(session, "_async_session", None)  # AsyncSession самой sync-сессии
    if owner is not None and owner is not session:
        _mark_dirty(owner, account_ids)


@listens_for(Transaction, "after_insert")
def _tx_after_insert(mapper, connection, target):
    from sqlalchemy.orm import object_session

    s = object_session(target)
    if s is not None:
        _register_dirty(s, _affected_accounts(target))


@listens_for(Transaction, "after_update")
def _tx_after_update(mapper, connection, target):
    from sqlalchemy import inspect as sa_inspect
    from sqlalchemy.orm import object_session

    dirty = set(_affected_accounts(target))
    state = sa_inspect(target)
    for attr in ("account_id", "target_account_id"):
        h = state.attrs[attr].history
        if h.has_changes():
            dirty.update(v for v in list(h.deleted) + list(h.added) if v is not None)
    s = object_session(target)
    if s is not None:
        _register_dirty(s, dirty)


async def apply_pending_balance_recalc(session) -> None:
    """Пересчёт «грязных» счетов. Вызывается из FamilySession.commit()."""
    dirty = getattr(session, "_dirty_accounts", None) or set()
    # подстраховка: забираем накопленное в sync-сессии (см. _register_dirty)
    inner = getattr(session, "_session", None)
    if inner is not None:
        extra = getattr(inner, "_dirty_accounts", None)
        if extra:
            dirty = set(dirty) | set(extra)
            inner._dirty_accounts = set()  # type: ignore[attr-defined]
    if not dirty:
        return
    for acc_id in sorted(dirty, key=str):
        await recalc_account_balance(session, acc_id)
    session._dirty_accounts = set()  # type: ignore[attr-defined]

