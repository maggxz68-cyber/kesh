"""Фабрика асинхронной сессии."""
from __future__ import annotations

from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.core.config import settings

# pool_pre_ping=True теперь БЕЗОПАСЕН, так как SlowAPIMiddleware удален.
# Он автоматически отбрасывает поврежденные соединения и создает новые.
engine = create_async_engine(
    settings.database_url, 
    pool_pre_ping=True,  
    pool_size=5,
    max_overflow=10,
    pool_recycle=1800,
    echo=False,
)

SessionLocal = async_sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)

async def get_db() -> Any:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
