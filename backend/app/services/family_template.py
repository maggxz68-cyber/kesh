"""Шаблон справочников новой семьи (ТЗ 5.1, 6.3).

Создаётся при регистрации: категории (системный набор), счёт «Наличные» с балансом 0,
пустые бюджеты-шаблоны на текущий месяц (лимит 0), базовые теги. Транзакции/чеки — НЕ создаются.
"""
from __future__ import annotations

import uuid as _uuid
from calendar import monthrange
from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import AccountType, BudgetPeriod, CategoryKind
from app.models.reference import Account, Category, Tag
from app.models.transaction import Budget

# (имя, kind, icon lucide, color hex, parent)
CATEGORY_TEMPLATE: list[tuple[str, str, str, str, str | None]] = [
    # Доходы
    ("Зарплата", "income", "banknote", "#16a34a", None),
    ("Аванс", "income", "cash", "#22c55e", "Зарплата"),
    ("Премия", "income", "trophy", "#4ade80", "Зарплата"),
    ("Фриланс", "income", "laptop", "#0ea5e9", None),
    ("Подарки", "income", "gift", "#d946ef", None),
    ("Проценты", "income", "percent", "#8b5cf6", None),
    ("Возврат долга", "income", "undo-2", "#14b8a6", None),
    ("Прочие доходы", "income", "plus-circle", "#64748b", None),
    # Расходы
    ("Продукты", "expense", "shopping-cart", "#f97316", None),
    ("Кафе и рестораны", "expense", "utensils", "#ef4444", None),
    ("Транспорт", "expense", "bus", "#06b6d4", None),
    ("Автомобиль", "expense", "car", "#3b82f6", "Транспорт"),
    ("Коммунальные", "expense", "home", "#eab308", None),
    ("Связь и интернет", "expense", "wifi", "#a855f7", "Коммунальные"),
    ("Здоровье", "expense", "heart-pulse", "#dc2626", None),
    ("Лекарства", "expense", "pill", "#f87171", "Здоровье"),
    ("Одежда", "expense", "shirt", "#ec4899", None),
    ("Обувь", "expense", "footprints", "#f472b6", "Одежда"),
    ("Развлечения", "expense", "film", "#8b5cf6", None),
    ("Образование", "expense", "graduation-cap", "#2563eb", None),
    ("Дети", "expense", "baby", "#fb923c", None),
    ("Домашние животные", "expense", "paw-print", "#a16207", None),
    ("Путешествия", "expense", "plane", "#0891b2", None),
    ("Красота", "expense", "sparkles", "#db2777", None),
    ("Спорт", "expense", "dumbbell", "#65a30d", None),
    ("Подарки", "expense", "present", "#c026d3", None),
    ("Благотворительность", "expense", "hand-heart", "#059669", None),
    ("Налоги", "expense", "file-text", "#78716c", None),
    ("Кредиты", "expense", "landmark", "#b91c1c", None),
    ("Прочие расходы", "expense", "more-horizontal", "#94a3b8", None),
]

BASE_TAGS = ["семья", "работа", "дети", "отпуск", "подарок"]

# Популярные категории для пустых бюджетов-шаблонов на текущий месяц
BUDGET_TEMPLATE_CATEGORIES = [
    "Продукты", "Кафе и рестораны", "Транспорт", "Коммунальные", "Развлечения",
]


async def populate_family_reference(
    session: AsyncSession, family_id: _uuid.UUID, *, currency: str = "RUB"
) -> None:
    """Заполняет справочники семьи шаблоном. Вызывается из сервисов register/demo-copy."""
    by_name: dict[tuple[str, str], Category] = {}

    for name, kind, icon, color, parent in CATEGORY_TEMPLATE:
        cat = Category(
            family_id=family_id,
            is_system=False,
            name=name,
            kind=CategoryKind(kind),
            icon=icon,
            color=color,
            parent_id=by_name[(parent, kind)].id if parent else None,
        )
        session.add(cat)
        await session.flush()
        by_name[(name, kind)] = cat

    # Один пустой счёт-шаблон
    session.add(
        Account(
            family_id=family_id,
            name="Наличные",
            type=AccountType.CASH,
            currency=currency,
            opening_balance=Decimal("0"),
            balance=Decimal("0"),
            icon="wallet",
            color="#16a34a",
        )
    )

    for tag_name in BASE_TAGS:
        session.add(Tag(family_id=family_id, name=tag_name))

    # Пустые шаблоны бюджетов на текущий месяц (лимит 0)
    today = date.today()
    start = today.replace(day=1)
    end = today.replace(day=monthrange(today.year, today.month)[1])
    for cat_name in BUDGET_TEMPLATE_CATEGORIES:
        cat = by_name.get((cat_name, "expense"))
        if cat is not None:
            session.add(
                Budget(
                    family_id=family_id,
                    category_id=cat.id,
                    period=BudgetPeriod.MONTHLY,
                    limit_amount=Decimal("0"),
                    period_start=start,
                    period_end=end,
                )
            )
    await session.flush()
