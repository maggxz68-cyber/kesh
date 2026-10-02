"""CRUD транзакций, переводы, массовые операции (ТЗ 7.3, 9).

Фишки: фильтры (период/тип/счёт/категория/автор/чек/диапазон сумм/теги/контрагент),
поиск, пагинация, сортировка; owner может удалять чужие транзакции, member — только свои.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import noload
from sqlalchemy import func, or_, select

from app.core.deps import CurrentUser, DbDep, csrf_guard, get_current_user, parse_uuid
from app.models.enums import TransactionType, UserRole
from app.models.reference import Account, Category, Counterparty, Tag
from app.models.receipt import Receipt, ReceiptTransaction
from app.models.transaction import Transaction, transaction_tags
from app.schemas.common import Page
from app.schemas.transactions import (
    BulkIds,
    BulkResult,
    TransactionCreate,
    TransactionOut,
    TransactionUpdate,
    TransferCreate,
)
from app.services.balances import affected_account_ids, mark_accounts_dirty

async def _refresh_noload(db, obj):
    """Обновить scalar-поля объекта через Core SELECT (async-safe: без lazy-load relations)."""
    from sqlalchemy import inspect as sa_inspect
    from sqlalchemy import select
    from sqlalchemy.orm.attributes import set_committed_value

    mp = sa_inspect(type(obj)).mapper
    table = mp.local_table
    pk_names = [pk.name for pk in mp.primary_key]
    stmt = select(table).where(*[table.c[n] == getattr(obj, n) for n in pk_names])
    res = await db.execute(stmt)
    row = res.mappings().one()
    for col in table.columns:
        if col.key in mp.attrs:
            set_committed_value(obj, col.key, row[col.key])


router = APIRouter(dependencies=[Depends(csrf_guard)])
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]

SORTABLE = {
    "occurred_at": Transaction.occurred_at,
    "amount": Transaction.amount,
    "created_at": Transaction.created_at,
}


def _to_out(tx: Transaction) -> dict:
    """ORM → сериализуемый dict с вложенными ссылками."""
    def _ref(obj, fields):
        if obj is None:
            return None
        return {k: getattr(obj, k) for k in fields}

    return {
        "id": tx.id,
        "type": tx.type,
        "amount": tx.amount,
        "currency": tx.currency,
        "occurred_at": tx.occurred_at,
        "comment": tx.comment,
        "has_receipt": tx.has_receipt,
        "author": _ref(tx.author, ["id", "name"]),
        "account": _ref(tx.account, ["id", "name", "type", "color", "icon"]),
        "target_account": _ref(tx.target_account, ["id", "name", "type", "color", "icon"]),
        "category": _ref(tx.category, ["id", "name", "kind", "color", "icon"]),
        "counterparty": _ref(tx.counterparty, ["id", "name"]),
        "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in tx.tags],
        "receipt_ids": [l.receipt_id for l in tx.receipt_links],
        "created_at": tx.created_at,
    }


async def _validate_refs(db: DbDep, current: CurrentUser, body: TransactionCreate | TransactionUpdate) -> None:
    fam = current.family_id
    acc_ids = [body.account_id] if getattr(body, "account_id", None) else []
    if getattr(body, "target_account_id", None):
        acc_ids.append(body.target_account_id)
    if acc_ids:
        rows = (await db.execute(select(Account.id).where(Account.id.in_(acc_ids), Account.family_id == fam))).all()
        if len(rows) != len(set(acc_ids)):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Счёт не найден в вашей семье")
    if getattr(body, "category_id", None):
        cat = (await db.execute(select(Category).where(Category.id == body.category_id))).scalar_one_or_none()
        if cat is None or (cat.family_id != fam and not cat.is_system):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Категория не найдена")
    if getattr(body, "counterparty_id", None):
        cp = (
            await db.execute(
                select(Counterparty.id).where(Counterparty.id == body.counterparty_id, Counterparty.family_id == fam)
            )
        ).scalar_one_or_none()
        if cp is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Контрагент не найден")
    tag_ids = getattr(body, "tag_ids", None) or []
    if tag_ids:
        n = (
            await db.execute(
                select(func.count(Tag.id)).where(Tag.id.in_(tag_ids), Tag.family_id == fam, Tag.deleted_at.is_(None))
            )
        ).scalar_one()
        if n != len(set(tag_ids)):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Тег не найден в вашей семье")
    rid = getattr(body, "receipt_id", None)
    if rid:
        r = (
            await db.execute(select(Receipt.id).where(Receipt.id == rid, Receipt.family_id == fam))
        ).scalar_one_or_none()
        if r is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Чек не найден")


async def _load_full(db: DbDep, tx_id: uuid.UUID) -> Transaction:
    return (
        await db.execute(
            select(Transaction)
            .where(Transaction.id == tx_id)
            .options(
                *[]  # relationship'ы подтянутся lazily в async через selectin у tags
            )
        )
    ).scalar_one_or_none()


@router.get("", response_model=Page[dict])
async def list_transactions(
    db: DbDep,
    current: CurrentUserDep,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
    sort: str = Query("-occurred_at"),
    type: str | None = None,
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    author_id: uuid.UUID | None = None,
    counterparty_id: uuid.UUID | None = None,
    tag_id: uuid.UUID | None = None,
    has_receipt: bool | None = None,
    amount_min: float | None = None,
    amount_max: float | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = Query(default=None, max_length=200, description="Поиск по комментарию/контрагенту"),
) -> Page[dict]:
    stmt = select(Transaction).where(
        Transaction.family_id == current.family_id, Transaction.deleted_at.is_(None)
    )
    if type:
        stmt = stmt.where(Transaction.type == TransactionType(type))
    if account_id:
        stmt = stmt.where(or_(Transaction.account_id == account_id, Transaction.target_account_id == account_id))
    if category_id:
        stmt = stmt.where(Transaction.category_id == category_id)
    if author_id:
        stmt = stmt.where(Transaction.author_id == author_id)
    if counterparty_id:
        stmt = stmt.where(Transaction.counterparty_id == counterparty_id)
    if tag_id:
        stmt = stmt.where(
            Transaction.id.in_(select(transaction_tags.c.transaction_id).where(transaction_tags.c.tag_id == tag_id))
        )
    if has_receipt is not None:
        stmt = stmt.where(Transaction.has_receipt.is_(has_receipt))
    if amount_min is not None:
        stmt = stmt.where(Transaction.amount >= amount_min)
    if amount_max is not None:
        stmt = stmt.where(Transaction.amount <= amount_max)
    if date_from:
        stmt = stmt.where(Transaction.occurred_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        stmt = stmt.where(Transaction.occurred_at <= datetime.combine(date_to, time.max, tzinfo=timezone.utc))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Transaction.comment.ilike(like),
                Transaction.counterparty_id.in_(
                    select(Counterparty.id).where(Counterparty.name.ilike(like))
                ),
            )
        )

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

    desc = sort.startswith("-")
    col = SORTABLE.get(sort.lstrip("-"))
    if col is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Недопустимая сортировка")
    stmt = stmt.order_by(col.desc() if desc else col.asc())
    rows = (await db.execute(stmt.offset((page - 1) * per_page).limit(per_page))).scalars().all()

    pages = (total + per_page - 1) // per_page if total else 0
    return Page(items=[_to_out(t) for t in rows], total=total, page=page, per_page=per_page, pages=pages)


@router.get("/{tx_id}", response_model=dict)
async def get_transaction(tx_id: str, db: DbDep, current: CurrentUserDep) -> dict:
    tx = await _load_full(db, parse_uuid(tx_id))
    if tx is None or tx.family_id != current.family_id or tx.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Транзакция не найдена")
    return _to_out(tx)


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_transaction(body: TransactionCreate, db: DbDep, current: CurrentUserDep) -> dict:
    await _validate_refs(db, current, body)
    tx = Transaction(
        family_id=current.family_id,
        author_id=current.user.id,
        type=body.type,
        amount=body.amount,
        currency=body.currency.upper(),
        account_id=body.account_id,
        target_account_id=body.target_account_id,
        category_id=body.category_id,
        counterparty_id=body.counterparty_id,
        occurred_at=body.occurred_at or datetime.now(timezone.utc),
        comment=body.comment,
        has_receipt=body.receipt_id is not None,
    )
    if body.tag_ids:
        tx.tags = list(
            (await db.execute(select(Tag).where(Tag.id.in_(body.tag_ids)))).scalars().all()
        )
    db.add(tx)
    await db.flush()
    if body.receipt_id:
        db.add(ReceiptTransaction(receipt_id=body.receipt_id, transaction_id=tx.id))
        await db.flush()
    mark_accounts_dirty(db, affected_account_ids(tx))
    await _refresh_noload(db, tx)
    return _to_out(tx)


@router.post("/bulk-delete", response_model=BulkResult)
async def bulk_delete(body: BulkIds, db: DbDep, current: CurrentUserDep) -> BulkResult:
    affected = 0
    now = datetime.now(timezone.utc)
    for tid in body.ids:
        tx = (await db.execute(select(Transaction).where(Transaction.id == tid))).scalar_one_or_none()
        if tx is None or tx.deleted_at is not None or tx.family_id != current.family_id:
            continue
        if tx.author_id != current.user.id and not current.is_owner:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Удалять чужие транзакции может только владелец")
        tx.deleted_at = now
        mark_accounts_dirty(db, affected_account_ids(tx))
        affected += 1
    await db.flush()
    return BulkResult(affected=affected)


@router.patch("/{tx_id}", response_model=dict)
async def update_transaction(tx_id: str, body: TransactionUpdate, db: DbDep, current: CurrentUserDep) -> dict:
    tx = await _load_full(db, parse_uuid(tx_id))
    if tx is None or tx.family_id != current.family_id or tx.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Транзакция не найдена")
    if tx.author_id != current.user.id and not current.is_owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Редактировать чужие транзакции может только владелец")
    old_ids = affected_account_ids(tx)
    data = body.model_dump(exclude_unset=True)
    receipt_id = data.pop("receipt_id", None)
    if {"type", "amount", "account_id", "target_account_id"} & data.keys():
        merged = TransactionCreate(**{**{k: getattr(tx, k) for k in (
            "type", "amount", "currency", "account_id", "target_account_id", "category_id", "counterparty_id",
        )}, **data})
        await _validate_refs(db, current, merged)
        if merged.type != tx.type:
            data["type"] = merged.type
        data["target_account_id"] = merged.target_account_id
    for k, v in data.items():
        if k == "tag_ids":
            tx.tags = list((await db.execute(select(Tag).where(Tag.id.in_(v), Tag.family_id == current.family_id))).scalars().all()) if v else []
        else:
            setattr(tx, k, v)
    mark_accounts_dirty(db, set(old_ids) | set(affected_account_ids(tx)))
    await db.flush()
    await _refresh_noload(db, tx)
    return _to_out(tx)


@router.delete("/{tx_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_transaction(tx_id: str, db: DbDep, current: CurrentUserDep) -> None:
    tx = await _load_full(db, parse_uuid(tx_id))
    if tx is None or tx.family_id != current.family_id or tx.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Транзакция не найдена")
    # ТЗ 4.2: owner может удалять транзакции любого участника; member — только свои
    if tx.author_id != current.user.id and not current.is_owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Можно удалять только свои транзакции")
    tx.deleted_at = datetime.now(timezone.utc)
    mark_accounts_dirty(db, affected_account_ids(tx))
    await db.flush()


# ---------- Переводы (ТЗ 9: GET/POST/DELETE /transfers) ----------


@router.get("/transfers/list", response_model=list[dict])
async def list_transfers(db: DbDep, current: CurrentUserDep, limit: int = Query(100, le=500)) -> list[dict]:
    stmt = (
        select(Transaction)
        .where(
            Transaction.family_id == current.family_id,
            Transaction.type == TransactionType.TRANSFER,
            Transaction.deleted_at.is_(None),
        )
        .order_by(Transaction.occurred_at.desc())
        .limit(limit)
    )
    return [_to_out(t) for t in (await db.execute(stmt)).scalars().all()]


transfer_router = APIRouter(dependencies=[Depends(csrf_guard)])


@transfer_router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_transfer(body: TransferCreate, db: DbDep, current: CurrentUserDep) -> dict:
    fam = current.family_id
    ids = {body.from_account_id, body.to_account_id}
    n = (await db.execute(select(func.count(Account.id)).where(Account.id.in_(ids), Account.family_id == fam))).scalar_one()
    if n != len(ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Счёт не найден в вашей семье")
    tx = Transaction(
        family_id=fam,
        author_id=current.user.id,
        type=TransactionType.TRANSFER,
        amount=body.amount,
        currency=body.currency.upper(),
        account_id=body.from_account_id,
        target_account_id=body.to_account_id,
        occurred_at=body.occurred_at or datetime.now(timezone.utc),
        comment=body.comment,
    )
    db.add(tx)
    await db.flush()
    mark_accounts_dirty(db, affected_account_ids(tx))
    await _refresh_noload(db, tx)
    return _to_out(tx)
