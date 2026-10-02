"""Seed (ТЗ 6/11): супер-админ admin/1968, демо-семья Ивановых, справочники, транзакции, чеки.

Запуск: python scripts/seed.py [--reset-demo]
Идемпотентен: повторный запуск не дублирует данные.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from loguru import logger  # noqa: E402

from app.core.logging import setup_logging  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.family import Family  # noqa: E402
from app.services.seed import ensure_superadmin, seed_demo_family  # noqa: E402


async def reset_demo(db) -> None:
    """Полный сброс демо-семьи к эталонному состоянию (для scheduler/`--reset-demo`)."""
    from sqlalchemy import delete, select

    from app.models.reference import Account, Category, Counterparty, Tag
    from app.models.receipt import Receipt
    from app.models.transaction import Budget, Transaction

    fam = (await db.execute(select(Family).where(Family.is_demo.is_(True), Family.is_sandbox.is_(False)))).scalar_one_or_none()
    if fam is None:
        logger.warning("reset-demo: демо-семья не найдена, seed создаст её")
        return
    for model in (Transaction, Budget, Receipt, Counterparty, Tag, Category, Account):
        await db.execute(delete(model).where(model.family_id == fam.id))
    await db.delete(fam)
    await db.flush()
    logger.info("reset-demo: демо-семья удалена, пересоздаём…")


async def main(reset: bool) -> None:
    setup_logging()
    async with SessionLocal() as db:
        if reset:
            await reset_demo(db)
        await ensure_superadmin(db)
        fam = await seed_demo_family(db)
        await db.commit()
        logger.info(f"seed OK: family={fam.name} id={fam.id}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed базы данных")
    parser.add_argument("--reset-demo", action="store_true", help="пересоздать демо-семью с нуля")
    args = parser.parse_args()
    asyncio.run(main(args.reset_demo))
