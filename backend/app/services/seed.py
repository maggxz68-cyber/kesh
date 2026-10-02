"""Seed-данные (ТЗ 6): супер-админ, демо-семья Ивановых, справочники, ~150 транзакций, чеки, бюджеты.

Используется scripts/seed.py и scheduler'ом (ежедневный reset демо-семьи).
"""
from __future__ import annotations

import random
import uuid as _uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.models.enums import (
    AccountType,
    BudgetPeriod,
    CategoryKind,
    ReceiptParseStatus,
    TransactionType,
    UserRole,
)
from app.models.family import Family, SuperAdmin, User
from app.models.reference import Account, Category, Counterparty, Tag
from app.models.receipt import Receipt, ReceiptItem, ReceiptTransaction
from app.models.transaction import Budget, Transaction, transaction_tags
from app.services.balances import apply_pending_balance_recalc, mark_accounts_dirty
from app.services.family_template import CATEGORY_TEMPLATE

DEMO_EMAILS = {
    "demo@example.com": ("Иван", UserRole.OWNER),
    "wife@example.com": ("Мария", UserRole.MEMBER),
    "son@example.com": ("Алексей", UserRole.MEMBER),
}
DEMO_PASSWORD = "demo1234"

# Счета демо-семьи (ТЗ 6.1)
DEMO_ACCOUNTS = [
    ("Наличные Ивана", AccountType.CASH, "wallet", "#f59e0b", Decimal("8500")),
    ("Карта Ивана Сбер", AccountType.CARD, "credit-card", "#2563eb", Decimal("142300.50")),
    ("Карта Марии Тинькофф", AccountType.CARD, "credit-card", "#0ea5e9", Decimal("67890.25")),
    ("Общий кошелёк", AccountType.CASH, "piggy-bank", "#16a34a", Decimal("25000")),
]

# Контрагенты демо-семьи
DEMO_COUNTERPARTIES = [
    "Пятёрочка", "Магнит", "Лента", "ВкусВилл", "Ozon", "Wildberries",
    "Яндекс Такси", "Лукойл", "Ростелеком", "Аптека Ригла", "Кинотеатр Окко",
]

# Распределение расходов: категория -> (контрагенты, среднее, разброс, частота)
EXPENSE_PROFILE: dict[str, tuple[list[str], float, float, int]] = {
    "Продукты": (["Пятёрочка", "Магнит", "Лента", "ВкусВилл"], 950, 700, 40),
    "Кафе и рестораны": ([], 850, 600, 16),
    "Транспорт": (["Яндекс Такси"], 350, 250, 18),
    "Автомобиль": (["Лукойл"], 2200, 900, 6),
    "Коммунальные": (["Ростелеком"], 4500, 1200, 3),
    "Связь и интернет": (["Ростелеком"], 650, 100, 4),
    "Здоровье": ([], 1500, 1200, 5),
    "Лекарства": (["Аптека Ригла"], 550, 400, 8),
    "Одежда": (["Ozon", "Wildberries"], 2500, 1800, 5),
    "Развлечения": (["Кинотеатр Окко"], 900, 600, 8),
    "Образование": ([], 1800, 1500, 3),
    "Дети": ([], 1200, 900, 6),
    "Путешествия": ([], 9000, 6000, 2),
    "Красота": ([], 1300, 800, 4),
    "Прочие расходы": ([], 700, 600, 7),
}

INCOME_PROFILE: list[tuple[str, float, int]] = [
    ("Зарплата", 95000, 3),      # раз в месяц каждому взрослому
    ("Фриланс", 18000, 4),
    ("Подарки", 3000, 3),
    ("Проценты", 900, 3),
    ("Возврат долга", 2500, 2),
]


def _rng() -> random.Random:
    return random.Random(20261002)  # детерминированный seed для воспроизводимости


async def ensure_superadmin(db: AsyncSession) -> SuperAdmin:
    sa = (
        await db.execute(select(SuperAdmin).where(SuperAdmin.login == settings.superadmin_login))
    ).scalar_one_or_none()
    if sa is None:
        sa = SuperAdmin(
            login=settings.superadmin_login,
            password_hash=hash_password(settings.superadmin_password),
            must_change_password=settings.superadmin_force_password_change,
        )
        db.add(sa)
        logger.info(f"seed: создан супер-админ '{settings.superadmin_login}'")
    return sa


async def _get_or_create_family(db: AsyncSession, name: str, *, is_demo: bool) -> Family:
    fam = (await db.execute(select(Family).where(Family.name == name, Family.is_demo.is_(is_demo)))).scalar_one_or_none()
    if fam is None:
        fam = Family(name=name, timezone="Europe/Moscow", currency="RUB", is_demo=is_demo)
        db.add(fam)
        await db.flush()
    return fam


