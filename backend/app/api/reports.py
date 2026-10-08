"""Отчёты и аналитика (ТЗ 7.6): summary, by-category, by-month, cashflow, budgets-статус."""
from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import CurrentUser, DbDep, get_current_user
from app.services import reports

router = APIRouter()  # только GET — CSRF не требуется
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


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
) -> dict:
    dt_from, dt_to = reports.period_bounds(date_from, date_to)
    # фронт передаёт параметр `type` вместо `kind` — поддерживаем оба
    kind = kind or type_
    items = await reports.by_category(db, current.family_id, dt_from, dt_to, kind=kind, limit=limit)
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
