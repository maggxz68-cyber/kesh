"""Отправка писем (восстановление пароля). Без SMTP — вывод ссылки в лог (ТЗ 5.3 для MVP)."""
from __future__ import annotations

from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings
from loguru import logger


async def send_email(to: str, subject: str, body: str) -> None:
    if not settings.smtp_host:
        logger.info(f"[EMAIL-DRY-RUN] to={to} subject={subject!r}\n{body}")
        return
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user or None,
            password=settings.smtp_password or None,
            start_tls=settings.smtp_tls,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error(f"SMTP send failed: {exc}; письмо продублировано в лог\n{body}")
