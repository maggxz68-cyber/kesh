"""Схемы бюджетов, чеков, отчётов, семьи и экспорта (ТЗ 7.4–7.6)."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import Field, model_validator

from app.models.enums import BudgetPeriod, ReceiptParseStatus
from app.schemas.categories import CategoryOut
from app.schemas.common import ORMBase

# ---------- Бюджеты ----------


class BudgetCreate(ORMBase):
    category_id: uuid.UUID
    period: BudgetPeriod
    limit_amount: Decimal = Field(ge=0)
    period_start: date | None = None  # по умолчанию: начало текущего периода
    notify_on_overrun: bool = True


class BudgetUpdate(ORMBase):
    limit_amount: Decimal | None = Field(default=None, ge=0)
    period_start: date | None = None
    notify_on_overrun: bool | None = None


class BudgetOut(ORMBase):
    id: uuid.UUID
    category: CategoryOut | None = None
    period: BudgetPeriod
    limit_amount: Decimal
    period_start: date
    period_end: date
    notify_on_overrun: bool
    spent: Decimal = Decimal("0")
    over_limit: bool = False


# ---------- Чеки ----------


class ReceiptItemOut(ORMBase):
    id: int
    name: str
    quantity: Decimal
    price: Decimal
    total: Decimal
    vat_rate: str | None = None


class ReceiptLink(ORMBase):
    transaction_id: uuid.UUID


class ReceiptOut(ORMBase):
    id: uuid.UUID
    original_name: str | None
    mime_type: str
    size_bytes: int
    parse_status: ReceiptParseStatus
    store_name: str | None
    inn: str | None
    receipt_date: datetime | None
    total_amount: Decimal | None
    items_total: Decimal
    qr_payload_raw: str | None = None
    ocr_text: str | None = None
    meta: dict[str, Any] | None = None
    items: list[ReceiptItemOut] = Field(default_factory=list)
    transaction_ids: list[uuid.UUID] = Field(default_factory=list)
    created_at: datetime


class ReceiptParseResult(ORMBase):
    receipt: ReceiptOut
    method: Literal["qr", "ocr", "none"]
    fns_check: dict[str, Any] | None = None


class ReceiptUpdate(ORMBase):
    store_name: str | None = None
    comment: str | None = None
    transaction_ids: list[uuid.UUID] | None = None


# ---------- Отчёты ----------


class PeriodQuery(ORMBase):
    """Общие параметры периода для отчётов."""

    date_from: date | None = None
    date_to: date | None = None


class SummaryReport(ORMBase):
    income: Decimal
    expense: Decimal
    net: Decimal
    cash_income: Decimal
    cash_expense: Decimal
    card_income: Decimal   # безналичные: card/bank/credit
    card_expense: Decimal
    balance_total: Decimal
    transactions_count: int


class CategorySlice(ORMBase):
    category_id: uuid.UUID | None
    category_name: str
    kind: str
    color: str | None
    icon: str | None
    amount: Decimal
    share: float
    count: int


class MonthPoint(ORMBase):
    month: str  # YYYY-MM
    income: Decimal
    expense: Decimal
    net: Decimal


class CashflowPoint(ORMBase):
    day: str  # YYYY-MM-DD
    income: Decimal
    expense: Decimal
    balance_delta: Decimal


class MemberReportRow(ORMBase):
    user_id: uuid.UUID
    name: str
    income: Decimal
    expense: Decimal
    transactions_count: int


# ---------- Семья ----------


class FamilyOut(ORMBase):
    id: uuid.UUID
    name: str
    timezone: str
    currency: str
    registered_at: datetime
    is_demo: bool


class FamilyUserOut(ORMBase):
    id: uuid.UUID
    email: str
    name: str
    role: str
    is_active: bool
    last_login_at: datetime | None


class InviteCreate(ORMBase):
    email: str = Field(max_length=320)
    name: str | None = Field(default=None, max_length=200)


class InviteOut(ORMBase):
    id: uuid.UUID
    email: str
    code: str
    expires_at: datetime


class JoinRequest(ORMBase):
    code: str = Field(min_length=4, max_length=64)
    email: str = Field(max_length=320)
    name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=6, max_length=128)


# ---------- Супер-админ ----------


class SaFamilyRow(ORMBase):
    id: uuid.UUID
    name: str
    registered_at: datetime
    users_count: int
    transactions_count: int
    is_blocked: bool
    blocked_reason: str | None = None
    is_sandbox: bool
    deleted_at: datetime | None = None


class SaFamilyPatch(ORMBase):
    is_blocked: bool | None = None
    blocked_reason: str | None = Field(default=None, max_length=500)


class SaHardDelete(ORMBase):
    hard: bool = False


class MetricsOut(ORMBase):
    families: int
    families_active: int
    sandboxes: int
    users: int
    superadmins: int
    transactions: int
    receipts: int
    db_size_bytes: int | None = None
    receipts_volume_bytes: int | None = None


class AuditLogOut(ORMBase):
    id: int
    ts: datetime
    action: str
    actor_type: str
    actor_id: str
    actor_label: str | None
    target_family_id: uuid.UUID | None
    target_user_id: uuid.UUID | None
    ip: str | None
    details: dict[str, Any] | None


class SystemCategoryCreate(ORMBase):
    name: str = Field(min_length=1, max_length=200)
    kind: Literal["income", "expense"]
    parent_name: str | None = None
    icon: str | None = Field(default=None, max_length=64)
    color: str | None = Field(default=None, max_length=16)
    sort_order: int = 0


class ResetPasswordRequest(ORMBase):
    new_password: str = Field(min_length=6, max_length=128)

    @model_validator(mode="after")
    def _not_trivial(self):
        if self.new_password in ("123456", "password"):
            raise ValueError("Пароль слишком простой")
        return self


class ImpersonateResult(ORMBase):
    access_token: str
    refresh_token: str
    user: FamilyUserOut
    impersonator: str
