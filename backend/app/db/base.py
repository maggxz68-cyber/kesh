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
                key = self._key
                if getattr(self._attr, "uselist", False):
                    # ВАЖНО: для collection-атрибутов нельзя писать "голый" list в
                    # __dict__ — SQLAlchemy хранит там ActiveCollectionAdapter, и
                    # запись списка/None ломает ORM ('NoneType' has no attribute
                    # '_sa_adapter' при ближайшем rollback). Поэтому: если
                    # коллекция уже была загружена ранее (есть в __dict__) — не
                    # трогаем её; иначе временно возвращаем [] без записи.
                    if key in inst.__dict__:
                        return inst.__dict__[key]
                    return fallback
                # scalar-связь: пишем None через set_committed_value, а НЕ
                # напрямую в __dict__ — иначе manager считает атрибут
                # collection-импл'ом и ближайший rollback падает с
                # AttributeError: 'NoneType' object has no attribute '_sa_adapter'.
                from sqlalchemy.orm.attributes import set_committed_value

                set_committed_value(inst, key, fallback)
                return fallback
            raise

    def __set__(self, obj, value):
        # Делегируем установку значения оригинальному атрибуту ORM.
        # Без этого присваивание связей (tx.tags = [...]) падало с
        # AttributeError: 'list' object has no attribute '_sa_adapter'.
        self._attr.__set__(obj, value)

    def __delete__(self, obj):
        self._attr.__delete__(obj)

    # Прокси атрибутов дескриптора (key, class_attribute и т.п.)
    def __getattr__(self, name):
        return getattr(self._attr, name)


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
