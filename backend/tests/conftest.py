"""Общий fixture: чистая SQLite-БД на каждый тест + db_session / client."""
from __future__ import annotations

import asyncio
import os

import pytest

DB_FILE = os.path.abspath("test_app.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{DB_FILE}"


def _fresh_db() -> None:
    """Пересоздать схему БД (drop_all + create_all)."""
    from app.db.base import Base
    from app.db.session import engine

    async def _create():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_create())
    finally:
        loop.close()


@pytest.fixture(autouse=True)
def _clean_db():
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)
    _fresh_db()
    yield
    # закрываем пул соединений движка и удаляем файл БД (чистый старт следующего теста)
    from app.db.session import engine

    async def _dispose():
        await engine.dispose()

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_dispose())
    finally:
        loop.close()
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)


@pytest.fixture
async def db_session():
    """Async-сессия поверх SQLite для сервисных тестов (seed, auth_service)."""
    from app.db.session import SessionLocal

    async with SessionLocal() as session:
        yield session


@pytest.fixture
async def client():
    """Httpx-клиент с lifespan (тот же движок/БД, что и в тестах)."""
    from contextlib import asynccontextmanager

    from httpx import ASGITransport, AsyncClient

    from app.db.session import engine
    from app.main import app

    @asynccontextmanager
    async def _no_lifespan(_app):  # lifespan уже выполнен setup_logging — безопасно, но пропускаем дубль
        yield

    app.router.lifespan_context = _no_lifespan
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await engine.dispose()
