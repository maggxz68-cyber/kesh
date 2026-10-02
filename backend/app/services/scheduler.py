"""Фоновые задачи (контейнер ff-scheduler, ТЗ 5.2/11).

- cleanup_expired_sandboxes(): удаление sandbox-копий демо-семьи по TTL (24ч);
- daily_demo_reset(): сброс общей демо-семьи к эталонному seed-состоянию раз в сутки.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from shutil import rmtree

from loguru import logger
from sqlalchemy import delete, select

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.family import Family

CHECK_INTERVAL_SEC = 3600


async def cleanup_expired_sandboxes() -> int:
    """Удалить sandbox-семьи с истёкшим TTL вместе с их файлами чеков."""
    now = datetime.now(timezone.utc)
    removed = 0
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(Family.id).where(
                    Family.is_sandbox.is_(True),
                    Family.expires_at.is_not(None),
                )
            )
        ).all()
        for (fid,) in rows:
            fam = await db.get(Family, fid)
            if fam is None:
                continue
            # expires_at может быть naive из SQLite — нормализуем
            exp = fam.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp > now:
                continue
            receipts_dir = Path(settings.receipts_dir) / str(fid)
            await db.delete(fam)  # каскады удалят все данные семьи
            await db.commit()
            if receipts_dir.exists():
                rmtree(receipts_dir, ignore_errors=True)
            removed += 1
    if removed:
        logger.info(f"scheduler: удалено sandbox-семей: {removed}")
    return removed


async def daily_demo_reset() -> None:
    """Пересоздать демо-семью из seed (read-write общая демо + reset раз в сутки, ТЗ 5.2)."""
    from scripts.seed import reset_demo  # локальный импорт: скрипт кладётся в образ
    from app.services.seed import ensure_superadmin, seed_demo_family

    async with SessionLocal() as db:
        await reset_demo(db)
        await ensure_superadmin(db)
        await seed_demo_family(db)
        await db.commit()
    logger.info("scheduler: demo reset выполнен")


_last_reset_day: str | None = None


def _should_reset_today() -> bool:
    global _last_reset_day
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if _last_reset_day == today:
        return False
    _last_reset_day = today
    return True


async def tick() -> None:
    await cleanup_expired_sandboxes()
    if settings.demo_reset_enabled and settings.demo_mode and _should_reset_today():
        await daily_demo_reset()


def main() -> None:
    import asyncio

    from app.core.logging import setup_logging

    setup_logging()
    logger.info(f"scheduler started (interval={CHECK_INTERVAL_SEC}s, tz={settings.tz})")
    while True:
        try:
            asyncio.run(tick())
        except Exception as exc:  # noqa: BLE001
            logger.exception(f"scheduler error: {exc}")
        time.sleep(CHECK_INTERVAL_SEC)


if __name__ == "__main__":
    main()
