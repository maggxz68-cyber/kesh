"""Фоновые задачи (запускается отдельным контейнером ff-scheduler).

Этап 1: каркас. Реализация — на этапах 3/6:
- cleanup_expired_sandboxes(): удаление sandbox-копий демо-семьи по TTL (24ч);
- daily_demo_reset(): сброс общей демо-семьи к эталонному seed-состоянию.
"""
import time

from loguru import logger

from app.core.config import settings

CHECK_INTERVAL_SEC = 3600


def run_once() -> None:
    # TODO (этап 3): async-сессия -> services.sandbox.cleanup(settings.sandbox_ttl_hours)
    # TODO (этап 6): daily demo reset, если settings.demo_reset_enabled
    logger.info("scheduler tick (no-op on stage 1)")


def main() -> None:
    from app.core.logging import setup_logging

    setup_logging()
    logger.info(f"scheduler started (interval={CHECK_INTERVAL_SEC}s, tz={settings.tz})")
    while True:
        try:
            run_once()
        except Exception as exc:  # noqa: BLE001
            logger.exception(f"scheduler error: {exc}")
        time.sleep(CHECK_INTERVAL_SEC)


if __name__ == "__main__":
    main()
