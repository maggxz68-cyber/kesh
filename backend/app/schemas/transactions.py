"""Схемы транзакций и переводов (ТЗ 7.3)."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import Field, model_validator

from app.models.enums import TransactionType
from app.schemas.categories import TagOut
from app.schemas.common import ORMBase


class TxAuthorRef(ORMBase):
    id: uuid.UUID
    name: str


class TxAccountRef(ORMBase):
    id: uuid.UUID
    name: str
    type: str
    color: str | None = None
    icon: str | None = None


class TxCategoryRef(ORMBase):
    id: uuid.UUID
    name: str
    kind: str
    color: str | None = None
    icon: str | None = None


class TxCounterpartyRef(ORMBase):
    id: uuid.UUID
    name: str


class TransactionCreate(ORMBase):
    type: TransactionType
    amount: Decimal = Field(gt=0)
    currency: str = Field(default="RUB", min_length=3, max_length=3)
    account_id: uuid.UUID
    target_account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    counterparty_id: uuid.UUID | None = None
    occurred_at: datetime | None = None
    comment: str | None = Field(default=None, max_length=2000)
    tag_ids: list[uuid.UUID] = Field(default_factory=list)
    receipt_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _transfer_fields(self):
        if self.type == TransactionType.TRANSFER:
            if not self.target_account_id:
                raise ValueError("Для перевода нужен счёт-получатель (target_account_id)")
            if self.target_account_id == self.account_id:
                raise ValueError("Счета источника и получателя должны различаться")
        else:
            self.target_account_id = None
        return self


class TransactionUpdate(ORMBase):
    type: TransactionType | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    account_id: uuid.UUID | None = None
    target_account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    counterparty_id: uuid.UUID | None = None
    occurred_at: datetime | None = None
    comment: str | None = None
    tag_ids: list[uuid.UUID] | None = None


class TransferCreate(ORMBase):
    """POST /transfers — convenience для типа transfer (ТЗ 9)."""

    amount: Decimal = Field(gt=0)
    currency: str = Field(default="RUB", min_length=3, max_length=3)
    from_account_id: uuid.UUID
    to_account_id: uuid.UUID
    occurred_at: datetime | None = None
    comment: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _diff(self):
        if self.from_account_id == self.to_account_id:
            raise ValueError("Нельзя перевести деньги на тот же счёт")
        return self


class TransactionOut(ORMBase):
    id: uuid.UUID
    type: TransactionType
    amount: Decimal
    currency: str
    occurred_at: datetime
    comment: str | None
    has_receipt: bool
    author: TxAuthorRef | None = None
    account: TxAccountRef | None = None
    target_account: TxAccountRef | None = None
    category: TxCategoryRef | None = None
    counterparty: TxCounterpartyRef | None = None
    tags: list[TagOut] = Field(default_factory=list)
    receipt_ids: list[uuid.UUID] = Field(default_factory=list)
    created_at: datetime


class BulkIds(ORMBase):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=500)


class BulkResult(ORMBase):
    affected: int


SortSpec = Literal[
    "occurred_at", "-occurred_at", "amount", "-amount", "created_at", "-created_at",
]
