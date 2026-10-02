"""Общий fixture: приложение + чистая SQLite-БД на каждый тестовый модуль."""
from __future__ import annotations

import os

import pytest

DB_FILE = "test_app.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{DB_FILE}"


@pytest.fixture(autouse=True)
def _clean_db():
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)
    from app.db.base import Base
    from app.db.session import SessionLocal, engine
    import asyncio

    async def _create():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

    asyncio.get_event_loop_policy().new_event_loop().run_until_complete(_create())
    yield
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)
