"""Сервис отчётов и аналитики (ТЗ 7.6).

Все запросы строго скоупятся по family_id. Денежные суммы — Decimal.
"""
from __future__ import annotations

import calendar
import uuid
from datetime import date, datetime, time, timezone
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import AccountType, TransactionType
from app.models.family import Family, User
from app.models.receipt import Receipt
from app.models.reference import Account, Category, Counterparty
from app.models.transaction import Transaction

ZERO = Decimal("0")
CASH_TYPES = (AccountType.CASH,)
CARD_TYPES = (AccountType.CARD, AccountType.BANK, AccountType.CREDIT)


def period_bounds(date_from: date | None, date_to: date | None) -> tuple[datetime, datetime]:
    """Границы периода в UTC-aware datetime; по умолчанию — текущий месяц."""
    if date_from is None:
        today = date.today()
        date_from = today.replace(day=1)
    if date_to is None:
        today = date.today()
        last_day = calendar.monthrange(today.year, today.month)[1]
        date_to = today.replace(day=last_day)
    dt_from = datetime.combine(date_from, time.min, tzinfo=timezone.utc)
    dt_to = datetime.combine(date_to, time.max, tzinfo=timezone.utc)
    return dt_from, dt_to


def _base_filters(dt_from: datetime, dt_to: datetime):
    return (
        Transaction.deleted_at.is_(None),
        Transaction.occurred_at >= dt_from,
        Transaction.occurred_at <= dt_to,
    )


async def summary(db: AsyncSession, family_id: uuid.UUID, dt_from: datetime, dt_to: datetime) -> dict:
    """Доходы/расходы за период + разделение наличные/безналичные (ТЗ 7.6)."""
    rows = (
        await db.execute(
            select(
                Transaction.type,
                Account.type,
                func.coalesce(func.sum(Transaction.amount), ZERO),
                func.count(Transaction.id),
            )
            .join(Account, Account.id == Transaction.account_id)
            .where(Transaction.family_id == family_id, *_base_filters(dt_from, dt_to))
            .group_by(Transaction.type, Account.type)
        )
    ).all()

    income = expense = cash_in = cash_out = card_in = card_out = ZERO
    count = 0
    for ttype, atype, amount, n in rows:
        amount = Decimal(str(amount or 0))
        count += n
        if ttype == TransactionType.INCOME:
            income += amount
            if atype == AccountType.CASH:
                cash_in += amount
            else:
                card_in += amount
        elif ttype == TransactionType.EXPENSE:
            expense += amount
            if atype == AccountType.CASH:
                cash_out += amount
            else:
                card_out += amount

    balance_total = (
        await db.execute(
            select(func.coalesce(func.sum(Account.balance), ZERO)).where(
                Account.family_id == family_id,
                Account.deleted_at.is_(None),
                Account.is_archived.is_(False),
            )
        )
    ).scalar_one()

    return {
        "income": income,
        "income_total": income,
        "expense": expense,
        "expense_total": expense,
        "net": income - expense,
        "cash_income": cash_in,
        "cash_expense": cash_out,
        "card_income": card_in,
        "card_expense": card_out,
        "balance_total": Decimal(str(balance_total)),
        "transactions_count": count,
    }


async def by_category(
    db: AsyncSession,
    family_id: uuid.UUID,
    dt_from: datetime,
    dt_to: datetime,
    kind: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """Топ категорий за период с долями (pie-диаграмма)."""
    total_stmt = (
        select(func.coalesce(func.sum(Transaction.amount), ZERO))
        .where(Transaction.family_id == family_id, *_base_filters(dt_from, dt_to))
    )
    if kind:
        total_stmt = total_stmt.where(Transaction.type == TransactionType(kind))
    total = Decimal(str((await db.execute(total_stmt)).scalar_one()))

    stmt = (
        select(
            Category.id,
            Category.name,
            Category.kind,
            Category.color,
            Category.icon,
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount), ZERO).label("amount"),
            func.count(Transaction.id).label("cnt"),
        )
        .join(Category, Category.id == Transaction.category_id)
        .where(Transaction.family_id == family_id, *_base_filters(dt_from, dt_to))
        .group_by(Category.id, Transaction.type)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(limit)
    )
    if kind:
        stmt = stmt.where(Transaction.type == TransactionType(kind))

    out: list[dict] = []
    for cid, name, ckind, color, icon, ttype, amount, cnt in (await db.execute(stmt)).all():
        amount = Decimal(str(amount))
        share = float(amount / total) if total else 0.0
        out.append(
            {
                "category_id": cid,
                "category_name": name,
                "kind": str(ttype if ttype else ckind),
                "color": color,
                "icon": icon,
                "amount": amount,
                "share": round(share, 4),
                "count": cnt,
            }
        )
    return out


async def by_month(db: AsyncSession, family_id: uuid.UUID, months: int = 12) -> list[dict]:
    """Динамика доходов/расходов по месяцам (bar) — последние N месяцев."""
    yearmonth = func.strftime("%Y-%m", Transaction.occurred_at)  # SQLite
    month_pg = func.to_char(Transaction.occurred_at, "YYYY-MM")  # PostgreSQL

    dialect = db.bind.dialect.name if db.bind is not None else "sqlite"
    col = month_pg if dialect == "postgresql" else yearmonth

    stmt = (
        select(
            col.label("month"),
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount), ZERO),
        )
        .where(
            Transaction.family_id == family_id,
            Transaction.deleted_at.is_(None),
            Transaction.type.in_([TransactionType.INCOME, TransactionType.EXPENSE]),
        )
        .group_by(col, Transaction.type)
    )
    rows = (await db.execute(stmt)).all()

    agg: dict[str, dict] = {}
    for month, ttype, amount in rows:
        m = str(month)[:7]
        d = agg.setdefault(m, {"month": m, "income": ZERO, "expense": ZERO})
        key = "income" if ttype == TransactionType.INCOME else "expense"
        d[key] = Decimal(str(amount))
    items = sorted(agg.values(), key=lambda x: x["month"])[-months:]
    for it in items:
        it["net"] = it["income"] - it["expense"]
    return items


async def cashflow(db: AsyncSession, family_id: uuid.UUID, dt_from: datetime, dt_to: datetime) -> list[dict]:
    """P&L по дням (line тренд)."""
    day_expr_sqlite = func.strftime("%Y-%m-%d", Transaction.occurred_at)
    day_expr_pg = func.to_char(Transaction.occurred_at, "YYYY-MM-DD")
    dialect = db.bind.dialect.name if db.bind is not None else "sqlite"
    col = day_expr_pg if dialect == "postgresql" else day_expr_sqlite

    stmt = (
        select(
            col.label("day"),
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount), ZERO),
        )
        .where(Transaction.family_id == family_id, *_base_filters(dt_from, dt_to))
        .group_by(col, Transaction.type)
    )
    rows = (await db.execute(stmt)).all()
    agg: dict[str, dict] = {}
    for day, ttype, amount in rows:
        d = agg.setdefault(str(day)[:10], {"day": str(day)[:10], "income": ZERO, "expense": ZERO})
        key = "income" if ttype == TransactionType.INCOME else "expense"
        d[key] = Decimal(str(amount))
    out = sorted(agg.values(), key=lambda x: x["day"])
    for it in out:
        it["balance_delta"] = it["income"] - it["expense"]
    return out


async def by_member(db: AsyncSession, family_id: uuid.UUID, dt_from: datetime, dt_to: datetime) -> list[dict]:
    """Отчёт по членам семьи (ТЗ 7.6)."""
    stmt = (
        select(
            User.id,
            User.name,
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount), ZERO),
            func.count(Transaction.id),
        )
        .join(Transaction, Transaction.author_id == User.id)
        .where(Transaction.family_id == family_id, *_base_filters(dt_from, dt_to))
        .group_by(User.id, Transaction.type)
    )
    rows = (await db.execute(stmt)).all()
    agg: dict[uuid.UUID, dict] = {}
    for uid, name, ttype, amount, cnt in rows:
        d = agg.setdefault(uid, {"user_id": uid, "name": name, "income": ZERO, "expense": ZERO, "transactions_count": 0})
        key = "income" if ttype == TransactionType.INCOME else "expense"
        d[key] = Decimal(str(amount))
        d["transactions_count"] += cnt
    return sorted(agg.values(), key=lambda x: x["expense"], reverse=True)


async def budgets_status(db: AsyncSession, family_id: uuid.UUID, on_date: date | None = None) -> list[dict]:
    """План/факт по всем бюджетам на дату (включая недельные/годовые)."""
    from app.models.transaction import Budget

    on = on_date or date.today()
    budgets = (
        await db.execute(
            select(Budget, Category)
            .join(Category, Category.id == Budget.category_id)
            .where(Budget.family_id == family_id, Budget.deleted_at.is_(None))
        )
    ).all()
    out: list[dict] = []
    for b, cat in budgets:
        spent = (
            await db.execute(
                select(func.coalesce(func.sum(Transaction.amount), ZERO))
                .where(
                    Transaction.family_id == family_id,
                    Transaction.deleted_at.is_(None),
                    Transaction.type == TransactionType.EXPENSE,
                    Transaction.category_id == b.category_id,
                    Transaction.occurred_at >= datetime.combine(b.period_start, time.min, tzinfo=timezone.utc),
                    Transaction.occurred_at <= datetime.combine(b.period_end, time.max, tzinfo=timezone.utc),
                )
            )
        ).scalar_one()
        spent = Decimal(str(spent))
        out.append(
            {
                "id": b.id,
                "category": {"id": cat.id, "name": cat.name, "color": cat.color, "icon": cat.icon},
                "period": b.period,
                "period_start": b.period_start,
                "period_end": b.period_end,
                "limit_amount": b.limit_amount,
                "spent": spent,
                "remaining": b.limit_amount - spent,
                "over_limit": bool(b.limit_amount > 0 and spent > b.limit_amount),
                "notify_on_overrun": b.notify_on_overrun,
                "active_now": b.period_start <= on <= b.period_end,
            }
        )
    return out


def _group_expr(db: AsyncSession, group_by: str):
    """SQL-выражение группировки по дням/неделям/месяцам (SQLite + PostgreSQL)."""
    dialect = db.bind.dialect.name if db.bind is not None else "sqlite"
    if group_by == "month":
        return func.to_char(Transaction.occurred_at, "YYYY-MM") if dialect == "postgresql" else func.strftime("%Y-%m", Transaction.occurred_at)
    if group_by == "week":
        # ISO-год + номер недели; для SQLite — через julianday
        if dialect == "postgresql":
            return func.to_char(Transaction.occurred_at, "IYYY-IW")
        return func.strftime("%Y-W%W", Transaction.occurred_at)
    return func.to_char(Transaction.occurred_at, "YYYY-MM-DD") if dialect == "postgresql" else func.strftime("%Y-%m-%d", Transaction.occurred_at)


async def period_report(
    db: AsyncSession,
    family_id: uuid.UUID,
    dt_from: datetime,
    dt_to: datetime,
    tx_type: str | None = None,
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    group_by: str = "day",
) -> dict:
    """Отчёт за произвольный период с группировкой day/week/month/category/account."""
    conds = [Transaction.family_id == family_id, *_base_filters(dt_from, dt_to)]
    if tx_type in ("income", "expense", "transfer"):
        conds.append(Transaction.type == TransactionType(tx_type))
    if account_id:
        conds.append(Transaction.account_id == account_id)
    if category_id:
        conds.append(Transaction.category_id == category_id)

    totals_rows = (
        await db.execute(
            select(Transaction.type, func.coalesce(func.sum(Transaction.amount), ZERO), func.count(Transaction.id))
            .where(*conds)
            .group_by(Transaction.type)
        )
    ).all()
    income = expense = transfer = ZERO
    count = 0
    for ttype, amount, n in totals_rows:
        amount = Decimal(str(amount))
        count += n
        if ttype == TransactionType.INCOME:
            income += amount
        elif ttype == TransactionType.EXPENSE:
            expense += amount
        else:
            transfer += amount

    groups: list[dict] = []
    if group_by in ("category", "account"):
        model_col, name_model = (
            (Transaction.category_id, Category) if group_by == "category" else (Transaction.account_id, Account)
        )
        stmt = (
            select(name_model.id, name_model.name, func.coalesce(func.sum(Transaction.amount), ZERO), func.count(Transaction.id))
            .join(name_model, name_model.id == model_col)
            .where(*conds)
            .group_by(name_model.id)
            .order_by(func.sum(Transaction.amount).desc())
            .limit(100)
        )
        total_sum = income + expense or ZERO
        for gid, gname, amount, n in (await db.execute(stmt)).all():
            amount = Decimal(str(amount))
            groups.append(
                {
                    "key": str(gid),
                    "label": gname,
                    "amount": amount,
                    "count": n,
                    "share": round(float(amount / total_sum), 4) if total_sum else 0.0,
                }
            )
    else:
        col = _group_expr(db, group_by)
        stmt = (
            select(col.label("g"), Transaction.type, func.coalesce(func.sum(Transaction.amount), ZERO))
            .where(*conds)
            .group_by(col, Transaction.type)
        )
        agg: dict[str, dict] = {}
        for gkey, ttype, amount in (await db.execute(stmt)).all():
            k = str(gkey)[:10]
            d = agg.setdefault(k, {"key": k, "label": k, "income": ZERO, "expense": ZERO})
            if ttype == TransactionType.INCOME:
                d["income"] = Decimal(str(amount))
            elif ttype == TransactionType.EXPENSE:
                d["expense"] = Decimal(str(amount))
        groups = sorted(agg.values(), key=lambda x: x["key"])
        for d in groups:
            d["net"] = d["income"] - d["expense"]

    return {
        "date_from": dt_from.date().isoformat(),
        "date_to": dt_to.date().isoformat(),
        "group_by": group_by,
        "income": income,
        "expense": expense,
        "transfer": transfer,
        "net": income - expense,
        "transactions_count": count,
        "items": groups,
    }


