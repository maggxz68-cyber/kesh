"""Модель регулярных платежей и подписок."""
from __future__ import annotations
from app.db.base import Base

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, Date, DateTime, Enum, ForeignKey, Numeric, String, Text, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.enums import TransactionType
from app.models.mixins import TimestampMixin


class RecurringPayment(Base, TimestampMixin):
    """Регулярный платёж / подписка."""
    __tablename__ = "recurring_payments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="RUB")
    
    # Связи
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    counterparty_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("counterparties.id", ondelete="SET NULL"), nullable=True
    )
    
    # Периодичность
    period_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="monthly"  # daily, weekly, monthly, yearly, custom
    )
    period_days: Mapped[int | None] = mapped_column(nullable=True)  # для custom
    
    # Даты
    start_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_due_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    last_paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    
    # Настройки
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_days_before: Mapped[int] = mapped_column(default=3)  # уведомление за N дней
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    transaction_type: Mapped[str] = mapped_column(
        String(10), default="expense"  # expense, income, transfer
    )
    
    # Связи ORM
    family = relationship("Family", lazy="noload")
    account = relationship("Account")
    category = relationship("Category")
    counterparty = relationship("Counterparty")
