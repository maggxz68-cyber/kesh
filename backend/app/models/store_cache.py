"""Модель для кеширования определений магазинов по ИНН."""
from sqlalchemy import String, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
import datetime

class StoreCache(Base):
    __tablename__ = "store_cache"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    inn: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    store_name: Mapped[str] = mapped_column(String(500))
    short_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(50), default="dadata")
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
