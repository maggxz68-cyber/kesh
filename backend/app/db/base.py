"""Реестр моделей SQLAlchemy (модели добавляются на этапе 2)."""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
