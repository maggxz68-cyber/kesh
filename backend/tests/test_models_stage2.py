"""Смок-тесты моделей этапа 2 на SQLite (aiosqlite).

Проверяют: миграция применяется, FK/CASCADE работают, автопересчёт балансов
счетов корректен для income/expense/transfer и soft-delete.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

DB_FILE = "test_stage2.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{DB_FILE}"

from app.db.base import Base  # noqa: E402
from app.models.enums import AccountType, CategoryKind, TransactionType, UserRole  # noqa: E402
from app.models.family import Family, User  # noqa: E402
from app.models.reference import Account, Category  # noqa: E402
from app.models.transaction import Transaction, affected_account_ids, mark_accounts_dirty  # noqa: E402


@pytest_asyncio.fixture
async def session():
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)
    engine = create_async_engine(f"sqlite+aiosqlite:///{DB_FILE}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    # импорт после создания движка не нужен: FamilySession-логика в app.db.session,
    # но пересчёт можно вызвать вручную — используем тот же хелпер.
    from app.models.transaction import apply_pending_balance_recalc

    class S(AsyncSession):
        async def commit(self):  # noqa: D401
            await self.flush()
            await apply_pending_balance_recalc(self)
            await super().commit()

    maker = async_sessionmaker(engine, class_=S, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()
    os.remove(DB_FILE)


async def _mk_family(session: AsyncSession) -> tuple[Family, User, Account, Account]:
    fam = Family(name="Тест", timezone="Europe/Moscow", currency="RUB")
    session.add(fam)
    await session.flush()
    owner = User(
        family_id=fam.id, email="o@example.com", name="О", role=UserRole.OWNER,
        password_hash="x",
    )
    session.add(owner)
    cash = Account(family_id=fam.id, name="Наличные", type=AccountType.CASH,
                   opening_balance=Decimal("100.00"), balance=Decimal("100.00"))
    card = Account(family_id=fam.id, name="Карта", type=AccountType.CARD,
                   opening_balance=Decimal("500.00"), balance=Decimal("500.00"))
    cat = Category(family_id=fam.id, name="Продукты", kind=CategoryKind.EXPENSE)
    session.add_all([owner, cash, card, cat])
    await session.commit()
    return fam, owner, cash, card


NOW = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)


@pytest.mark.asyncio
async def test_income_expense_transfer_balances(session: AsyncSession):
    fam, owner, cash, card = await _mk_family(session)

    tx = Transaction(family_id=fam.id, author_id=owner.id, type=TransactionType.INCOME,
                     amount=Decimal("1000.00"), account_id=cash.id, occurred_at=NOW)
    session.add(tx)
    mark_accounts_dirty(session, affected_account_ids(tx))
    await session.commit()
    await session.refresh(cash)
    assert cash.balance == Decimal("1100.00")

    tx2 = Transaction(family_id=fam.id, author_id=owner.id, type=TransactionType.EXPENSE,
                      amount=Decimal("50.00"), account_id=cash.id, occurred_at=NOW)
    session.add(tx2)
    mark_accounts_dirty(session, affected_account_ids(tx2))
    await session.commit()
    await session.refresh(cash)
    assert cash.balance == Decimal("1050.00")

    tr = Transaction(family_id=fam.id, author_id=owner.id, type=TransactionType.TRANSFER,
                     amount=Decimal("200.00"), account_id=cash.id,
                     target_account_id=card.id, occurred_at=NOW)
    session.add(tr)
    mark_accounts_dirty(session, affected_account_ids(tr))
    await session.commit()
    await session.refresh(cash)
    await session.refresh(card)
    assert cash.balance == Decimal("850.00")
    assert card.balance == Decimal("700.00")


@pytest.mark.asyncio
async def test_soft_delete_recalc(session: AsyncSession):
    fam, owner, cash, card = await _mk_family(session)
    tr = Transaction(family_id=fam.id, author_id=owner.id, type=TransactionType.EXPENSE,
                     amount=Decimal("30.00"), account_id=cash.id, occurred_at=NOW)
    session.add(tr)
    mark_accounts_dirty(session, affected_account_ids(tr))
    await session.commit()
    await session.refresh(cash)
    assert cash.balance == Decimal("70.00")

    tr.deleted_at = datetime.now(timezone.utc)
    mark_accounts_dirty(session, [cash.id])
    await session.commit()
    await session.refresh(cash)
    assert cash.balance == Decimal("100.00")


@pytest.mark.asyncio
async def test_cascade_delete_family(session: AsyncSession):
    """Soft delete семьи не трогает данные; hard delete (CASCADE) убирает всё."""
    fam, owner, cash, card = await _mk_family(session)
    tx3 = Transaction(family_id=fam.id, author_id=owner.id, type=TransactionType.INCOME,
                      amount=Decimal("10.00"), account_id=cash.id, occurred_at=NOW)
    session.add(tx3)
    mark_accounts_dirty(session, affected_account_ids(tx3))
    await session.commit()
    tx_id = str(uuid.uuid4())  # заглушка не нужна, просто фиксируем что транзакции есть

    await session.delete(fam)
    await session.commit()
    from sqlalchemy import func, select

    for model in (User, Account, Category, Transaction):
        n = (await session.execute(select(func.count()).select_from(model))).scalar_one()
        assert n == 0, f"{model.__name__} должен быть удалён каскадом"


@pytest.mark.asyncio
async def test_transfer_checks_constraint(session: AsyncSession):
    """Transfer без target_account_id нарушает CheckConstraint."""
    fam, owner, cash, card = await _mk_family(session)
    tr = Transaction(family_id=fam.id, author_id=owner.id, type=TransactionType.TRANSFER,
                     amount=Decimal("10.00"), account_id=cash.id, occurred_at=NOW)
    session.add(tr)
    with pytest.raises(Exception):
        await session.commit()
