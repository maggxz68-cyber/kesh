"""Сервис управления валютами и курсами обмена."""
from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.currency import Currency, ExchangeRate
from app.services.cbr_service import get_latest_cbr_rates, get_cbr_rate_for_date

logger = logging.getLogger(__name__)

DEFAULT_CURRENCIES = [
    {"code": "RUB", "name": "Российский рубль", "symbol": "₽", "sort_order": 1},
    {"code": "USD", "name": "Доллар США", "symbol": "$", "sort_order": 2},
    {"code": "EUR", "name": "Евро", "symbol": "€", "sort_order": 3},
    {"code": "CNY", "name": "Китайский юань", "symbol": "¥", "sort_order": 4},
    {"code": "GBP", "name": "Фунт стерлингов", "symbol": "£", "sort_order": 5},
    {"code": "KZT", "name": "Казахский тенге", "symbol": "₸", "sort_order": 6},
    {"code": "TRY", "name": "Турецкая лира", "symbol": "₺", "sort_order": 7},
    {"code": "JPY", "name": "Японская иена", "symbol": "¥", "sort_order": 8},
]


async def _ensure_currency(session: AsyncSession, code: str, name: str) -> None:
    """Гарантирует наличие валюты в справочнике (создает, если нет)."""
    currency = await session.get(Currency, code)
    if not currency:
        currency = Currency(code=code, name=name, is_active=True, sort_order=99)
        session.add(currency)
        await session.flush()  # Сразу фиксируем, чтобы сработал Foreign Key


async def ensure_default_currencies(session: AsyncSession) -> list[Currency]:
    """Гарантирует наличие базовых валют в справочнике."""
    currencies = []
    for data in DEFAULT_CURRENCIES:
        await _ensure_currency(session, data["code"], data["name"])
        currency = await session.get(Currency, data["code"])
        currencies.append(currency)
    return currencies


async def get_all_currencies(session: AsyncSession) -> list[Currency]:
    """Получить все активные валюты."""
    result = await session.execute(
        select(Currency).where(Currency.is_active.is_(True)).order_by(Currency.sort_order, Currency.code)
    )
    return list(result.scalars().all())


async def refresh_rates_from_cbr(session: AsyncSession, target_date: Optional[date] = None) -> dict:
    """Обновить курсы валют из ЦБ РФ."""
    await ensure_default_currencies(session)
    
    if target_date:
        cbr_rates = await get_cbr_rate_for_date(target_date)
    else:
        cbr_rates = await get_latest_cbr_rates()
    
    target_date = target_date or date.today()
    saved_count = 0
    errors = []
    
    for char_code, data in cbr_rates.items():
        if char_code == "RUB":
            continue
        
        rate_per_unit = data["rate"]
        
        # ВАЖНО: Динамически создаем валюту, если ЦБ прислал новую, 
        # чтобы избежать ошибки ForeignKeyViolation
        await _ensure_currency(session, char_code, data.get("name", char_code))
        await _ensure_currency(session, "RUB", "Российский рубль")
        
        # XXX -> RUB (прямой курс)
        await _save_rate(session, char_code, "RUB", rate_per_unit, target_date, "CBR")
        saved_count += 1
        
        # RUB -> XXX (обратный курс)
        if rate_per_unit > 0:
            reverse_rate = (Decimal("1") / rate_per_unit).quantize(
                Decimal("0.0001"), rounding="ROUND_HALF_UP"
            )
            await _save_rate(session, "RUB", char_code, reverse_rate, target_date, "CBR")
            saved_count += 1
    
    await session.commit()
    
    result = {
        "date": target_date.isoformat(),
        "rates_count": saved_count,
        "currencies_count": len(cbr_rates),
        "errors": errors,
    }
    logger.info(f"Курсы обновлены: {result}")
    return result


async def _save_rate(
    session: AsyncSession,
    from_code: str,
    to_code: str,
    rate: Decimal,
    rate_date: date,
    source: str,
) -> None:
    """Сохранить или обновить курс (upsert)."""
    existing = await session.execute(
        select(ExchangeRate).where(
            ExchangeRate.from_currency_code == from_code,
            ExchangeRate.to_currency_code == to_code,
            ExchangeRate.date == rate_date,
        )
    )
    rate_obj = existing.scalar_one_or_none()
    
    if rate_obj:
        rate_obj.rate = rate
        rate_obj.source = source
    else:
        rate_obj = ExchangeRate(
            from_currency_code=from_code,
            to_currency_code=to_code,
            rate=rate,
            date=rate_date,
            source=source,
        )
        session.add(rate_obj)


async def get_current_rates(session: AsyncSession, base_currency: str = "RUB") -> list[dict]:
    """Получить актуальные курсы на сегодня (или последний доступный день)."""
    last_date_result = await session.execute(
        select(func.max(ExchangeRate.date)).where(
            ExchangeRate.from_currency_code == base_currency
        )
    )
    last_date = last_date_result.scalar()
    
    if not last_date:
        return []
    
    result = await session.execute(
        select(ExchangeRate).where(
            ExchangeRate.from_currency_code == base_currency,
            ExchangeRate.date == last_date,
        ).order_by(ExchangeRate.to_currency_code)
    )
    rates = result.scalars().all()
    
    return [
        {
            "currency": r.to_currency_code,
            "rate": float(r.rate),
            "date": r.date.isoformat(),
        }
        for r in rates
    ]


async def get_rate_history(
    session: AsyncSession,
    from_code: str,
    to_code: str,
    days: int = 30,
) -> list[dict]:
    """Получить историю курса за последние N дней."""
    result = await session.execute(
        select(ExchangeRate).where(
            ExchangeRate.from_currency_code == from_code,
            ExchangeRate.to_currency_code == to_code,
        ).order_by(ExchangeRate.date.desc()).limit(days)
    )
    rates = result.scalars().all()
    return [
        {
            "date": r.date.isoformat(),
            "rate": float(r.rate),
        }
        for r in reversed(rates)
    ]
