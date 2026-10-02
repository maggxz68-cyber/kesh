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
    return await reports.summary(db, current.family_id, dt_from, dt_to)


@router.get("/by-category")
async def by_category(
    db: DbDep,
    current: CurrentUserDep,
    date_from: date | None = None,
    date_to: date | None = None,
    kind: str | None = Query(None, pattern="^(income|expense)$"),
    limit: int = Query(20, ge=1, le=100),
) -> list[dict]:
    dt_from, dt_to = reports.period_bounds(date_from, date_to)
    return await reports.by_category(db, current.family_id, dt_from, dt_to, kind=kind, limit=limit)


@router.get("/by-month")
async def by_month(db: DbDep, current: CurrentUserDep, months: int = Query(12, ge=1, le=36)) -> list[dict]:
    return await reports.by_month(db, current.family_id, months=months)


@router.get("/cashflow")
async def cashflow(
    db: DbDep,
    current: CurrentUserDep,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict]:
    dt_from, dt_to = reports.period_bounds(date_from, date_to)
    return await reports.cashflow(db, current.family_id, dt_from, dt_to)


@router.get("/by-member")
async def by_member(
    db: DbDep, current: CurrentUserDep, date_from: date | None = None, date_to: date | None = None
) -> list[dict]:
    dt_from, dt_to = reports.period_bounds(date_from, date_to)
    return await reports.by_member(db, current.family_id, dt_from, dt_to)


@router.get("/budgets")
async def budgets_status(db: DbDep, current: CurrentUserDep) -> list[dict]:
    """План/факт по всем бюджетам (для прогресс-баров на странице бюджетов)."""
    return await reports.budgets_status(db, current.family_id)
