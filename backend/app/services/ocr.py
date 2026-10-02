"""OCR чеков (ТЗ 2/7.4): Tesseract + OpenCV предобработка.

Импорты тяжёлых зависимостей (cv2/pytesseract) ленивые — чтобы backend
работал и без OCR-пакетов (fallback: статус PARSE_FAILED, чек сохраняется).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path


@dataclass
class OcrResult:
    text: str = ""
    store_name: str | None = None
    inn: str | None = None
    total: Decimal | None = None
    items: list[dict] = field(default_factory=list)  # {name, quantity, price, total}


_NUM_RE = re.compile(r"^\s*[\d\s]+,\d{2}\s*$")
_INN_RE = re.compile(r"\b(\d{10}|\d{12})\b")
_TOTAL_RE = re.compile("ИТОГ|ВСЕГО|СУММА|К\\s*ОПЛАТЕ", re.IGNORECASE)


def _to_decimal(s: str) -> Decimal | None:
    s = s.strip().replace(" ", "").replace("\u00a0", "").replace(",", ".")
    try:
        return Decimal(s).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None


def preprocess(image_path: str | Path):
    """OpenCV: grayscale -> upscale -> adaptive threshold -> шумодав."""
    import cv2  # lazy import

    img = cv2.imread(str(image_path))
    if img is None:
        raise FileNotFoundError(f"Не удалось открыть изображение: {image_path}")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    if h < 1200:  # апскейл мелких фото с телефона
        scale = max(1.5, 1200 / h)
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    thresh = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10
    )
    return cv2.fastNlMeansDenoising(thresh, None, 10, 7, 21)


def run_ocr(image_path: str | Path, lang: str = "rus+eng") -> OcrResult:
    """Полный OCR-цикл: предобработка -> pytesseract -> парсинг полей."""
    import pytesseract

    processed = preprocess(image_path)
    try:
        text = pytesseract.image_to_string(processed, lang=lang)
    except pytesseract.TesseractError:
        # без русскоязычного пакета — пробуем eng
        text = pytesseract.image_to_string(processed, lang="eng")
    return parse_ocr_text(text)


def parse_ocr_text(text: str) -> OcrResult:
    """Извлечение реквизитов из сырого OCR-текста (эвристика для РФ-чеков)."""
    res = OcrResult(text=text)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return res

    inn_m = _INN_RE.search(text)
    if inn_m:
        res.inn = inn_m.group(1)

    # ИТОГ / К ОПЛАТЕ — итоговая сумма
    for i, ln in enumerate(lines):
        m = _TOTAL_RE.search(ln)
        if m:
            tail = ln[m.end():]
            cand = tail or (lines[i + 1] if i + 1 < len(lines) else "")
            nums = re.findall(r"[\d\s]{1,12},\d{2}", cand)
            if nums:
                res.total = _to_decimal(nums[-1])
                break

    # Позиции: строки вида "НАЗВАНИЕ  1 x 129,99 = 129,99" или "НАЗВАНИЕ 129,99"
    item_re = re.compile(
        r"^(?P<name>.+?)\s+(?P<qty>\d+(?:[.,]\d+)?)\s*[x×*]\s*(?P<price>[\d\s]+,\d{2})"
        r"\s*=\s*(?P<total>[\d\s]+,\d{2})\s*$"
    )
    simple_re = re.compile(r"^(?P<name>[^0-9].*?)\s+(?P<total>[\d\s]{1,12},\d{2})\s*$")
    for ln in lines:
        m = item_re.match(ln)
        if m:
            res.items.append(
                {
                    "name": m.group("name").strip()[:500],
                    "quantity": _to_decimal(m.group("qty")) or Decimal("1"),
                    "price": _to_decimal(m.group("price")) or Decimal("0"),
                    "total": _to_decimal(m.group("total")) or Decimal("0"),
                }
            )
        elif not res.items and simple_re.match(ln) and "ИТОГ" not in ln.upper():
            m2 = simple_re.match(ln)
            assert m2 is not None
            t = _to_decimal(m2.group("total"))
            if t is not None and t > 0:
                res.items.append(
                    {"name": m2.group("name").strip()[:500], "quantity": Decimal("1"), "price": t, "total": t}
                )

    # Магазин: первая содержательная строка заголовка
    for ln in lines[:6]:
        up = ln.upper()
        if any(b in up for b in ("ИНН", "ФН", "КАСС", "ЧЕК", "РЕЖИМ", "ДАТА")):
            continue
        if len(ln) >= 3 and not _NUM_RE.match(ln):
            res.store_name = ln[:300]
            break
    return res
