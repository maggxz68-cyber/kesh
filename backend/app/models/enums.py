"""Доменные перечисления (SQLAlchemy Enum, значения = имена)."""
from __future__ import annotations

import enum

from sqlalchemy.dialects.postgresql import ENUM as PGEnum
from sqlalchemy import String, Enum as SAEnum


class StrEnum(str, enum.Enum):
    """Строковое enum: значение совпадает с именем."""

    def __str__(self) -> str:  # pragma: no cover
        return self.value


class UserRole(StrEnum):
    OWNER = "owner"
    MEMBER = "member"


class AccountType(StrEnum):
    CASH = "cash"
    CARD = "card"
    BANK = "bank"
    CREDIT = "credit"


class TransactionType(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"


class CategoryKind(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"


class BudgetPeriod(StrEnum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class ReceiptParseStatus(StrEnum):
    RAW = "raw"            # только файл, распознавание не запускалось
    PARSING = "parsing"
    PARSED_QR = "parsed_qr"    # данные из QR ФНС
    PARSED_OCR = "parsed_ocr"  # данные из OCR (fallback)
    FAILED = "failed"


class AuditAction(StrEnum):
    LOGIN = "login"
    LOGOUT = "logout"
    DEMO_LOGIN = "demo_login"
    IMPERSONATE = "impersonate"
    IMPERSONATE_STOP = "impersonate_stop"
    FAMILY_BLOCK = "family_block"
    FAMILY_UNBLOCK = "family_unblock"
    FAMILY_DELETE_SOFT = "family_delete_soft"
    FAMILY_DELETE_HARD = "family_delete_hard"
    PASSWORD_RESET = "password_reset"
    PASSWORD_CHANGE = "password_change"


def pg_enum(py_enum: type[StrEnum], name: str) -> SAEnum:
    """PostgreSQL-native enum с безопасным пересозданием типа при autogenerate."""
    return SAEnum(
        py_enum,
        native_enum=True,
        name=name,
        create_constraint=False,
        values_callable=lambda e: [m.value for m in e],
    )


# Для SQLite (тесты/разработка без Docker) enum отражается в VARCHAR.
def enum_column(py_enum: type[StrEnum], name: str) -> SAEnum | String:
    return pg_enum(py_enum, name)
