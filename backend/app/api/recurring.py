"""API для управления регулярными платежами и подписками."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep, get_current_user
from app.models.recurring import RecurringPayment
from app.models.transaction import Transaction, TransactionType

router = APIRouter(tags=["recurring"])
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


class RecurringPaymentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    amount: Decimal = Field(..., gt=0)
    currency: str = "RUB"
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    counterparty_id: uuid.UUID | None = None
    period_type: str = Field(default="monthly", pattern="^(daily|weekly|monthly|yearly|custom)$")
    period_days: int | None = Field(default=None, ge=1)
    start_date: date
    end_date: date | None = None
    next_due_date: date
    notify_days_before: int = Field(default=3, ge=0, le=30)
    comment: str | None = None
    transaction_type: str = Field(default="expense", pattern="^(expense|income|transfer)$")


class RecurringPaymentUpdate(BaseModel):
    name: str | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    counterparty_id: uuid.UUID | None = None
    period_type: str | None = None
    period_days: int | None = None
    end_date: date | None = None
    next_due_date: date | None = None
    is_active: bool | None = None
    notify_days_before: int | None = None
    comment: str | None = None


def _calculate_next_due(current: date, period_type: str, period_days: int | None) -> date:
    if period_type == "daily":
        return current + timedelta(days=1)
    elif period_type == "weekly":
        return current + timedelta(weeks=1)
    elif period_type == "monthly":
        month = current.month + 1
        year = current.year + month // 12
        month = month % 12 or 12
        day = min(current.day, 28)
        return date(year, month, day)
    elif period_type == "yearly":
        return current.replace(year=current.year + 1)
    elif period_type == "custom" and period_days:
        return current + timedelta(days=period_days)
    return current + timedelta(days=30)


@router.post("")
async def create_recurring(payload: RecurringPaymentCreate, db: DbDep, current: CurrentUserDep) -> dict:
    rp = RecurringPayment(
        family_id=current.family_id,
        name=payload.name,
        amount=payload.amount,
        currency=payload.currency,
        account_id=payload.account_id,
        category_id=payload.category_id,
        counterparty_id=payload.counterparty_id,
        period_type=payload.period_type,
        period_days=payload.period_days,
        start_date=payload.start_date,
        end_date=payload.end_date,
        next_due_date=payload.next_due_date,
        notify_days_before=payload.notify_days_before,
        comment=payload.comment,
        transaction_type=payload.transaction_type,
    )
    db.add(rp)
    await db.commit()
    await db.refresh(rp)
    return {"id": str(rp.id), "name": rp.name, "amount": float(rp.amount), "next_due_date": rp.next_due_date.isoformat()}


@router.get("")
async def list_recurring(db: DbDep, current: CurrentUserDep, active_only: bool = Query(True)) -> list[dict]:
    stmt = select(RecurringPayment).where(RecurringPayment.family_id == current.family_id)
    if active_only:
        stmt = stmt.where(RecurringPayment.is_active.is_(True))
    stmt = stmt.order_by(RecurringPayment.next_due_date.asc())
    
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "amount": float(r.amount),
            "currency": r.currency,
            "period_type": r.period_type,
            "period_days": r.period_days,
            "next_due_date": r.next_due_date.isoformat() if r.next_due_date else None,
            "last_paid_date": r.last_paid_date.isoformat() if r.last_paid_date else None,
            "is_active": r.is_active,
            "account_id": str(r.account_id) if r.account_id else None,
            "category_id": str(r.category_id) if r.category_id else None,
            "comment": r.comment,
            "transaction_type": r.transaction_type,
            "days_until_due": (r.next_due_date - date.today()).days if r.next_due_date else None,
        }
        for r in rows
    ]


@router.get("/upcoming")
async def upcoming_payments(db: DbDep, current: CurrentUserDep, days_ahead: int = Query(30, ge=1, le=365)) -> list[dict]:
    today = date.today()
    cutoff = today + timedelta(days=days_ahead)
    stmt = select(RecurringPayment).where(
        RecurringPayment.family_id == current.family_id,
        RecurringPayment.is_active.is_(True),
        RecurringPayment.next_due_date >= today,
        RecurringPayment.next_due_date <= cutoff,
    ).order_by(RecurringPayment.next_due_date.asc())
    
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {"id": str(r.id), "name": r.name, "amount": float(r.amount), "next_due_date": r.next_due_date.isoformat(), "days_until_due": (r.next_due_date - today).days}
        for r in rows
    ]


@router.patch("/{payment_id}")
async def update_recurring(payment_id: str, payload: RecurringPaymentUpdate, db: DbDep, current: CurrentUserDep) -> dict:
    rp = await db.get(RecurringPayment, uuid.UUID(payment_id))
    if not rp or rp.family_id != current.family_id:
        raise HTTPException(404, "Платёж не найден")
    
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rp, field, value)
    
    await db.commit()
    await db.refresh(rp)
    return {"id": str(rp.id), "name": rp.name, "next_due_date": rp.next_due_date.isoformat()}


@router.delete("/{payment_id}")
async def delete_recurring(payment_id: str, db: DbDep, current: CurrentUserDep) -> dict:
    rp = await db.get(RecurringPayment, uuid.UUID(payment_id))
    if not rp or rp.family_id != current.family_id:
        raise HTTPException(404, "Платёж не найден")
    
    await db.delete(rp)
    await db.commit()
    return {"deleted": True}


@router.post("/{payment_id}/run")
async def run_recurring(payment_id: str, db: DbDep, current: CurrentUserDep) -> dict:
    rp = await db.get(RecurringPayment, uuid.UUID(payment_id))
    if not rp or rp.family_id != current.family_id:
        raise HTTPException(404, "Платёж не найден")
    
    tx_type = TransactionType(rp.transaction_type)
    tx = Transaction(
        family_id=current.family_id,
        type=tx_type,
        amount=rp.amount,
        currency=rp.currency,
        account_id=rp.account_id,
        category_id=rp.category_id,
        counterparty_id=rp.counterparty_id,
        occurred_at=datetime.now(timezone.utc),
        comment=f"Авто: {rp.name}" + (f" ({rp.comment})" if rp.comment else ""),
        author_id=current.id,
    )
    db.add(tx)
    
    rp.last_paid_date = date.today()
    rp.next_due_date = _calculate_next_due(rp.next_due_date, rp.period_type, rp.period_days)
    
    await db.commit()
    await db.refresh(rp)
    return {"transaction_id": str(tx.id), "next_due_date": rp.next_due_date.isoformat()}
