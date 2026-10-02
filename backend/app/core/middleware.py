"""Middleware: CSRF-exempt флаги для публичных маршрутов + запрос-логирование."""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

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
}


class CsrfExemptMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in CSRF_EXEMPT_PATHS:
            request.state.csrf_exempt = True
        return await call_next(request)


class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        logger.bind(route=request.url.path, method=request.method, status=response.status_code).debug("request")
        return response
