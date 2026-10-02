"""Тесты seed (этап 6): идемпотентность, супер-админ, демо-семья, песочница."""
from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app.core.security import verify_password
from app.models.family import Family, SuperAdmin, User
from app.models.reference import Account, Category, Tag
from app.models.receipt import Receipt
from app.models.transaction import Budget, Transaction
from app.services.auth_service import create_demo_sandbox
from app.services.seed import ensure_superadmin, seed_demo_family


@pytest.mark.asyncio
async def test_seed_creates_all(db_session):
    await ensure_superadmin(db_session)
    fam = await seed_demo_family(db_session)
    await db_session.commit()

    sa = (await db_session.execute(select(SuperAdmin).where(SuperAdmin.login == "admin"))).scalar_one()
    assert verify_password("1968", sa.password_hash)

    users = (await db_session.execute(select(func.count(User.id)).where(User.family_id == fam.id))).scalar_one()
    txs = (await db_session.execute(select(func.count(Transaction.id)).where(Transaction.family_id == fam.id))).scalar_one()
    cats = (await db_session.execute(select(func.count(Category.id)).where(Category.family_id == fam.id))).scalar_one()
    tags = (await db_session.execute(select(func.count(Tag.id)).where(Tag.family_id == fam.id))).scalar_one()
    accs = (await db_session.execute(select(func.count(Account.id)).where(Account.family_id == fam.id))).scalar_one()
    budgets = (await db_session.execute(select(func.count(Budget.id)).where(Budget.family_id == fam.id))).scalar_one()
    receipts = (await db_session.execute(select(func.count(Receipt.id)).where(Receipt.family_id == fam.id))).scalar_one()

    assert users == 3 and accs == 4 and cats == 30 and tags == 5
    assert txs >= 150 and budgets == 5 and receipts == 10
    # owner у демо — Иван
    ivan = (await db_session.execute(select(User).where(User.email == "demo@example.com"))).scalar_one()
    assert str(ivan.role) in ("owner", "UserRole.OWNER")
    assert verify_password("demo1234", ivan.password_hash)


@pytest.mark.asyncio
async def test_seed_idempotent(db_session):
    await ensure_superadmin(db_session)
    fam1 = await seed_demo_family(db_session)
    await db_session.commit()
    n1 = (await db_session.execute(select(func.count(Transaction.id)))).scalar_one()
    fam2 = await seed_demo_family(db_session)  # повторный запуск
    await db_session.commit()
    n2 = (await db_session.execute(select(func.count(Transaction.id)))).scalar_one()
    assert fam1.id == fam2.id and n1 == n2
    sas = (await db_session.execute(select(func.count(SuperAdmin.id)))).scalar_one()
    assert sas == 1


@pytest.mark.asyncio
async def test_sandbox_copies_reference_family_not_sandbox(db_session):
    """create_demo_sandbox копирует эталонную демо-семью; sandbox не копирует sandbox."""
    await ensure_superadmin(db_session)
    demo = await seed_demo_family(db_session)
    await db_session.commit()

    sb1, guest1 = await create_demo_sandbox(db_session)
    await db_session.commit()
    assert sb1.is_sandbox is True and sb1.expires_at is not None
    tx_sb = (await db_session.execute(select(func.count(Transaction.id)).where(Transaction.family_id == sb1.id))).scalar_one()
    tx_demo = (await db_session.execute(select(func.count(Transaction.id)).where(Transaction.family_id == demo.id))).scalar_one()
    assert tx_sb == tx_demo > 0  # полная копия данных

    sb2, _ = await create_demo_sandbox(db_session)
    await db_session.commit()
    tx_sb2 = (await db_session.execute(select(func.count(Transaction.id)).where(Transaction.family_id == sb2.id))).scalar_one()
    assert tx_sb2 == tx_demo  # вторая песочница скопировала ЭТАЛОН, а не первую песочницу
    assert sb2.id != sb1.id
