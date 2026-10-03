"""CRUD счетов (ТЗ 7.1, 9). Изоляция по family_id на уровне запросов."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbDep, csrf_guard, get_current_user, parse_uuid
from app.models.reference import Account
from app.models.transaction import Transaction
from app.schemas.accounts import AccountCreate, AccountOut, AccountUpdate, CompatAccountCreate
from app.services.balances import mark_accounts_dirty

router = APIRouter(dependencies=[Depends(csrf_guard)])
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


async def _get_account(db: DbDep, current: CurrentUser, account_id: uuid.UUID) -> Account:
    acc = (await db.execute(select(Account).where(Account.id == account_id))).scalar_one_or_none()
    if acc is None or acc.family_id != current.family_id or acc.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Счёт не найден")
    return acc


@router.get("", response_model=list[AccountOut])
async def list_accounts(
    db: DbDep, current: CurrentUserDep, include_archived: bool = False
) -> list[Account]:
    stmt = select(Account).where(Account.family_id == current.family_id, Account.deleted_at.is_(None))
    if not include_archived:
        stmt = stmt.where(Account.is_archived.is_(False))
    stmt = stmt.order_by(Account.sort_order, Account.name)
    return list((await db.execute(stmt)).scalars().all())


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
async def create_account(body: CompatAccountCreate, db: DbDep, current: CurrentUserDep) -> Account:
    acc = Account(
        family_id=current.family_id,
        name=body.name.strip(),
        type=body.type,
        currency=body.currency.upper(),
        opening_balance=body.opening_balance,
        balance=body.opening_balance,
        icon=body.icon,
        color=body.color,
    )
    db.add(acc)
    await db.flush()
    return acc


@router.patch("/{account_id}", response_model=AccountOut)
async def update_account(account_id: str, body: AccountUpdate, db: DbDep, current: CurrentUserDep) -> Account:
    acc = await _get_account(db, current, parse_uuid(account_id))
    data = body.model_dump(exclude_unset=True)
    opening_changed = "opening_balance" in data and data["opening_balance"] != acc.opening_balance
    for k, v in data.items():
        setattr(acc, k, v)
    if opening_changed:
        # баланс = opening + проводки; пересчёт по mark_accounts_dirty на commit()
        mark_accounts_dirty(db, [acc.id])
    await db.flush()
    return acc


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_account(account_id: str, db: DbDep, current: CurrentUserDep) -> None:
    acc = await _get_account(db, current, parse_uuid(account_id))
    tx_count = (
        await db.execute(
            select(func.count(Transaction.id)).where(
                Transaction.deleted_at.is_(None),
                (Transaction.account_id == acc.id) | (Transaction.target_account_id == acc.id),
            )
        )
    ).scalar_one()
    if tx_count:
        acc.is_archived = True  # есть история — только в архив (ТЗ 7.1)
    else:
        acc.deleted_at = datetime.now(timezone.utc)
    await db.flush()
