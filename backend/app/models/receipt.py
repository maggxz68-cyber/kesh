"""Чеки (receipts), позиции чека, привязка к транзакциям, аудит-лог."""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Uuid,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ReceiptParseStatus, enum_column
from app.models.family import Family
from app.models.mixins import TimestampMixin

# JSON/JSONB в зависимости от диалекта: на SQLite (тесты) — обычный JSON.
JSONType = JSON().with_variant(JSONB(), "postgresql")


class Receipt(Base, TimestampMixin):
    """Файл чека + результаты распознавания (QR ФНС / OCR).

    M:N с транзакциями через receipt_transactions (ТЗ 7.4).
    """

    __tablename__ = "receipts"

    id: Mapped[_uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=_uuid.uuid4)
    family_id: Mapped[_uuid.UUID] = mapped_column(
        ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True
    )
    uploaded_by_id: Mapped[_uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Файл
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)   # относительно RECEIPTS_DIR
    original_name: Mapped[str | None] = mapped_column(String(512))
    mime_type: Mapped[str] = mapped_column(String(64), nullable=False, default="image/jpeg")
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Реквизиты (из QR ФНС или OCR)
    parse_status: Mapped[ReceiptParseStatus] = mapped_column(
        enum_column(ReceiptParseStatus, "receipt_parse_status"),
        nullable=False,
        default=ReceiptParseStatus.RAW,
    )
    store_name: Mapped[str | None] = mapped_column(String(300))
    inn: Mapped[str | None] = mapped_column(String(12))
    fiscal_provider_inn: Mapped[str | None] = mapped_column(String(12))
    receipt_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    receipt_number: Mapped[str | None] = mapped_column(String(64))
    fiscal_document_number: Mapped[str | None] = mapped_column(String(64))
    fiscal_sign: Mapped[str | None] = mapped_column(String(64))          # тэг 1077 ФН
    shift_indicator: Mapped[str | None] = mapped_column(String(8))       # тэг 1059
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    qr_payload_raw: Mapped[str | None] = mapped_column(Text)             # исходное содержимое QR
    ocr_text: Mapped[str | None] = mapped_column(Text)                   # сырой OCR-текст
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONType)        # доп. поля ФНС/OCR

    family: Mapped[Family] = relationship(back_populates="receipts", lazy="noload")
    items: Mapped[list["ReceiptItem"]] = relationship(
        back_populates="receipt", cascade="all, delete-orphan", lazy="selectin"
    )
    transaction_links: Mapped[list["ReceiptTransaction"]] = relationship(
        back_populates="receipt", cascade="all, delete-orphan"
    )

    @property
    def items_total(self) -> Decimal:
        """Автопересчёт суммы из позиций (ТЗ 7.4)."""
        return sum((i.total for i in self.items), Decimal("0"))

    __table_args__ = (
        CheckConstraint("size_bytes >= 0", name="size_non_negative"),
        Index("ix_receipts_family_date", "family_id", "created_at"),
    )


class ReceiptItem(Base, TimestampMixin):
    """Позиция распознанного чека."""

    __tablename__ = "receipt_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    receipt_id: Mapped[_uuid.UUID] = mapped_column(
        ForeignKey("receipts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False, default=Decimal("1"))
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    vat_rate: Mapped[str | None] = mapped_column(String(16))

    receipt: Mapped[Receipt] = relationship(back_populates="items", lazy="noload")


class ReceiptTransaction(Base, TimestampMixin):
    """M:N привязка чека к транзакциям (один чек — несколько операций и наоборот)."""

    __tablename__ = "receipt_transactions"

    receipt_id: Mapped[_uuid.UUID] = mapped_column(
        ForeignKey("receipts.id", ondelete="CASCADE"), primary_key=True
    )
    transaction_id: Mapped[_uuid.UUID] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True
    )

    receipt: Mapped[Receipt] = relationship(back_populates="transaction_links", lazy="noload")
    transaction: Mapped["Transaction"] = relationship(back_populates="receipt_links", lazy="noload")  # noqa: F821


class AuditLog(Base, TimestampMixin):
    """Журнал критичных событий платформы (ТЗ 10): логины, impersonate, удаления, сбросы паролей."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor_type: Mapped[str] = mapped_column(String(32), nullable=False)  # user | superadmin | system
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_label: Mapped[str | None] = mapped_column(String(320))
    target_family_id: Mapped[_uuid.UUID | None] = mapped_column(Uuid(), index=True)
    target_user_id: Mapped[_uuid.UUID | None] = mapped_column(Uuid())
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
