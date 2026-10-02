"""Реестр моделей SQLAlchemy + общие утилиты БД."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import DeclarativeBase


def utcnow() -> datetime:
    """Текущее время в UTC (aware). Python-side default для DateTime(timezone=True).

    Используется вместо SQL- literal 'now()', который не работает на SQLite
    (разработка/тесты без Docker). На PostgreSQL колонки с server_default=func.now()
    эквивалентны.
    """
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass
