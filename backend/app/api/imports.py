"""API для импорта банковских выписок."""
from typing import Annotated, List, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime
from enum import Enum

from app.core.deps import DbDep, CurrentUser, get_current_user
from app.models.transaction import Transaction
from app.services.parsers.base import ParsedTransaction, TransactionType
from app.services.parsers.tinkoff import TinkoffParser
from sqlalchemy import select, func, and_

# Используем префикс, который ожидает фронтенд!
router = APIRouter(prefix="/api/transactions/import", tags=["Imports"])

CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


class TransactionTypeOut(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"


class TransactionPreview(BaseModel):
    date: datetime
    amount: float
    type: TransactionTypeOut
    description: str
    counterparty: Optional[str] = None
    category_hint: Optional[str] = None
    is_duplicate: bool = False


class ImportPreviewResponse(BaseModel):
    bank_name: str
    total_transactions: int
    total_income: float
    total_expense: float
    transactions: List[TransactionPreview]


class CommitImportRequest(BaseModel):
    account_id: str
    transactions: List[TransactionPreview]


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    file: UploadFile = File(...),
    current: CurrentUserDep = None,
    db: DbDep = None,
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Файл не выбран")
    
    content = await file.read()
    filename_lower = file.filename.lower()
    
    # Определяем парсер (пока Т-Банк как основной, остальные добавим по аналогии)
    if 'tinkoff' in filename_lower or 'тбанк' in filename_lower or 'т-банк' in filename_lower or 'справка' in filename_lower:
        parser = TinkoffParser()
    else:
        parser = TinkoffParser()
    
    try:
        transactions = parser.parse(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка парсинга: {str(e)}")
    
    if not transactions:
        raise HTTPException(status_code=400, detail="Не удалось найти транзакции в файле. Проверьте формат.")
    
    # Проверка на дубликаты
    for txn in transactions:
        stmt = select(Transaction.id).where(
            and_(
                Transaction.family_id == current.family_id,
                func.date(Transaction.occurred_at) == txn.date.date(),
                Transaction.amount == txn.amount,
                Transaction.type == ('income' if txn.type == TransactionType.INCOME else 'expense')
            )
        )
        result = await db.execute(stmt)
        if result.scalar():
            txn.is_duplicate = True
    
    total_income = sum(t.amount for t in transactions if t.type == TransactionType.INCOME)
    total_expense = sum(t.amount for t in transactions if t.type == TransactionType.EXPENSE)
    
    return ImportPreviewResponse(
        bank_name=parser.bank_name,
        total_transactions=len(transactions),
        total_income=total_income,
        total_expense=total_expense,
        transactions=[
            TransactionPreview(
                date=t.date,
                amount=t.amount,
                type=TransactionTypeOut.INCOME if t.type == TransactionType.INCOME else TransactionTypeOut.EXPENSE,
                description=t.description,
                counterparty=t.counterparty,
                category_hint=t.category_hint,
                is_duplicate=t.is_duplicate,
            )
            for t in transactions
        ],
    )


@router.post("/commit")
async def commit_import(
    payload: CommitImportRequest,
    current: CurrentUserDep = None,
    db: DbDep = None,
):
    """Создаёт транзакции в базе данных после подтверждения пользователем."""
    
    created_count = 0
    
    for txn in payload.transactions:
        if txn.is_duplicate:
            continue
            
        db_type = "income" if txn.type == TransactionTypeOut.INCOME else "expense"
        
        # Финальная проверка на дубликат прямо перед созданием
        stmt = select(Transaction.id).where(
            and_(
                Transaction.family_id == current.family_id,
                func.date(Transaction.occurred_at) == txn.date.date(),
                Transaction.amount == txn.amount,
                Transaction.type == db_type
            )
        )
        result = await db.execute(stmt)
        if result.scalar():
            continue
            
        # Формируем описание с категорией
        desc_with_category = txn.description + (f" ({txn.category_hint})" if txn.category_hint else "")
        
        # Создаём транзакцию. 
        # Примечание: если в твоей модели Transaction есть поле account_id, раскомментируй его ниже.
        # Сейчас привязываем к семье, а account_id можно добавить, если модель это требует.
        new_txn = Transaction(
            occurred_at=txn.date,
            amount=txn.amount,
            type=db_type,
            description=desc_with_category,
            counterparty=txn.counterparty,
            family_id=current.family_id,
            # account_id=payload.account_id,  # <-- Раскомментируй, если в модели Transaction есть это поле!
        )
        
        db.add(new_txn)
        created_count += 1
        
    await db.commit()
    
    return {
        "message": f"Успешно импортировано {created_count} транзакций",
        "created_count": created_count,
        "skipped_duplicates": len([t for t in payload.transactions if t.is_duplicate])
    }
