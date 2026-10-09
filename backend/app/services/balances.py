"""Автопересчёт кэшированных балансов счетов (источник истины — проводки).

Решение не использует ORM-хуки: в async-сессии mapper-события after_insert/
after_update исполняются внутри sync-bridge, и надёжно «поймать» там именно тот
объект AsyncSession, из которого делается commit(), невозможно (см. историю этапа 2).
Поэтому явный контракт: любой сервис/CRUD, изменяющий транзакции, вызывает
mark_accounts_dirty(session, [...]) ПЕРЕД session.commit(); FamilySession.commit()
перед коммитом пересчитывает накопленные счета.
"""
from __future__ import annotations

import uuid as _uuid
from decimal import Decimal

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession


def affected_account_ids(tx) -> list[_uuid.UUID]:
    """Счета, которых касается проводка tx (источник + приёмник для transfer)."""
    ids = [getattr(tx, "account_id", None), getattr(tx, "target_account_id", None)]
    return [i for i in ids if i is not None]


def mark_accounts_dirty(session, account_ids) -> None:
    """Отметить счета для пересчёта баланса перед ближайшим commit().

    Ключевая тонкость: в async-сессии INSERT/UPDATE исполняются внутри greenlet
    sync-bridge (AsyncSession.run_sync), и mapper-события (после удаления хуков —
    наши явные вызовы из сервисов) могут получить другую сторону пары сессий.
    Поэтому накапливаем множество в СНАПШЭТНОМ словаре session.info — он один и
    тот же объект для AsyncSession и её sync-обёртки на протяжении всей сессии.
    """
    ids = [i for i in account_ids if i is not None]
    if not ids:
        return
    dirty = session.info.setdefault("dirty_accounts", set())
    dirty.update(ids)


async def recalc_account_balance(session: AsyncSession, account_id: _uuid.UUID | None) -> None:
    """Пересчёт баланса одного счёта по всем живым проводкам.

    UPDATE идёт через Core (synchronize_session=False), затем свежее значение
    устанавливается в ORM-объект через set_committed_value — это помечает
    атрибут loaded/чистым без дополнительного SELECT и без риска, что объект
    станет dirty (иначе последующий autoflush при ленивой загрузке связей
    утащил бы UPDATE в чужой greenlet → MissingGreenlet).
    """
    if account_id is None:
        return
    from sqlalchemy.orm.attributes import set_committed_value

    from app.models.reference import Account
    from app.models.transaction import Transaction

    acc = await session.get(Account, account_id)
    if acc is None:
        return
    T = Transaction.__table__
    live = T.c.deleted_at.is_(None)

    outflow = (
        await session.execute(
            select(func.coalesce(func.sum(T.c.amount), 0)).where(
                T.c.account_id == account_id, live, T.c.type.in_(["expense", "transfer"])
            )
        )
    ).scalar_one()
    income = (
        await session.execute(
            select(func.coalesce(func.sum(T.c.amount), 0)).where(
                T.c.account_id == account_id, live, T.c.type == "income"
            )
        )
    ).scalar_one()
    transfers_in = (
        await session.execute(
            select(func.coalesce(func.sum(T.c.amount), 0)).where(
                T.c.target_account_id == account_id, live, T.c.type == "transfer"
            )
        )
    ).scalar_one()

    # transfer: исходящий учтён в outflow (сумма expense+transfer), входящий — прибавляем отдельно
    new_balance = acc.opening_balance + Decimal(income) + Decimal(transfers_in) - Decimal(outflow)

    await session.execute(
        update(Account.__table__)
        .where(Account.__table__.c.id == account_id)
        .values(balance=new_balance)
        .execution_options(synchronize_session=False)
    )
    set_committed_value(acc, "balance", new_balance)


async def apply_pending_balance_recalc(session: AsyncSession) -> None:
    """Пересчёт всех «грязных» счетов. Вызывается из FamilySession.commit()."""
    dirty = session.info.pop("dirty_accounts", None) or set()
    if not dirty:
        return
    for acc_id in sorted(dirty, key=str):
        await recalc_account_balance(session, acc_id)
