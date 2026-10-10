"""Разовое исправление: привязка категорий к существующим транзакциям без category_id.

Запуск на сервере (в контейнере backend):
    docker compose exec backend python -m app.services.fix_categories
    docker compose exec backend python -m app.services.fix_categories --demo-only

Опции:
    --reset   сначала удалить демо-транзакции эталонной демо-семьи и пересоздать
              их через seed (полный цикл с корректными category_id);
    --demo-only  чинить только транзакции демо-семьи (по умолчанию — все семьи).

Скрипт идемпотентен: трогает только строки с category_id IS NULL, ничего не
удаляет (без --reset) и может запускаться многократно.
"""
from __future__ import annotations

import argparse
import asyncio
import logging

from sqlalchemy import delete, select

from app.db.session import SessionLocal as AsyncSessionLocal
from app.models.family import Family
from app.models.transaction import Transaction
from app.services.seed import assign_missing_categories, run_seed

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("fix_categories")


async def _demo_family_ids(session) -> list:
    return list(
        (await session.execute(select(Family.id).where(Family.is_demo.is_(True)))).scalars().all()
    )


async def main(*, reset: bool, demo_only: bool) -> None:
    async with AsyncSessionLocal() as db:
        if reset:
            fam_ids = await _demo_family_ids(db)
            if fam_ids:
                stmt = delete(Transaction).where(Transaction.family_id.in_(fam_ids))
                res = await db.execute(stmt)
                logger.info(f"--reset: удалено демо-транзакций: {res.rowcount}")
                await db.commit()
            # Полный пересоздающий цикл: супер-админ + демо-семья + транзакции с category_id
            await run_seed(db)
            logger.info("--reset: seed выполнен, транзакции пересозданы с категориями")
            return

        family_ids = await _demo_family_ids(db) if demo_only else None
        fixed = await assign_missing_categories(db, family_ids=family_ids)
        await db.commit()
        left = (
            await db.execute(
                select(Transaction.id)
                .where(Transaction.category_id.is_(None))
                .limit(1)
            )
        ).scalar_one_or_none()
        scope = "демо-семья" if demo_only else "все семьи"
        logger.info(f"Готово ({scope}): привязано категорий: {fixed}; осталось без категории: {'нет' if left is None else 'да'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Привязка категорий к транзакциям без них")
    parser.add_argument("--reset", action="store_true", help="пересоздать демо-данные через seed")
    parser.add_argument("--demo-only", action="store_true", help="чинить только демо-семью")
    args = parser.parse_args()
    asyncio.run(main(reset=args.reset, demo_only=args.demo_only))
