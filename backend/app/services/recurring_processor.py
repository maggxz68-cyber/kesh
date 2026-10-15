"""Обработчик регулярных платежей для scheduler."""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select

from app.core.db import async_session
from app.models.recurring import RecurringPayment
from app.models.transaction import Transaction, TransactionType

logger = logging.getLogger(__name__)


def _calculate_next_due(current: date, period_type: str, period_days: int | None) -> date:
    """Вычисляет следующую дату платежа."""
    from datetime import timedelta
    
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


async def process_recurring_payments() -> int:
    """
    Проверяет все активные регулярные платежи и создаёт транзакции
    для тех, у которых next_due_date <= сегодня.
    Возвращает количество созданных транзакций.
    """
    today = date.today()
    created_count = 0
    
    async with async_session() as session:
        # Находим все активные платежи с next_due_date <= сегодня
        stmt = (
            select(RecurringPayment)
            .where(
                RecurringPayment.is_active.is_(True),
                RecurringPayment.next_due_date <= today,
            )
            .order_by(RecurringPayment.next_due_date.asc())
        )
        
        result = await session.execute(stmt)
        payments = result.scalars().all()
        
        logger.info(f"Найдено {len(payments)} регулярных платежей для обработки")
        
        for rp in payments:
            try:
                # Создаём транзакцию
                tx_type = TransactionType(rp.transaction_type)
                tx = Transaction(
                    family_id=rp.family_id,
                    type=tx_type,
                    amount=rp.amount,
                    currency=rp.currency,
                    account_id=rp.account_id,
                    category_id=rp.category_id,
                    counterparty_id=rp.counterparty_id,
                    occurred_at=datetime.now(timezone.utc),
                    comment=f"Авто: {rp.name}" + (f" ({rp.comment})" if rp.comment else ""),
                )
                session.add(tx)
                
                # Обновляем даты
                rp.last_paid_date = today
                rp.next_due_date = _calculate_next_due(
                    rp.next_due_date, rp.period_type, rp.period_days
                )
                
                created_count += 1
                logger.info(f"✅ Создана транзакция для '{rp.name}' (сумма: {rp.amount})")
                
            except Exception as e:
                logger.error(f"❌ Ошибка при обработке '{rp.name}': {e}")
                continue
        
        await session.commit()
    
    logger.info(f"Всего создано транзакций: {created_count}")
    return created_count
