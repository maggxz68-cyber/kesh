"""Pydantic-схемы панели супер-админа (ТЗ 4.1, 9)."""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class OkResponse(BaseModel):
    ok: bool = True
    message: str | None = None


# ---------- Семьи ----------
class FamilyListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: _uuid.UUID
    name: str
    registered_at: datetime
    timezone: str
    currency: str
    is_blocked: bool
    blocked_reason: str | None = None
    deleted_at: datetime | None = None
    is_demo: bool = False
    is_sandbox: bool = False
    expires_at: datetime | None = None
    users_count: int = 0
    transactions_count: int = 0


class FamilyListOut(BaseModel):
    items: list[FamilyListItem]
    total: int
    page: int
    page_size: int


class SuperAdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: _uuid.UUID
    email: str
    name: str
    role: str
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime


class SuperAdminAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: _uuid.UUID
    name: str
    type: str
    currency: str
    balance: Decimal
    is_archived: bool


class SuperAdminTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: _uuid.UUID
    type: str
    amount: Decimal
    currency: str
    occurred_at: datetime
    comment: str | None = None
    account_id: _uuid.UUID
    category_id: _uuid.UUID | None = None
    author_id: _uuid.UUID | None = None
    has_receipt: bool = False


class SuperAdminReceiptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: _uuid.UUID
    original_name: str | None = None
    store_name: str | None = None
    inn: str | None = None
    total_amount: Decimal | None = None
    receipt_date: datetime | None = None
    parse_status: str
    size_bytes: int
    created_at: datetime


class FamilyDetailOut(BaseModel):
    family: FamilyListItem
    users: list[SuperAdminUserOut]
    accounts: list[SuperAdminAccountOut]
    recent_transactions: list[SuperAdminTransactionOut]
    receipts: list[SuperAdminReceiptOut]


class BlockRequest(BaseModel):
    is_blocked: bool
    reason: str | None = Field(default=None, max_length=500)


class DeleteRequest(BaseModel):
    hard: bool = False  # soft delete по умолчанию (ТЗ 4.1)


# ---------- Пользователи / пароли ----------
class ResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)
    force_change: bool = True


# ---------- Impersonate ----------
class ImpersonateOut(BaseModel):
    access_token: str
    user_id: _uuid.UUID
    family_id: _uuid.UUID
    impersonator_id: int


# ---------- Метрики ----------
class MetricsOut(BaseModel):
    families_total: int
    families_active: int
    families_blocked: int
    families_sandbox: int
    users_total: int
    transactions_total: int
    receipts_total: int
    db_size: str | None = None
    receipts_volume_bytes: int | None = None
    receipts_volume_human: str | None = None


# ---------- Логи ----------
class AuditLogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ts: datetime
    action: str
    actor_type: str
    actor_id: str
    actor_label: str | None = None
    target_family_id: _uuid.UUID | None = None
    target_user_id: _uuid.UUID | None = None
    ip: str | None = None
    details: dict | None = None


class LogsOut(BaseModel):
    items: list[AuditLogItem]
    total: int


# ---------- Системные категории ----------
class SystemCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: _uuid.UUID
    name: str
    kind: str
    icon: str | None = None
    color: str | None = None
    parent_id: _uuid.UUID | None = None
    is_system: bool


class SystemCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    kind: str = Field(pattern="^(income|expense)$")
    icon: str | None = Field(default=None, max_length=64)
    color: str | None = Field(default=None, max_length=16)
    parent_id: _uuid.UUID | None = None


class SystemCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    icon: str | None = Field(default=None, max_length=64)
    color: str | None = Field(default=None, max_length=16)
    parent_id: _uuid.UUID | None = None
