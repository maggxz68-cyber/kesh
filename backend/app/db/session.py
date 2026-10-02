"""Фабрика асинхронной сессии + автопересчёт балансов счетов перед коммитом."""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.transaction import apply_pending_balance_recalc

engine = create_async_engine(settings.database_url, pool_pre_ping=True, echo=False)


class FamilySession(AsyncSession):
    """AsyncSession, которая перед коммитом пересчитывает балансы затронутых счетов.

    Порядок: flush() (проводки уходят в БД-транзакцию) -> apply_pending_balance_recalc()
    (SELECT по свежим проводкам + UPDATE балансов через Core) -> commit().
    «Грязные» счета накапливает ORM-хук after_insert/after_update на Transaction
    (app/models/transaction.py).
    """

    async def commit(self) -> None:
        await self.flush()
        await apply_pending_balance_recalc(self)
        await super().commit()


SessionLocal = async_sessionmaker(engine, class_=FamilySession, expire_on_commit=False)


async def get_db() -> Any:
    """FastAPI-зависимость: сессия на запрос (commit/rollback по умолчанию)."""
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
