"""Family Finance Tracker — backend entrypoint."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.requests import Request

from app.api import (
    accounts,
    auth,
    budgets,
    categories,
    export,
    families,
    receipts,
    reports,
    superadmin_auth,
    transactions,
)
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.middleware import AccessLogMiddleware, CsrfExemptMiddleware
from app.core.security import limiter


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info(f"Starting {settings.app_name} env={settings.app_env}")
    yield
    logger.info("Shutting down")


app = FastAPI(
    title=settings.app_name,
    version="0.2.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# Rate limiting (ТЗ 10): лимиты объявлены декораторами @limiter.limit на роутерах
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(AccessLogMiddleware)
app.add_middleware(CsrfExemptMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(superadmin_auth.router, prefix="/api/superadmin", tags=["superadmin-auth"])
# Этап 4: CRUD (счета, категории, транзакции, переводы)
app.include_router(accounts.router, prefix="/api/accounts", tags=["accounts"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(transactions.transfer_router, prefix="/api/transfers", tags=["transfers"])
# Этап 4: бюджеты, чеки, отчёты, семья, экспорт
app.include_router(budgets.router, prefix="/api/budgets", tags=["budgets"])
app.include_router(receipts.router, prefix="/api/receipts", tags=["receipts"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(families.router, prefix="/api/families", tags=["families"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
# Роутер полного супер-админ API (этап 5) подключается по мере готовности


@app.get("/api/health", tags=["system"])
async def health() -> dict[str, str]:
    """Liveness-проба для Docker HEALTHCHECK и nginx."""
    return {"status": "ok", "app": settings.app_name, "env": settings.app_env}
