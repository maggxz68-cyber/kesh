"""QR-коды фискальных чеков РФ (ТЗ 2/7.4): декодирование pyzbar + проверка через ФНС.

Формат payload: `t=<12hex>&s=<sum2>&n=<fd>&fn=<ФН>&fp=<10hex>&dt=<YYYYMMDD>&i=<№к&го>`
Проверка: POST на fns_check_api_url (prochecksum.gov.ru; ключ в .env). Без ключа —
возвращаем None (оффлайн-режим), реквизиты из самого QR используются.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from pathlib import Path

_QR_TAG_RE = re.compile(r"(?:^|&)t=([0-9a-fA-F]{12})")


@dataclass
class FnPayload:
    type_tag: int = 0          # t: тип фискального документа
    sum2: Decimal = Decimal("0")  # s: сумма чека коп./руб. (fmt=2 -> копейки? нет: fmt=2 => делим на 100)
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


def parse_payload(payload: str) -> FnPayload | None:
    """Разбор стандартного TLV-payload QR ФНС."""
    if not payload or not _QR_TAG_RE.search(payload):
        return None
    parts = dict(re.findall(r"(?:^|&)(&?\w+)=(.*?)$", payload) and [] or [])
    kv: dict[str, str] = {}
    for chunk in payload.split("&"):
        if "=" in chunk:
            k, v = chunk.split("=", 1)
            kv[k.lstrip("&")] = v
    try:
        p = FnPayload(
            type_tag=int(kv.get("t", ""), 16) if "t" in kv else 0,
            sum2=Decimal(kv.get("s", "0")) / 100 if "s" in kv else Decimal("0"),
            fd=int(kv.get("n", 0)),
            fn=kv.get("fn", ""),
            fp=kv.get("fp", ""),
            date=datetime.strptime(kv["dt"], "%Y%m%dT%H%M%S") if "dt" in kv else None,
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
