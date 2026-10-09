"""Отчёты и аналитика (ТЗ 7.6): summary, by-category, by-month, cashflow, budgets-статус,
period, by-account, transactions (детальный), receipts."""
from __future__ import annotations

import uuid as uuid_mod
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import CurrentUser, DbDep, get_current_user
from app.services import reports

router = APIRouter()  # только GET — CSRF не требуется
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


def _parse_uuid(value: str | None) -> uuid_mod.UUID | None:
    if not value:
        return None
    try:
        return uuid_mod.UUID(value)
    except ValueError:
        return None


@router.get("/summary")
async def summary(
    db: DbDep,
    current: CurrentUserDep,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    dt_from, dt_to = reports.period_bounds(date_from, date_to)
    s = await reports.summary(db, current.family_id, dt_from, dt_to)
    # фронт ожидает поле `balance` (общий баланс счетов) — алиас к balance_total
    return {**s, "balance": s.get("balance_total", 0)}


@router.get("/by-category")
async def by_category(
    db: DbDep,
    current: CurrentUserDep,
    date_from: date | None = None,
    date_to: date | None = None,
    kind: str | None = Query(None, pattern="^(income|expense)$"),
    type_: str | None = Query(None, alias="type", pattern="^(income|expense)$"),
    limit: int = Query(20, ge=1, le=100),
    top_n: int | None = Query(None, ge=1, le=100, description="Alias для limit (ТЗ: top_n)"),
) -> dict:
    dt_from, dt_to = reports.period_bounds(date_from, date_to)
    # фронт передаёт параметр `type` вместо `kind` — поддерживаем оба
    kind = kind or type_
    items = await reports.by_category(db, current.family_id, dt_from, dt_to, kind=kind, limit=top_n or limit)
    return {"items": items}


@router.get("/by-month")
async def by_month(db: DbDep, current: CurrentUserDep, months: int = Query(12, ge=1, le=36)) -> dict:
    items = await reports.by_month(db, current.family_id, months=months)
    return {"items": items}


@router.get("/cashflow")
async def cashflow(
    db: DbDep,
    current: CurrentUserDep,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    dt_from, dt_to = reports.period_bounds(date_from, date_to)
    rows = await reports.cashflow(db, current.family_id, dt_from, dt_to)
    # фронт ожидает поле `date` (ISO) — добавляем алиас к `day`
    items = [{**r, "date": r["day"]} for r in rows]
    return {"items": items}


@router.get("/by-member")
async def by_member(
    db: DbDep, current: CurrentUserDep, date_from: date | None = None, date_to: date | None = None
) -> dict:
    dt_from, dt_to = reports.period_bounds(date_from, date_to)
    rows = await reports.by_member(db, current.family_id, dt_from, dt_to)
    # фронт ожидает `user_name` — алиас к `name`
    items = [{**r, "user_name": r["name"]} for r in rows]
    return {"items": items}


# Алиас для совместимости с фронтендом (он запрашивает /reports/by-user)
@router.get("/by-user")
async def by_user(
    db: DbDep, current: CurrentUserDep, date_from: date | None = None, date_to: date | None = None
) -> dict:
    return await by_member(db, current, date_from, date_to)


@router.get("/budgets")
async def budgets_status(db: DbDep, current: CurrentUserDep) -> list[dict]:
    """План/факт по всем бюджетам (для прогресс-баров на странице бюджетов)."""
    return await reports.budgets_status(db, current.family_id)


@router.get("/period")
async def period(
    db: DbDep,
    current: CurrentUserDep,
    date_from: date | None = None,
    date_to: date | None = None,
    type_: str | None = Query(None, alias="type", pattern="^(income|expense|transfer)$"),
    account_id: str | None = None,
    category_id: str | None = None,
    group_by: str = Query("day", pattern="^(day|week|month|category|account)$"),
) -> dict:
    """Отчёт за произвольный период с группировкой day/week/month/category/account."""
    dt_from, dt_to = reports.period_bounds(date_from, date_to)
    return await reports.period_report(
        db,
        current.family_id,
        dt_from,
        dt_to,
        tx_type=type_,
        account_id=_parse_uuid(account_id),
        category_id=_parse_uuid(category_id),
        group_by=group_by,
    )


@router.get("/by-account")
async def by_account(
    db: DbDep,
    current: CurrentUserDep,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """Движение по счетам: начальный остаток, приход, расход, конечный остаток."""
    dt_from, dt_to = reports.period_bounds(date_from, date_to)
    items = await reports.by_account(db, current.family_id, dt_from, dt_to)
    return {"items": items}


@router.get("/transactions")
async def transactions_detail(
    db: DbDep,
    current: CurrentUserDep,
    date_from: date | None = None,
    date_to: date | None = None,
    account_id: str | None = None,
    category_id: str | None = None,
    type_: str | None = Query(None, alias="type", pattern="^(income|expense|transfer)$"),
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> dict:
    """Детальный список транзакций за период с фильтрами и пагинацией."""
    dt_from, dt_to = reports.period_bounds(date_from, date_to)
    return await reports.transactions_detail(
        db,
        current.family_id,
        dt_from,
        dt_to,
        account_id=_parse_uuid(account_id),
        category_id=_parse_uuid(category_id),
        tx_type=type_,
        search=search,
        skip=skip,
        limit=limit,
    )


@router.get("/receipts")
async def receipts_stats(
    db: DbDep,
    current: CurrentUserDep,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """Статистика по чекам: количество, средняя сумма, топ магазинов."""
    dt_from, dt_to = reports.period_bounds(date_from, date_to)
    return await reports.receipts_report(db, current.family_id, dt_from, dt_to)