def _aware(dt) -> datetime:
    """SQLite отдаёт naive datetime — приводим к UTC для корректных сравнений."""
    if dt is None:
        return None  # type: ignore[return-value]
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _signed_delta(a_id):
    """Знак изменения баланса счёта a_id для транзакции (для reverse-расчётов)."""
    return sa.case(
        (
            sa.and_(Transaction.type == TransactionType.INCOME, Transaction.account_id == a_id),
            Transaction.amount,
        ),
        (
            Transaction.type == TransactionType.TRANSFER,
            sa.case(
                (Transaction.target_account_id == a_id, Transaction.amount),
                (Transaction.account_id == a_id, -Transaction.amount),
                else_=0,
            ),
        ),
        (
            sa.and_(Transaction.type == TransactionType.EXPENSE, Transaction.account_id == a_id),
            -Transaction.amount,
        ),
        else_=0,
    )


async def by_account(db: AsyncSession, family_id: uuid.UUID, dt_from: datetime, dt_to: datetime) -> list[dict]:
    """Движение по счетам: начальный остаток, приход, расход, конечный остаток.

    Начальный остаток = opening_balance + накопленное движение ДО начала периода;
    конечный = opening + inflow - outflow (за период). Сверка с Account.balance не
    выполняется из-за расхождения часовых поясов записей (см. _delta_after).
    """
    accounts = (
        await db.execute(
            select(Account).where(
                Account.family_id == family_id,
                Account.deleted_at.is_(None),
            )
        )
    ).scalars().all()

    out: list[dict] = []
    for a in accounts:
        rows = (
            await db.execute(
                select(Transaction, Transaction.type)
                .where(
                    Transaction.family_id == family_id,
                    Transaction.deleted_at.is_(None),
                    Transaction.occurred_at >= dt_from,
                    Transaction.occurred_at <= dt_to,
                    sa.or_(Transaction.account_id == a.id, Transaction.target_account_id == a.id),
                )
            )
        ).all()
        inflow = outflow = ZERO
        for tx, ttype in rows:
            amount = Decimal(str(tx.amount))
            if ttype == TransactionType.INCOME:
                inflow += amount
            elif ttype == TransactionType.TRANSFER:
                if tx.target_account_id == a.id:
                    inflow += amount
                else:
                    outflow += amount
            else:
                outflow += amount

        # накопленное движение ДО начала периода относительно opening_balance
        before_rows = (
            await db.execute(
                select(func.coalesce(func.sum(_signed_delta(a.id)), ZERO)).where(
                    Transaction.family_id == family_id,
                    Transaction.deleted_at.is_(None),
                    Transaction.occurred_at < dt_from,
                    sa.or_(Transaction.account_id == a.id, Transaction.target_account_id == a.id),
                )
            )
        ).scalar_one()
        opening = Decimal(str(a.opening_balance)) + Decimal(str(before_rows or 0))
        closing = opening + inflow - outflow
        out.append(
            {
                "account_id": a.id,
                "account_name": a.name,
                "type": str(a.type),
                "currency": a.currency,
                "is_archived": a.is_archived,
                "opening_balance": opening,
                "inflow": inflow,
                "outflow": outflow,
                "closing_balance": closing,
            }
        )
    return out