async def _ensure_categories(db: AsyncSession, family_id: _uuid.UUID) -> dict[str, Category]:
    """Создаёт категории семьи из шаблона (имена уникальны в рамках kind)."""
    by_name: dict[tuple[str, str], Category] = {}
    for name, kind, icon, color, parent in CATEGORY_TEMPLATE:
        key = (name, kind)
        cat = (
            await db.execute(
                select(Category).where(
                    Category.family_id == family_id, Category.name == name, Category.kind == CategoryKind(kind)
                )
            )
        ).scalar_one_or_none()
        if cat is None:
            cat = Category(
                family_id=family_id, is_system=False, name=name, kind=CategoryKind(kind),
                icon=icon, color=color, sort_order=len(by_name),
            )
            db.add(cat)
            await db.flush()
        by_name[key] = cat
    # проставляем родителей
    for name, kind, _i, _c, parent in CATEGORY_TEMPLATE:
        if parent:
            child = by_name[(name, kind)]
            par = by_name.get((parent, kind))
            if par and child.parent_id != par.id:
                child.parent_id = par.id
    await db.flush()
    return by_name


def _make_receipt_image(store: str, total: float) -> bytes:
    """PNG-заглушка чека (рисуем bitmap вручную через zlib, без Pillow)."""
    import struct
    import zlib

    w, h = 300, 400
    rows = bytearray()
    for y in range(h):
        row = bytearray(b"\xff" * (w * 3))
        band = (y // 14) % 3 == 0 and 30 < y < 360
        if band:
            for x in range(20, w - 20):
                if (x + y) % 7 != 0:
                    o = x * 3
                    row[o:o+3] = b"\x22\x22\x22"
        rows += b"\x00" + bytes(row)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(
            ">I", zlib.crc32(tag + data) & 0xFFFFFFFF
        )

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(rows), 6))
        + chunk(b"IEND", b"")
    )


async def _create_demo_receipts(
    db: AsyncSession, family_id: _uuid.UUID, users: list[User], tx_by_comment: dict[str, Transaction], cats: dict
) -> int:
    """~10 чеков: изображение-заглушка + позиции + привязка к транзакциям (ТЗ 6.1, 7.4)."""
    rng = _rng()
    receipts_dir = Path(settings.receipts_dir) / str(family_id)
    n = 0
    grocery = cats[("Продукты", "expense")]
    linked = [t for t in tx_by_comment.values() if t.category_id == grocery.id][:10]
    stores = ["Пятёрочка", "Магнит", "Лента", "ВкусВилл"]
    item_names = ["Молоко 3.2%", "Хлеб белый", "Курица филе", "Сыр Российский", "Яйца С1 x10",
                  "Гречка", "Масло сливочное", "Помидоры", "Бананы", "Кофе молотый"]
    for tx in linked:
        store = rng.choice(stores)
        rid = _uuid.uuid4()
        rel = f"{rid}.png"
        file_path = f"{family_id}/{rel}"
        try:
            receipts_dir.mkdir(parents=True, exist_ok=True)
            (receipts_dir / rel).write_bytes(_make_receipt_image(store, float(tx.amount)))
        except OSError as exc:
            logger.warning(f"seed: не удалось записать файл чека: {exc}")
        receipt = Receipt(
            id=rid,
            family_id=family_id,
            uploaded_by_id=rng.choice(users).id,
            file_path=file_path,
            original_name=f"check_{n+1}.png",
            mime_type="image/png",
            size_bytes=max((receipts_dir / rel).stat().st_size if (receipts_dir / rel).exists() else 0, 1),
            parse_status=ReceiptParseStatus.PARSED_OCR,
            store_name=store,
            inn="7705740411",
            receipt_date=tx.occurred_at,
            total_amount=tx.amount,
            qr_payload_raw="tnt://FNN;type=s;is=...;sum=%s;" % tx.amount,
        )
        db.add(receipt)
        # позиции: разложить сумму tx на 3–6 товаров
        remain = Decimal(tx.amount)
        k = rng.randint(3, 6)
        parts = []
        for i in range(k - 1):
            share = (remain * Decimal(str(rng.uniform(0.15, 0.4)))).quantize(Decimal("0.01"))
            share = min(share, remain - Decimal("0.01") * (k - i - 1))
            if share <= 0:
                continue
            parts.append(share)
            remain -= share
        parts.append(remain)
        for name, part in zip(item_names, parts):
            price = part.quantize(Decimal("0.01"))
            db.add(ReceiptItem(receipt=receipt, name=name, quantity=Decimal("1"), price=price, total=price, vat_rate="20%"))
        db.add(ReceiptTransaction(receipt=receipt, transaction_id=tx.id))
        tx.has_receipt = True
        n += 1
    await db.flush()
    return n


