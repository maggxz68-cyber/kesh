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
# «Магазинное» имя: только кириллица/латиница, дефисы и кавычки (без цифр/мусора OCR)
# Кандидат в название магазина: до 2 слов без цифр и «мусорных» символов
_SHOP_WORD_RE = re.compile(r"^[А-Яа-яЁёA-Za-z][А-Яа-яЁёA-Za-z.'\"-]{1,30}$")
# Позволенные спецсимволы внутри кандидата в название (№, /, :, скобки — но НЕ = % # & и т.п.)
_SHOP_ALLOWED_PUNCT = set("№/:()'\"-.,& ")


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

    # Магазин: первая содержательная строка заголовка с фильтрацией OCR-мусора
    def _shop_candidate(raw_line: str) -> str | None:
        """Возвращает нормализованное название из строки или None (строка — мусор)."""
        cand = raw_line.strip()
        if len(cand) < 3 or _NUM_RE.match(cand):
            return None
        # Цифры и типичный OCR-мусор (= % # * + < > [ ] | ~ ` ^ _) недопустимы
        if re.search(r"[0-9=%_#$*+<>{}\[\]|~`^]", cand):
            return None
        if re.search(r"(.)\1{2,}", cand):  # "SSS", "!!!" и т.п.
            return None
        # "МАГАЗИН / ООО Ромашка" → последний сегмент после "/"
        if "/" in cand:
            cand = cand.split("/")[-1].strip()
        words = cand.split()
        if not words or len(words) > 4:
            return None
        legal_prefixes = {"ООО", "ОАО", "ЗАО", "ПАО", "АО", "ИП", "ЧОО", "МБОУ"}
        while words and words[0].upper() in legal_prefixes:
            words = words[1:]
        while len(words) > 1 and words[-1].upper() in legal_prefixes:
            words = words[:-1]
        if not words:
            return None
        if not all(_SHOP_WORD_RE.match(w) for w in words):
            return None
        block_words = {"КАССА", "ЧЕК", "КОНТЕНЕР", "ЗАМЕНА", "СМЕНА", "ИТОГ", "ВСЕГО", "ДАТА", "РЕЖИМ", "SPO", "SKU", "QR", "ФН", "ФД", "ФП"}
        if all(w.upper() in block_words for w in words):
            return None
        return " ".join(words)[:300]

    store_name = None
    # Проход 1: все строки шапки (№ и прочие символы допускаются)
    _block_substrings = ("КАССА", "КАССОВЫЙ", "ЗАМЕНА", "СМЕНА", "РЕЖИМ", "ИТОГ", "ВСЕГО")
    _skip_tokens = {"КАССА", "ЧЕК", "КОНТЕНЕР", "ЗАМЕНА", "СМЕНА", "ИТОГ", "ВСЕГО", "ДАТА", "РЕЖИМ", "SPO", "SKU", "QR"}
    for ln in lines[:8]:
        up = ln.upper()
        if any(b in up for b in ("ИНН", "ФН", "ЧЕК", "ДАТА")):
            continue
        if any(b in up for b in _block_substrings):
            continue
        store_name = _shop_candidate(ln)
        if not store_name:
            # Строка вида "КАССА №1 ООО Магнит" — пробуем без служебных токенов,
            # но только если в строке нет OCR-мусора (= % & и т.п.)
            if not re.search(r"[=%&#@!]", ln):
                kept = [w for w in ln.split() if w.isalpha() and w.upper() not in _skip_tokens]
                if kept:
                    store_name = _shop_candidate(" ".join(kept))
        if store_name:
            break
    # Проход 2 (если в шапке только мусор): первые >=5 символов без цифр из строк шапки
    if not store_name:
        for ln in lines[:6]:
            letters = "".join(ch for ch in ln if ch.isalpha() or ch.isspace())
            words_ = [w for w in letters.split() if w.upper() not in _skip_tokens | {"ООО", "ОАО", "ЗАО", "ПАО", "АО", "ИП"}]
            word = max(words_, key=len, default="")
            if len(word) >= 5 and word.lower() not in {"итог", "всего", "чеки", "проверьте", "касса", "замена"}:
                store_name = word[:300]
                break
    if store_name:
        res.store_name = store_name
    return res

