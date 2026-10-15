"""API endpoints для управления валютами и курсами."""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import DbDep, get_current_user
from app.models.currency import Currency, ExchangeRate
from app.services import currency_service

router = APIRouter(tags=["Валюты и курсы"])


# --- Schemas ---
class CurrencyOut(BaseModel):
    code: str
    name: str
    symbol: Optional[str] = None
    is_active: bool
    sort_order: int

    class Config:
        from_attributes = True


class RateOut(BaseModel):
    currency: str
    rate: float
    date: str


class RateHistoryItem(BaseModel):
    date: str
    rate: float


class RefreshRatesResponse(BaseModel):
    date: str
    rates_count: int
    currencies_count: int
    errors: list[str]


# --- Endpoints ---
@router.get("", response_model=list[CurrencyOut])
async def list_currencies(db: DbDep):
    """Получить список всех активных валют."""
    currencies = await currency_service.get_all_currencies(db)
    return currencies


@router.get("/rates", response_model=list[RateOut])
async def get_current_rates(
    db: DbDep,
    base: str = Query("RUB", description="Базовая валюта"),
):
    """Получить актуальные курсы на сегодня (или последний доступный день)."""
    rates = await currency_service.get_current_rates(db, base_currency=base)
    if not rates:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Курсы ещё не загружены. Нажмите 'Обновить курсы'."
        )
    return rates


@router.get("/rates/history", response_model=list[RateHistoryItem])
async def get_rate_history(
    db: DbDep,
    from_currency: str = Query("USD"),
    to_currency: str = Query("RUB"),
    days: int = Query(30, ge=1, le=365),
):
    """Получить историю курса за последние N дней."""
    return await currency_service.get_rate_history(
        db, from_currency, to_currency, days
    )


@router.post("/rates/refresh", response_model=RefreshRatesResponse)
async def refresh_rates(db: DbDep, target_date: Optional[date] = None):
    """
    Обновить курсы валют из ЦБ РФ.
    Если target_date не указан — загружаются курсы за сегодня/последний рабочий день.
    """
    try:
        result = await currency_service.refresh_rates_from_cbr(db, target_date)
        return result
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e),
        )
