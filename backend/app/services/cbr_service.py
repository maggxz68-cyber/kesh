"""Сервис получения курсов валют с ЦБ РФ.

Использует официальный XML API: http://www.cbr.ru/scripts/XML_daily.asp
Ответ содержит курсы валют относительно рубля за указанную дату.
"""
from __future__ import annotations

import asyncio
import logging
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Официальный endpoint ЦБ РФ (возвращает XML со всеми курсами)
CBR_XML_URL = "http://www.cbr.ru/scripts/XML_daily.asp"

# Номиналы некоторых валют (ЦБ дает курс за несколько единиц)
# Например, курс USD обычно за 1 доллар, а курс KZT — за 100 тенге
# В XML ЦБ это поле Nominal


async def fetch_cbr_rates_xml(target_date: Optional[date] = None) -> dict:
    """
    Загружает XML с курсами ЦБ РФ за указанную дату.
    Возвращает словарь вида: { 'USD': {'nominal': 1, 'value': 92.5, 'name': 'Доллар США'}, ... }
    """
    params = {}
    if target_date:
        # ЦБ требует формат DD/MM/YYYY
        params["date_req"] = target_date.strftime("%d/%m/%Y")

    timeout = httpx.Timeout(15.0)
    
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(CBR_XML_URL, params=params)
            response.raise_for_status()
    except httpx.HTTPError as e:
        logger.error(f"CBR: ошибка HTTP при загрузке курсов: {e}")
        raise RuntimeError(f"Не удалось загрузить курсы с ЦБ РФ: {e}")

    return _parse_cbr_xml(response.text)


def _parse_cbr_xml(xml_text: str) -> dict:
    """Парсит XML ответ ЦБ РФ."""
    root = ET.fromstring(xml_text)
    
    # Дата курса из атрибута корня
    xml_date_str = root.get("Date")  # формат: DD.MM.YYYY
    
    rates = {}
    for valute in root.findall("Valute"):
        char_code = valute.findtext("CharCode")  # USD, EUR, etc.
        name = valute.findtext("Name")
        nominal_str = valute.findtext("Nominal", "1").replace(",", ".")
        value_str = valute.findtext("Value", "0").replace(",", ".")
        
        try:
            nominal = Decimal(nominal_str)
            value = Decimal(value_str)
            # Нормализуем к курсу за 1 единицу валюты
            rate_per_unit = (value / nominal).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        except Exception as e:
            logger.warning(f"CBR: не удалось распарсить курс для {char_code}: {e}")
            continue
        
        rates[char_code] = {
            "name": name.strip(),
            "nominal": int(nominal),
            "rate": rate_per_unit,  # сколько рублей за 1 единицу валюты
        }
    
    logger.info(f"CBR: получено курсов: {len(rates)}")
    return rates


async def get_cbr_rate_for_date(target_date: date) -> dict:
    """Получить курсы ЦБ за конкретную дату. Если дата в будущем/выходной — берем ближайшую рабочую."""
    return await fetch_cbr_rates_xml(target_date)


async def get_latest_cbr_rates() -> dict:
    """Получить актуальные курсы ЦБ (за сегодня или последний рабочий день)."""
    today = date.today()
    # Пробуем сегодня, если не получится — вчера, позавчера (на случай выходных)
    for delta in range(0, 5):
        try_date = today - timedelta(days=delta)
        try:
            rates = await fetch_cbr_rates_xml(try_date)
            if rates:
                logger.info(f"CBR: актуальные курсы за {try_date.isoformat()}")
                return rates
        except RuntimeError:
            continue
    raise RuntimeError("Не удалось получить курсы ЦБ РФ за последние 5 дней")
