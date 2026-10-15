"""OCR чеков: Tesseract + улучшенное распознавание товаров."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from datetime import datetime


@dataclass
class OcrResult:
    text: str = ""
    store_name: str | None = None
    inn: str | None = None
    receipt_date: str | None = None
    total: Decimal | None = None
    items: list[dict] = field(default_factory=list)


_NUM_RE = re.compile(r"^\s*[\d\s]+[.,]\d{2}\s*$")
_INN_RE = re.compile(r"\b(\d{10}|\d{12})\b")
_TOTAL_RE = re.compile(r"ИТОГ[О]?|ВСЕГО|СУММА|К\s*ОПЛАТЕ|ИТОГОВАЯ\s*СУММА", re.IGNORECASE)
_DATE_RE = re.compile(r"(\d{2}[./]\d{2}[./]\d{2,4})")
_MONEY_RE = re.compile(r"(\d{1,6}[.,\s]?\d{2})\s*(?:₽|руб|RUB)?")

# Улучшенные паттерны для товаров
# Паттерн 1: "Название  2 x 129.99 = 259.98"
_ITEM_PATTERN_1 = re.compile(
    r"^(?P<name>.+?)\s+(?P<qty>\d+(?:[.,]\d+)?)\s*[xх×*]\s*(?P<price>[\d\s]+[.,]\d{2})"
    r"\s*(?:=\s*)?(?P<total>[\d\s]+[.,]\d{2})?\s*$", re.IGNORECASE
)
# Паттерн 2: "Название  129.99" (без количества)
_ITEM_PATTERN_2 = re.compile(
    r"^(?P<name>[^0-9].*?)\s+(?P<total>[\d\s]{1,12}[.,]\d{2})\s*$"
)
# Паттерн 3: для чеков с НДС
_ITEM_PATTERN_3 = re.compile(
    r"^(?P<name>.+?)\s+(?P<qty>\d+)\s+(?P<price>[\d\s]+[.,]\d{2})\s+(?P<total>[\d\s]+[.,]\d{2})"
)

_SHOP_WORD_RE = re.compile(r"^[А-Яа-яЁёA-Za-z][А-Яа-яЁёA-Za-z.'\"-]{1,30}$")


def _to_decimal(s: str) -> Decimal | None:
    s = s.strip().replace(" ", "").replace("\u00a0", "").replace(",", ".")
    try:
        return Decimal(s).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None


def preprocess(image_path: str | Path):
    """OpenCV: grayscale -> upscale -> adaptive threshold -> шумодав."""
    import cv2

    img = cv2.imread(str(image_path))
    if img is None:
        raise FileNotFoundError(f"Не удалось открыть изображение: {image_path}")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    if h < 1200:
        scale = max(1.5, 1200 / h)
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    thresh = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10
    )
    return cv2.fastNlMeansDenoising(thresh, None, 10, 7, 21)


def run_ocr(image_path: str | Path, lang: str = "rus+eng") -> OcrResult:
    """Полный OCR-цикл."""
    import pytesseract

    processed = preprocess(image_path)
    try:
        text = pytesseract.image_to_string(processed, lang=lang)
    except pytesseract.TesseractError:
        text = pytesseract.image_to_string(processed, lang="eng")
    return parse_ocr_text(text)


def parse_ocr_text(text: str) -> OcrResult:
    """Извлечение реквизитов из OCR-текста."""
    res = OcrResult(text=text)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return res

    # 1. ИНН
    inn_m = _INN_RE.search(text)
    if inn_m:
        res.inn = inn_m.group(1)

    # 2. Дата
    for ln in lines[:15]:
        date_m = _DATE_RE.search(ln)
        if date_m:
            raw_date = date_m.group(1).replace('.', '-')
            try:
                if len(raw_date) == 8:
                    res.receipt_date = datetime.strptime(raw_date, "%d-%m-%y").date().isoformat()
                else:
                    res.receipt_date = datetime.strptime(raw_date, "%d-%m-%Y").date().isoformat()
                break
            except ValueError:
                res.receipt_date = raw_date
                break

    # 3. ИТОГ / СУММА
    for i, ln in enumerate(lines):
        m = _TOTAL_RE.search(ln)
        if m:
            tail = ln[m.end():]
            money_m = _MONEY_RE.search(tail)
            if not money_m and i + 1 < len(lines):
                money_m = _MONEY_RE.search(lines[i + 1])
            if money_m:
                res.total = _to_decimal(money_m.group(1))
                break

    # 4. Товары (улучшенный парсинг)
    skip_keywords = {"ИТОГ", "ВСЕГО", "СУММА", "СУММА НДС", "НАЛИЧНЫМИ", "БЕЗНАЛИЧНЫМИ", "НДС", "VAT", "КАССА", "ЧЕК", "СДАЧА"}
    
    for ln in lines:
        ln_upper = ln.upper()
        
        # Пропускаем служебные строки
        # Проверяем частичное совпадение (Tesseract часто ошибается в буквах)
        skip_partial = {"НАС", "НДС", "VAT", "ИТОГ", "ВСЕГО", "КАСС", "ЧЕК", "СДАЧ", "ОПЛАТ"}
        if any(kw in ln_upper for kw in skip_keywords) or any(kw in ln_upper for kw in skip_partial):
            continue
        
        # Паттерн 1: с количеством и ценой
        m = _ITEM_PATTERN_1.match(ln)
        if m:
            name = m.group("name").strip()
            if len(name) > 2 and not name.isdigit():
                qty = _to_decimal(m.group("qty")) or Decimal("1")
                price = _to_decimal(m.group("price")) or Decimal("0")
                total_str = m.group("total")
                total = _to_decimal(total_str) if total_str else (price * qty)
                res.items.append({"name": name[:500], "quantity": qty, "price": price, "total": total})
            continue
        
        # Паттерн 3: другой формат с количеством
        m = _ITEM_PATTERN_3.match(ln)
        if m:
            name = m.group("name").strip()
            if len(name) > 2 and not name.isdigit():
                qty = Decimal(m.group("qty"))
                price = _to_decimal(m.group("price")) or Decimal("0")
                total = _to_decimal(m.group("total")) or (price * qty)
                res.items.append({"name": name[:500], "quantity": qty, "price": price, "total": total})
            continue
        
        # Паттерн 2: только название и цена (без количества)
        if not res.items:  # Только если ещё не нашли товары
            m = _ITEM_PATTERN_2.match(ln)
            if m:
                name = m.group("name").strip()
                total_val = _to_decimal(m.group("total"))
                if len(name) > 2 and not name.isdigit() and total_val and total_val > 0:
                    res.items.append({"name": name[:500], "quantity": Decimal("1"), "price": total_val, "total": total_val})

    # 5. Название магазина
    def _shop_candidate(raw_line: str) -> str | None:
        cand = raw_line.strip()
        if len(cand) < 3 or _NUM_RE.match(cand):
            return None
        if re.search(r"[=%_#$*+<>{}\[\]|~`^]", cand):
            return None
        if "/" in cand:
            cand = cand.split("/")[-1].strip()
        words = cand.split()
        if not words or len(words) > 4:
            return None
        legal_prefixes = {"ООО", "ОАО", "ЗАО", "ПАО", "АО", "ИП"}
        while words and words[0].upper() in legal_prefixes:
            words = words[1:]
        if not words:
            return None
        if not all(_SHOP_WORD_RE.match(w) for w in words):
            return None
        return " ".join(words)[:300]

    store_name = None
    for ln in lines[:8]:
        up = ln.upper()
        if any(b in up for b in ("ИНН", "ФН", "ЧЕК", "ДАТА", "ИТОГ")):
            continue
        store_name = _shop_candidate(ln)
        if store_name:
            break
            
    if store_name:
        res.store_name = store_name
        
    return res
