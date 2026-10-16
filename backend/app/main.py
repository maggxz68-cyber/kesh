"""Главный файл приложения FastAPI."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.middleware import CsrfExemptMiddleware
from loguru import logger

from app.api import (
    accounts,
    receipts,
    store_analytics,
    auth,
    families,
    budgets,
    categories,
    currencies,
    recurring,
    reports,
    transactions,
)
from app.core.config import settings
from app.services.seed import ensure_demo_data

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting Family Finance Tracker env={getattr(settings, 'env', 'production')}")
    # ensure_demo_data()  # Отключено для стабильности event loop
    # logger.info("✅ Демо-данные созданы/обновлены")
    yield
    logger.info("Shutting down")

app = FastAPI(title="Family Finance Tracker", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутеров (ВСЕГДА после создания app = FastAPI())
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(accounts.router, prefix="/api/accounts", tags=["accounts"])
app.include_router(receipts.router, prefix="/api/receipts", tags=["receipts"])
app.include_router(families.router, prefix="/api/families", tags=["families"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(budgets.router, prefix="/api/budgets", tags=["budgets"])
app.include_router(currencies.router, prefix="/api/currencies", tags=["currencies"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(store_analytics.router, prefix="/api/reports", tags=["store-analytics"])
app.include_router(recurring.router, prefix="/api/recurring", tags=["recurring"])

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
