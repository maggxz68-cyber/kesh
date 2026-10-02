"""Схемы счетов (ТЗ 7.1)."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import Field, field_validator

from app.models.enums import AccountType
from app.schemas.common import ORMBase


class AccountCreate(ORMBase):
    name: str = Field(min_length=1, max_length=200)
    type: AccountType
    currency: str = Field(default="RUB", min_length=3, max_length=3)
    opening_balance: Decimal = Decimal("0")
    icon: str | None = Field(default=None, max_length=64)
    color: str | None = Field(default=None, max_length=16)

    @field_validator("currency")
    @classmethod
    def _cur_upper(cls, v: str) -> str:
        return v.upper()


class AccountUpdate(ORMBase):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    type: AccountType | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    opening_balance: Decimal | None = None
    icon: str | None = None
    color: str | None = None
    is_archived: bool | None = None


class AccountOut(ORMBase):
    id: uuid.UUID
    name: str
    type: AccountType
    currency: str
    opening_balance: Decimal
    balance: Decimal
    icon: str | None
    color: str | None
    is_archived: bool
    sort_order: int
    created_at: datetime
