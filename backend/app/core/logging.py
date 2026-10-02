"""Настройка loguru: структурированные логи в файл (volume backend_logs) + stdout."""
import sys

from loguru import logger

from app.core.config import settings


def setup_logging() -> None:
    logger.remove()
    logger.add(
        sys.stdout,
        level="DEBUG" if settings.app_env == "development" else "INFO",
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    )
    logger.add(
        settings.log_path,
        rotation="50 MB",
        retention="30 days",
        compression="zip",
        level="INFO",
        serialize=False,
        enqueue=True,  # безопасно для нескольких workers
    )