async def seed_demo_family(db: AsyncSession) -> Family:
    """Демо-семья «Семья Ивановых»: пользователи, счета, транзакции, чеки, бюджеты."""
    rng = _rng()
    fam = await _get_or_create_family(db, "Семья Ивановых", is_demo=True)

    # Пользователи
    users: list[User] = []
    for email, (name, role) in DEMO_EMAILS.items():
        u = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if u is None:
            u = User(
                family_id=fam.id, email=email, name=name, role=role,
                password_hash=hash_password(DEMO_PASSWORD),
            )
            db.add(u)
            await db.flush()
        users.append(u)
    ivan, maria, alexey = users

    # Категории
    cats = await _ensure_categories(db, fam.id)

    # Теги (шаблон + демо)
    tags = {}
    for tname in ["семья", "работа", "дети", "отпуск", "подарок"]:
        t = (await db.execute(select(Tag).where(Tag.family_id == fam.id, Tag.name == tname))).scalar_one_or_none()
        if t is None:
            t = Tag(family_id=fam.id, name=tname)
            db.add(t)
            await db.flush()
        tags[tname] = t

    # Контрагенты
    cps = {}
    for cp_name in DEMO_COUNTERPARTIES:
        cp = (await db.execute(select(Counterparty).where(Counterparty.family_id == fam.id, Counterparty.name == cp_name))).scalar_one_or_none()
        if cp is None:
            cp = Counterparty(family_id=fam.id, name=cp_name)
            db.add(cp)
            await db.flush()
        cps[cp_name] = cp

    # Счета: создаём с opening_balance так, чтобы итоговый баланс совпал с ТЗ
    accounts: list[Account] = []
    acc_by_name: dict[str, Account] = {}
    for a_name, a_type, icon, color, target_balance in DEMO_ACCOUNTS:
        acc = (await db.execute(select(Account).where(Account.family_id == fam.id, Account.name == a_name))).scalar_one_or_none()
        if acc is None:
            acc = Account(
                family_id=fam.id, name=a_name, type=a_type, currency="RUB",
                opening_balance=target_balance, balance=target_balance, icon=icon, color=color,
            )
            db.add(acc)
            await db.flush()
        accounts.append(acc)
        acc_by_name[a_name] = acc

    existing_tx = (
        await db.execute(select(Transaction.id).where(Transaction.family_id == fam.id).limit(1))
    ).scalar_one_or_none()

    if existing_tx is None:
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=90)
        comments_pool: dict[str, Transaction] = {}

        def _dt(day_offset_days: float) -> datetime:
            d = start + timedelta(days=day_offset_days)
            return d.replace(hour=rng.randint(8, 21), minute=rng.randint(0, 59), second=rng.randint(0, 59))

        created = 0
        # Доходы: зарплата ежемесячно Ивану и Марии + прочие
        for m in range(3):
            base_day = m * 30 + 5
            for who, acc_name in ((ivan, "Карта Ивана Сбер"), (maria, "Карта Марии Тинькофф")):
                tx = Transaction(
                    family_id=fam.id, author_id=who.id, type=TransactionType.INCOME,
                    amount=Decimal(str(round(rng.uniform(88000, 102000), 2))), currency="RUB",
                    account_id=acc_by_name[acc_name].id, category_id=cats[("Зарплата", "income")].id,
                    occurred_at=_dt(base_day), comment="Зарплата",
                )
                db.add(tx); created += 1
        for cat_name, avg, cnt in INCOME_PROFILE[1:]:
            for _ in range(cnt):
                who = rng.choice([ivan, maria])
                acc = rng.choice(list(acc_by_name.values()))
                tx = Transaction(
                    family_id=fam.id, author_id=who.id, type=TransactionType.INCOME,
                    amount=Decimal(str(round(max(rng.gauss(avg, avg / 3), 100), 2))), currency="RUB",
                    account_id=acc.id, category_id=cats[(cat_name, "income")].id,
                    occurred_at=_dt(rng.uniform(0, 90)), comment=cat_name.lower(),
                )
                db.add(tx); created += 1

        # Расходы ~120 шт
        for cat_name, (cp_list, avg, spread, cnt) in EXPENSE_PROFILE.items():
            for _ in range(cnt):
                who = rng.choice([ivan, maria, alexey, alexey])
                acc = rng.choice(list(acc_by_name.values()))
                amount = Decimal(str(round(max(rng.gauss(avg, spread), 50), 2)))
                cp = cps[rng.choice(cp_list)] if cp_list and rng.random() < 0.7 else None
                tag_list = []
                if rng.random() < 0.3:
                    tag_list = rng.sample(list(tags.values()), k=rng.randint(1, 2))
                comment_words = {
                    "Продукты": ["Продукты", "Покупки в магазине", "Ужин на неделю"],
                    "Кафе и рестораны": ["Обед в кафе", "Ужин в ресторане", "Кофе"],
                    "Транспорт": ["Такси", "Метро", "Автобус"],
                    "Автомобиль": ["Бензин", "Заправка Лукойл"],
                    "Коммунальные": ["Квитанция ЖКХ"],
                    "Связь и интернет": ["Интернет и связь"],
                    "Здоровье": ["Приём врача", "Стоматолог"],
                    "Лекарства": ["Аптека"],
                    "Одежда": ["Одежда онлайн", "Куртка"],
                    "Развлечения": ["Кино", "Концерт"],
                    "Образование": ["Онлайн-курс"],
                    "Дети": ["Школа", "Секция"],
                    "Путешествия": ["Отель", "Билеты"],
                    "Красота": ["Парикмахерская"],
                    "Прочие расходы": ["Разное"],
                }
                comment = rng.choice(comment_words.get(cat_name, ["Расход"]))
                tx = Transaction(
                    family_id=fam.id, author_id=who.id, type=TransactionType.EXPENSE,
                    amount=amount, currency="RUB", account_id=acc.id,
                    category_id=cats[(cat_name, "expense")].id, counterparty_id=cp.id if cp else None,
                    occurred_at=_dt(rng.uniform(0, 90)), comment=comment,
                )
                if tag_list:
                    tx.tags = tag_list
                db.add(tx)
                if cat_name == "Продукты" and len(comments_pool) < 12:
                    comments_pool[f"{comment}-{created}"] = tx
                created += 1

        # Переводы между счетами
        for _ in range(8):
            src, dst = rng.sample(accounts, 2)
            tx = Transaction(
                family_id=fam.id, author_id=rng.choice(users).id, type=TransactionType.TRANSFER,
                amount=Decimal(str(round(rng.uniform(1000, 15000), 2))), currency="RUB",
                account_id=src.id, target_account_id=dst.id,
                occurred_at=_dt(rng.uniform(0, 90)), comment="Перевод между счетами",
            )
            db.add(tx); created += 1
        await db.flush()
        logger.info(f"seed: демо-транзакций создано: {created}")

        # Чеки (~10)
        nr = await _create_demo_receipts(db, fam.id, users, comments_pool, cats)
        logger.info(f"seed: демо-чеков создано: {nr}")

    # Бюджеты на текущий месяц с реальными лимитами (ТЗ 6.1: 5 шт)
    today = date.today()
    month_start = today.replace(day=1)
    budget_limits = {
        "Продукты": Decimal("25000"), "Кафе и рестораны": Decimal("12000"),
        "Транспорт": Decimal("8000"), "Развлечения": Decimal("7000"), "Дети": Decimal("10000"),
    }
    for cname, limit in budget_limits.items():
        cat = cats[(cname, "expense")]
        b = (
            await db.execute(
                select(Budget).where(
                    Budget.family_id == fam.id, Budget.category_id == cat.id,
                    Budget.period == BudgetPeriod.MONTHLY, Budget.period_start == month_start,
                )
            )
        ).scalar_one_or_none()
        if b is None:
            db.add(Budget(
                family_id=fam.id, category_id=cat.id, period=BudgetPeriod.MONTHLY,
                limit_amount=limit, period_start=month_start, period_end=month_start.replace(day=calendar_last_day(month_start)), notify_on_overrun=True,
            ))
    await db.flush()

    # Пересчёт балансов всех счетов демо-семьи (источник истины — проводки)
    all_acc_ids = [a.id for a in (await db.execute(select(Account).where(Account.family_id == fam.id))).scalars().all()]
    mark_accounts_dirty(db, all_acc_ids)
    await apply_pending_balance_recalc(db)
    return fam


def calendar_last_day(month_start: date) -> int:
    from calendar import monthrange

    return monthrange(month_start.year, month_start.month)[1]


async def run_seed(db: AsyncSession) -> None:
    await ensure_superadmin(db)
    fam = await seed_demo_family(db)
    await db.commit()
    logger.info(f"seed завершён: демо-семья '{fam.name}' id={fam.id}")
