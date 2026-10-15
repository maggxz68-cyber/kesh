"""Middleware: CSRF-exempt флаги для публичных маршрутов + запрос-логирование.

ВАЖНО: НЕ используем BaseHTTPMiddleware — он создаёт новый event loop для каждого
запроса, что ломает asyncpg (RuntimeError: got Future attached to a different loop).
Вместо этого используем обычные ASGI middleware через @app.middleware("http").
"""
from __future__ import annotations

from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.logging import logger

# Публичные маршруты без сессии — CSRF к ним неприменим, защищаем rate-limit'ом
CSRF_EXEMPT_PATHS = {
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/demo-login",
    "/api/auth/refresh",
    "/api/auth/logout",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/superadmin/login",
    "/api/health",
    "/api/currencies/rates/refresh",
    "/api/transactions/import/preview",
    "/api/transactions/import/commit",
}


class CsrfExemptMiddleware:
    """ASGI middleware: помечает публичные маршруты как csrf_exempt."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            path = scope.get("path", "")
            if path in CSRF_EXEMPT_PATHS:
                # Создаём request-объект только если нужно (лениво)
                scope["state"] = scope.get("state", {})
                scope["state"]["csrf_exempt"] = True
        await self.app(scope, receive, send)


class AccessLogMiddleware:
    """ASGI middleware: логирует запросы без создания нового event loop."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            path = scope.get("path", "")
            method = scope.get("method", "")
            # Логируем ДО обработки (без await call_next, который создаёт loop)
            logger.bind(route=path, method=method).debug("request_start")
        await self.app(scope, receive, send)