async def transactions_detail(
    db: AsyncSession,
    family_id: uuid.UUID,
    dt_from: datetime,
    dt_to: datetime,
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    tx_type: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> dict:
    """Детальный список транзакций с фильтрами и пагинацией."""
    conds = [Transaction.family_id == family_id, *_base_filters(dt_from, dt_to)]
    if account_id:
        conds.append(sa.or_(Transaction.account_id == account_id, Transaction.target_account_id == account_id))
    if category_id:
        conds.append(Transaction.category_id == category_id)
    if tx_type in ("income", "expense", "transfer"):
        conds.append(Transaction.type == TransactionType(tx_type))
    if search:
        like = f"%{search.strip()}%"
        conds.append(
            sa.or_(
                Transaction.comment.ilike(like),
                Counterparty.name.ilike(like),
            )
        )

    total = (
        await db.execute(select(func.count(Transaction.id)).select_from(Transaction).outerjoin(Counterparty).where(*conds))
    ).scalar_one()
    rows = (
        await db.execute(
            select(Transaction, Account.name, Category.name, Counterparty.name, User.name)
            .outerjoin(Account, Account.id == Transaction.account_id)
            .outerjoin(Category, Category.id == Transaction.category_id)
            .outerjoin(Counterparty, Counterparty.id == Transaction.counterparty_id)
            .outerjoin(User, User.id == Transaction.author_id)
            .where(*conds)
            .order_by(Transaction.occurred_at.desc())
            .offset(skip)
            .limit(min(limit, 500))
        )
    ).all()
    items = [
        {
            "id": tx.id,
            "date": tx.occurred_at.isoformat() if tx.occurred_at else "",
            "type": str(tx.type),
            "amount": tx.amount,
            "currency": tx.currency,
            "account_name": acc_name or "",
            "category_name": cat_name or "",
            "counterparty": cp_name or "",
            "author_name": author or "",
            "comment": tx.comment or "",
            "has_receipt": tx.has_receipt,
        }
        for tx, acc_name, cat_name, cp_name, author in rows
    ]
    return {"total": int(total), "skip": skip, "limit": limit, "items": items}


async def receipts_report(db: AsyncSession, family_id: uuid.UUID, dt_from: datetime, dt_to: datetime) -> dict:
    """Статистика по чекам: количество, суммы, топ магазинов."""
    conds = [Receipt.family_id == family_id]
    date_cond = sa.and_(
        func.coalesce(Receipt.receipt_date, Receipt.created_at) >= dt_from,
        func.coalesce(Receipt.receipt_date, Receipt.created_at) <= dt_to,
    )
    row = (
        await db.execute(
            select(
                func.count(Receipt.id),
                func.coalesce(func.sum(Receipt.total_amount), ZERO),
                func.coalesce(func.avg(Receipt.total_amount), ZERO),
            ).where(*conds, date_cond)
        )
    ).one()
    top_stmt = (
        select(Receipt.store_name, func.count(Receipt.id), func.coalesce(func.sum(Receipt.total_amount), ZERO))
        .where(*conds, date_cond, Receipt.store_name.is_not(None))
        .group_by(Receipt.store_name)
        .order_by(func.sum(Receipt.total_amount).desc())
        .limit(10)
    )
    top = [
        {"store_name": s, "receipts_count": int(n), "total": Decimal(str(t))}
        for s, n, t in (await db.execute(top_stmt)).all()
    ]
    recent = (
        await db.execute(
            select(Receipt)
            .where(*conds, date_cond)
            .order_by(func.coalesce(Receipt.receipt_date, Receipt.created_at).desc())
            .limit(50)
        )
    ).scalars().all()
    return {
        "count": int(row[0]),
        "total": Decimal(str(row[1])),
        "avg": Decimal(str(row[2])),
        "top_stores": top,
        "receipts": [
            {
                "id": r.id,
                "store_name": r.store_name,
                "inn": r.inn,
                "date": (r.receipt_date or r.created_at).isoformat(),
                "total_amount": r.total_amount or ZERO,
                "parse_status": str(r.parse_status),
            }
            for r in recent
        ],
    }


async def export_transactions(db: AsyncSession, family_id: uuid.UUID, **filters) -> list[dict]:
    """Выгрузка транзакций для CSV/XLSX/PDF без пагинации (до 50k строк)."""
    dt_from, dt_to = period_bounds(filters.get("date_from"), filters.get("date_to"))
    stmt = (
        select(Transaction)
        .where(Transaction.family_id == family_id, *_base_filters(dt_from, dt_to))
        .order_by(Transaction.occurred_at.desc())
        .limit(50_000)
    )
    if filters.get("type"):
        stmt = stmt.where(Transaction.type == TransactionType(filters["type"]))
    if filters.get("account_id"):
        stmt = stmt.where(Transaction.account_id == filters["account_id"])
    if filters.get("category_id"):
        stmt = stmt.where(Transaction.category_id == filters["category_id"])
    rows = (await db.execute(stmt)).scalars().all()
    result: list[dict] = []
    for tx in rows:
        result.append(
            {
                "date": tx.occurred_at.isoformat() if tx.occurred_at else "",
                "type": str(tx.type),
                "amount": f"{tx.amount:.2f}",
                "currency": tx.currency,
                "account": tx.account.name if tx.account else "",
                "category": tx.category.name if tx.category else "",
                "counterparty": tx.counterparty.name if tx.counterparty else "",
                "author": tx.author.name if tx.author else "",
                "comment": tx.comment or "",
                "tags": "; ".join(t.name for t in tx.tags),
                "has_receipt": "да" if tx.has_receipt else "нет",
            }
        )
    return result
