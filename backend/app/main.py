"""Family Finance Tracker — backend entrypoint (этап 1: пустые сервисы, проверка запуска)."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.core.config import settings
from app.core.logging import setup_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info(f"Starting {settings.app_name} env={settings.app_env}")
    # Инициализация пула БД / кэша rate-limiter будет добавлена на этапе 2+
    yield
    logger.info("Shutting down")


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API-роутеры подключаются по мере реализации этапов 3–5:
# from app.api import auth, superadmin, accounts, categories, transactions, receipts, budgets, reports, families, export
# app.include_router(auth.router, prefix="/api/auth", tags=["auth"])


@app.get("/api/health", tags=["system"])
async def health() -> dict[str, str]:
    """Liveness-проба для Docker HEALTHCHECK и nginx."""
    return {"status": "ok", "app": settings.app_name, "env": settings.app_env}
