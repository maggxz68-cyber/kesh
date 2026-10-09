"""QR-коды фискальных чеков РФ (ТЗ 2/7.4): декодирование pyzbar + проверка через ФНС.

Формат payload: `t=<12hex>&s=<sum2>&n=<fd>&fn=<ФН>&fp=<10hex>&dt=<YYYYMMDD>&i=<№к&го>`
Проверка: POST на fns_check_api_url (prochecksum.gov.ru; ключ в .env). Без ключа —
возвращаем None (оффлайн-режим), реквизиты из самого QR используются.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from pathlib import Path

logger = logging.getLogger(__name__)

# Типы фискальных документов (Приказ ФНС № ММВ-7-20/538@, tlvTag «т»):
# приходные чеки — 1..4, возврат прихода — 11..14, расходные — 21..24, возврат расхода — 31..34.
_INCOME_TAGS = set(range(1, 5)) | set(range(11, 15))
_EXPENSE_TAGS = set(range(21, 25)) | set(range(31, 35))


@dataclass
class FnPayload:
    type_tag: int = 0          # t: тип фискального документа
    sum2: Decimal = Decimal("0")  # s: сумма чека в рублях (fmt=2) либо копейках (fmt=3)
    fd: int = 0                # n: номер ФД
    fn: str = ""               # fn: номер ФН
    fp: str = ""               # fp: фискальный признак (10 hex)
    date: datetime | None = None  # dt
    receipt_number: str = ""   # i=<к&го> → №К (через &)
    raw: str = ""
    meta: dict = field(default_factory=dict)

    @property
    def fiscal_sign(self) -> str:
        return self.fp

    @property
    def operation_type(self) -> str:
        """'income' для приходных ФД, иначе 'expense' (расходный чек — по умолчанию)."""
        return "income" if self.type_tag in _INCOME_TAGS else "expense"


def decode_qr(image_path: str | Path) -> str | None:
    """Декодировать первый QR со снимка. Возвращает payload-строку или None."""
    from pyzbar.pyzbar import decode as zbar_decode  # lazy
    from PIL import Image

    with Image.open(str(image_path)) as im:
        results = zbar_decode(im)
    for r in results:
        if r.type == "QRCODE":
            try:
                return r.data.decode("utf-8", errors="replace")
            except Exception:  # noqa: BLE001
                continue
    return None


def _parse_sum(value: str, fmt: int | None) -> Decimal:
    """Сумма из параметра s. fmt=2 → рубли с дробью; fmt=3/4 → копейки (целое).

    Без fmt: если значение целое и > 10000 — трактуем как копейки, иначе рубли.
    Разделитель может быть точкой или запятой.
    """
    v = value.strip().replace(",", ".")
    try:
        d = Decimal(v)
    except Exception:  # noqa: BLE001
        return Decimal("0")
    if fmt in (3, 4):
        return d / 100
    if fmt == 2 or "." in v:
        return d
    # fmt отсутствует/неизвестен: целое большое число похоже на копейки
    if d == d.to_integral_value() and d > 10000:
        return d / 100
    return d


def parse_payload(payload: str) -> FnPayload | None:
    """Разбор стандартного TLV-payload QR ФНС.

    Поддерживаются оба распространённых формата:
      * классический: `t=<12 hex>&s=<сумма коп.>&fn=...&fp=<10hex>&dt=<YYYYMMDD>`
      * упрощённый (современные ККТ/агрегаторы): `t=1&s=369.99&fn=...&i=...&fp=...&n=1[&dt=...]`
    """
    if not payload or "&" not in payload or "t=" not in payload or "s=" not in payload:
        logger.warning(f"QR-код не похож на ФНС (нет t=&...): {payload[:100]!r} — fallback на OCR")
        return None
    logger.info(f"Сырой QR-код ФНС: {payload[:200]}")
    kv: dict[str, str] = {}
    for chunk in payload.split("&"):
        if "=" in chunk:
            k, v = chunk.split("=", 1)
            kv[k.lstrip("&").strip()] = v.strip()
    if not kv.get("t"):
        return None
    try:
        raw_t = kv["t"]
        date = None
        if re.fullmatch(r"[0-9a-fA-F]{12}", raw_t):
            type_tag = int(raw_t[:2], 16)          # старший байт 12-hex тега типа
        elif re.fullmatch(r"\d{8}T?\d{4,6}", raw_t):
            # t=YYYYMMDDHHMM / t=YYYYMMDDTHHMM / t=YYYYMMDDHHMMSS / t=YYYYMMDDTHHMMSS
            # Современные ККТ часто выдают формат без секунд (t=20260926T0834)
            type_tag = 0
            clean_t = raw_t.replace("T", "")
            try:
                if len(clean_t) == 12:
                    date = datetime.strptime(clean_t, "%Y%m%d%H%M")
                elif len(clean_t) == 14:
                    date = datetime.strptime(clean_t, "%Y%m%d%H%M%S")
            except ValueError:
                pass
        elif re.fullmatch(r"\d+", raw_t):
            type_tag = int(raw_t)
        else:
            logger.warning(f"Неизвестный формат тега t={raw_t!r} — fallback на OCR")
            return None
        if "dt" in kv:
            dt_v = kv["dt"]
            for fmt_d in ("%Y%m%dT%H%M%S", "%Y%m%d%H%M%S", "%Y%m%d"):
                try:
                    date = datetime.strptime(dt_v, fmt_d)
                    break
                except ValueError:
                    continue
        p = FnPayload(
            type_tag=type_tag,
            sum2=_parse_sum(kv.get("s", "0"), int(kv["fmt"]) if kv.get("fmt", "").isdigit() else None),
            fd=int(kv.get("n", 0) or 0),
            fn=kv.get("fn", ""),
            fp=kv.get("fp", ""),
            date=date,
            receipt_number=kv.get("i", "").split("&")[0],
            raw=payload,
            meta=kv,
        )
        return p
    except (ValueError, IndexError):
        return None


async def check_receipt(p: FnPayload) -> dict | None:
    """Запрос статуса чека в ФНС-шлюзе. None — если шлюз не настроен/недоступен."""
    from app.core.config import settings

    if not settings.fns_check_api_key or not p.fn:
        return None
    try:
        import httpx

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                settings.fns_check_api_url,
                json={
                    "receipt": {
                        "fn": p.fn,
                        "fd": p.fd,
                        "fpd": p.fp,
                        "date": p.date.isoformat() if p.date else None,
                    },
                    "signature": "",
                },
                headers={"Authorization": f"Bearer {settings.fns_check_api_key}"},
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception:  # noqa: BLE001 - сеть может быть недоступна
        return None
    return None


def payload_to_json(p: FnPayload) -> str:
    return json.dumps(p.meta, ensure_ascii=False)
