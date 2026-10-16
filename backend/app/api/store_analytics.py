from typing import Annotated
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from datetime import datetime, timedelta
from pydantic import BaseModel

from app.core.deps import DbDep, CurrentUser, get_current_user
from app.models.transaction import Transaction
from app.models.receipt import Receipt, ReceiptTransaction

router = APIRouter(prefix="", tags=["Store Analytics"])

CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]

class StoreSpendingItem(BaseModel):
    store_name: str
    total_spent: float

@router.get("/store-spending", response_model=list[StoreSpendingItem])
async def get_store_spending(
    db: DbDep,
    current: CurrentUserDep,
    days: int = Query(30, ge=1, le=365, description="Период в днях")
):
    """Возвращает топ магазинов по сумме трат за указанный период."""
    since = datetime.utcnow() - timedelta(days=days)
    
    # Правильный JOIN через промежуточную таблицу ReceiptTransaction (M:N связь)
    stmt = (
        select(
            Receipt.store_name,
            func.sum(Transaction.amount).label("total_spent")
        )
        .join(ReceiptTransaction, ReceiptTransaction.transaction_id == Transaction.id)
        .join(Receipt, Receipt.id == ReceiptTransaction.receipt_id)
        .where(
            Transaction.family_id == current.family_id,
            Transaction.type == "expense",
            Transaction.occurred_at >= since,
            Receipt.store_name.isnot(None),
            Receipt.store_name != ""
        )
        .group_by(Receipt.store_name)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(10)  # Топ-10 магазинов
    )
    
    result = await db.execute(stmt)
    rows = result.all()
    
    return [
        StoreSpendingItem(
            store_name=row.store_name or "Неизвестный магазин",
            total_spent=float(row.total_spent)
        )
        for row in rows
    ]
