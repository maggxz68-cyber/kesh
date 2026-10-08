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


from sqlalchemy.orm import configure_mappers  # noqa: E402


class _SafeLoaderDescriptor:
    """Дескриптор отношения, который при ленивой загрузке вне async-зелена

    (MissingGreenlet) возвращает пустой список/None вместо падения.
    Используется только как аварийный fallback; корректный путь —
    явная загрузка (selectin/joined) или await session.refresh().
    """

    def __init__(self, attr, relationship_key):
        self._attr = attr
        self._key = relationship_key

    def __get__(self, obj, objtype=None):
        if obj is None:
            return self._attr
        try:
            return self._attr.__get__(obj, objtype)
        except Exception as exc:  # MissingGreenlet и прочие IO-ошибки lazy-load
            if type(exc).__name__ in ("MissingGreenlet", "StatementError"):
                inst = obj  # instance-level override
                fallback = [] if getattr(self._attr, "uselist", False) else None
                inst.__dict__[self._key] = fallback
                return fallback
            raise


def install_lazy_load_fallback():
    """Оборачивает все relationship-дескрипторы безопасным fallback'ом.

    Вызывается один раз после импорта всех моделей. Это защищает от
    500-ых ошибок на legacy-путях с ленивой загрузкой в async-контексте.
    """
    configure_mappers()
    for mapper in Base.registry.mappers:
        class_ = mapper.class_
        for key, prop in mapper.relationships.items():
            desc = getattr(class_, key, None)
            if desc is None or isinstance(desc, _SafeLoaderDescriptor):
                continue
            setattr(class_, key, _SafeLoaderDescriptor(desc, key))
