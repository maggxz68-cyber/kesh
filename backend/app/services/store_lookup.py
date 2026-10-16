"""Сервис для определения названия магазина по ИНН с кешированием."""
import logging
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.store_cache import StoreCache

logger = logging.getLogger(__name__)

# Словарь популярных сетей (работает мгновенно, не тратит лимиты DaData)
POPULAR_CHAINS = {
    "7719723690": "Бургер Кинг",
    "7825706086": "Пятёрочка",
    "7725069621": "Магнит",
    "7706072942": "Перекрёсток",
    "7707083893": "Лента",
    "7713069690": "Ашан",
    "7707049388": "ВкусВилл",
    "7728168971": "Дикси",
}

async def get_store_name_by_inn(db: AsyncSession, inn: str) -> Optional[str]:
    if not inn:
        return None
    inn = inn.strip()
    
    # 1. Проверяем словарь популярных сетей
    if inn in POPULAR_CHAINS:
        logger.info(f"Магазин определён по ИНН {inn}: {POPULAR_CHAINS[inn]} (из словаря)")
        return POPULAR_CHAINS[inn]
    
    # 2. Проверяем кеш в БД
    try:
        result = await db.execute(select(StoreCache).where(StoreCache.inn == inn))
        cached = result.scalar_one_or_none()
        if cached:
            logger.info(f"Магазин определён по ИНН {inn}: {cached.store_name} (из кеша БД)")
            return cached.store_name
    except Exception as e:
        logger.warning(f"Ошибка чтения кеша БД: {e}")
    
    # 3. Запрос к DaData API
    try:
        from app.services.dadata_service import lookup_organization_by_inn
        org_data = await lookup_organization_by_inn(inn)
        if org_data:
            store_name = org_data.get("short_name") or org_data.get("name", "")
            # Сохраняем в кеш БД, чтобы не запрашивать DaData повторно
            try:
                db.add(StoreCache(
                    inn=inn, 
                    store_name=store_name, 
                    short_name=org_data.get("short_name"), 
                    address=org_data.get("address"),
                    source="dadata"
                ))
                await db.flush()
                logger.info(f"✅ Магазин определён по ИНН {inn}: {store_name} (из DaData, сохранено в кеш)")
            except Exception as e:
                logger.warning(f"Не удалось сохранить в кеш БД: {e}")
            
            return store_name
    except Exception as e:
        logger.warning(f"Ошибка DaData: {e}")
    
    return None
