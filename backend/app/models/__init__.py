"""Реестр моделей. Импорты важны: Alembic autogenerate видит только зарегистрированные классы."""
from app.db.base import Base  # noqa: F401
from app.models.enums import (
    AccountType,
    AuditAction,
    BudgetPeriod,
    CategoryKind,
    ReceiptParseStatus,
    TransactionType,
    UserRole,
)
from app.models.family import (
    Family,
    FamilyMemberVisibility,
    Invitation,
    SuperAdmin,
    User,
)
from app.models.mixins import SoftDeleteMixin, TimestampMixin
from app.models.receipt import AuditLog, Receipt, ReceiptItem, ReceiptTransaction
from app.models.reference import Account, Category, Counterparty, Tag
from app.models.transaction import Budget, Transaction, transaction_tags

__all__ = [
    "Base",
    "AccountType",
    "AuditAction",
    "BudgetPeriod",
    "CategoryKind",
    "ReceiptParseStatus",
    "TransactionType",
    "UserRole",
    "Family",
    "User",
    "SuperAdmin",
    "Invitation",
    "FamilyMemberVisibility",
    "Account",
    "Category",
    "Tag",
    "Counterparty",
    "Transaction",
    "Budget",
    "transaction_tags",
    "Receipt",
    "ReceiptItem",
    "ReceiptTransaction",
    "AuditLog",
    "TimestampMixin",
    "SoftDeleteMixin",
]
