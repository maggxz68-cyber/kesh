"""Бюджеты (ТЗ 7.5): CRUD + план/факт с прогрессом и флагом превышения."""
from __future__ import annotations

import calendar
import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbDep, csrf_guard, get_current_user, parse_uuid
from app.models.enums import BudgetPeriod, TransactionType
from app.models.reference import Category
from app.models.transaction import Budget, Transaction
from app.schemas.reports import BudgetCreate, BudgetOut, BudgetUpdate

router = APIRouter(dependencies=[Depends(csrf_guard)])
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]

ZERO = Decimal("0")


def _period_bounds(period: BudgetPeriod, start: date) -> tuple[date, date]:
    """Нормализация начала периода и вычисление конца."""
    if period == BudgetPeriod.WEEKLY:
        p_start = start - timedelta(days=start.weekday())
        p_end = p_start + timedelta(days=6)
    elif period == BudgetPeriod.MONTHLY:
        p_start = start.replace(day=1)
        p_end = p_start.replace(day=calendar.monthrange(p_start.year, p_start.month)[1])
    else:  # yearly
        p_start = start.replace(month=1, day=1)
        p_end = p_start.replace(month=12, day=31)
    return p_start, p_end


async def _spent(db: DbDep, family_id: uuid.UUID, b: Budget) -> Decimal:
    val = (
        await db.execute(
            select(func.coalesce(func.sum(Transaction.amount), ZERO)).where(
                Transaction.family_id == family_id,
                Transaction.deleted_at.is_(None),
                Transaction.type == TransactionType.EXPENSE,
                Transaction.category_id == b.category_id,
                Transaction.occurred_at >= datetime.combine(b.period_start, time.min, tzinfo=timezone.utc),
                Transaction.occurred_at <= datetime.combine(b.period_end, time.max, tzinfo=timezone.utc),
            )
        )
    ).scalar_one()
    return Decimal(str(val))


async def _to_out(db: DbDep, b: Budget) -> BudgetOut:
    spent = await _spent(db, b.family_id, b)
    return BudgetOut(
        id=b.id,
        category=None if b.category is None else _cat_out(b.category),
        period=b.period,
        limit_amount=b.limit_amount,
        period_start=b.period_start,
        period_end=b.period_end,
        notify_on_overrun=b.notify_on_overrun,
        spent=spent,
        over_limit=bool(b.limit_amount > 0 and spent > b.limit_amount),
    )


def _cat_out(c: Category) -> dict:
    return {"id": c.id, "name": c.name, "kind": c.kind, "color": c.color, "icon": c.icon,
            "parent_id": c.parent_id, "is_system": c.is_system}


@router.get("", response_model=list[BudgetOut])
async def list_budgets(
    db: DbDep, current: CurrentUserDep, active_only: bool = False
) -> list[BudgetOut]:
    stmt = (
        select(Budget)
        .where(Budget.family_id == current.family_id, Budget.deleted_at.is_(None))
        .order_by(Budget.period_start.desc(), Budget.limit_amount.desc())
    )
    if active_only:
        today = date.today()
        stmt = stmt.where(Budget.period_start <= today, Budget.period_end >= today)
    budgets = list((await db.execute(stmt)).scalars().all())
    return [await _to_out(db, b) for b in budgets]


@router.post("", response_model=BudgetOut, status_code=status.HTTP_201_CREATED)
async def create_budget(body: BudgetCreate, db: DbDep, current: CurrentUserDep) -> BudgetOut:
    cat = (
        await db.execute(select(Category).where(Category.id == body.category_id))
    ).scalar_one_or_none()
    if cat is None or (cat.family_id != current.family_id and not cat.is_system):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Категория не найдена")
    start = body.period_start or date.today()
    p_start, p_end = _period_bounds(body.period, start)
    dup = (
        await db.execute(
            select(Budget.id).where(
                Budget.family_id == current.family_id,
                Budget.category_id == body.category_id,
                Budget.period == body.period,
                Budget.period_start == p_start,
                Budget.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if dup:
        raise HTTPException(status.HTTP_409_CONFLICT, "Бюджет по этой категории на период уже существует")
    b = Budget(
        family_id=current.family_id,
        category_id=body.category_id,
        period=body.period,
        limit_amount=body.limit_amount,
        period_start=p_start,
        period_end=p_end,
        notify_on_overrun=body.notify_on_overrun,
    )
    db.add(b)
    await db.flush()
    return await _to_out(db, b)


@router.patch("/{budget_id}", response_model=BudgetOut)
async def update_budget(budget_id: str, body: BudgetUpdate, db: DbDep, current: CurrentUserDep) -> BudgetOut:
    b = (
        await db.execute(
            select(Budget).where(
                Budget.id == parse_uuid(budget_id),
                Budget.family_id == current.family_id,
                Budget.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Бюджет не найден")
    data = body.model_dump(exclude_unset=True)
    if "period_start" in data and data["period_start"]:
        b.period_start, b.period_end = _period_bounds(b.period, data["period_start"])
        data.pop("period_start")
    for k, v in data.items():
        setattr(b, k, v)
    await db.flush()
    return await _to_out(db, b)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_budget(budget_id: str, db: DbDep, current: CurrentUserDep) -> None:
    b = (
        await db.execute(
            select(Budget).where(
                Budget.id == parse_uuid(budget_id),
                Budget.family_id == current.family_id,
                Budget.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Бюджет не найден")
    b.deleted_at = datetime.now(timezone.utc)
    await db.flush()
