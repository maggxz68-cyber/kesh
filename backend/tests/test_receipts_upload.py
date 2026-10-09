"""Регресс-тест: POST /receipts/upload не должен отдавать 500 (Internal Server Error),
даже если pyzbar/tesseract отсутствуют в окружении (fallback FAILED + meta.parse_error).
"""
from __future__ import annotations

import io

import pytest


async def _login_demo(client):
    r = await client.post("/api/auth/demo-login", json={})
    assert r.status_code in (200, 201), r.text
    return r


def _csrf(client):
    tok = client.cookies.get("csrf_token")
    assert tok, "csrf cookie не выставлен при demo-login"
    return {"X-CSRF-Token": tok}


async def test_upload_receipt_no_ocr_tools(client):
    await _login_demo(client)
    h = _csrf(client)
    # минимальный валидный PNG (1x1 пиксель)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
        b"\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00"
        b"\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    files = {"file": ("receipt.png", io.BytesIO(png_bytes), "image/png")}
    r = await client.post("/api/receipts/upload?auto_parse=true", files=files, headers=h)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["id"]
    # parse_status может быть failed/raw/none — но не 500; items_total обязан присутствовать
    assert "items_total" in body
    assert body["parse_status"] in ("failed", "raw", "parsed_ocr", "parsed_qr", "parsing")
    assert isinstance(body["items"], list)

    # список чеков тоже не падает
    r2 = await client.get("/api/receipts")
    assert r2.status_code == 200, r2.text
    assert len(r2.json()) >= 1

    # явный повторный парсинг не должен давать 500
    rid = body["id"]
    r3 = await client.post(f"/api/receipts/{rid}/parse", headers=h)
    assert r3.status_code == 200, r3.text
    assert r3.json()["method"] in ("qr", "ocr", "none")
