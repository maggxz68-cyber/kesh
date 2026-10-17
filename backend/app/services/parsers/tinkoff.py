"""Парсер выписок Т-Банка (Тинькофф) в формате CSV."""
import re
from datetime import datetime
from typing import Optional

from .base import BaseParser, ParsedTransaction, TransactionType

INTERNAL_TRANSFER_PATTERNS = [
    r"внутренний перевод", r"перевод с договора", r"перевод на договор",
    r"внутрибанковский перевод", r"возврат оплаты за товары", r"размещение вклада",
    r"погашение займа", r"возврат вклада", r"внутрибанковский перевод с договора"
]

CATEGORY_KEYWORDS = {
    "Продукты": [
        r"пятёрочка", r"pyaterochka", r"5ka", r"магнит", r"magnit", r"лента", r"lenta",
        r"вкусвилл", r"vkusvill", r"монетка", r"monetka", r"красное.?белое", r"krasnoe.?beloe",
        r"fixprice", r"овощи", r"frukty", r"продукты", r"grocery", r"supermarket", r"ozon",
    ],
    "Кафе и рестораны": [
        r"кафе", r"ресторан", r"кофе", r"coffee", r"sova", r"пончиковая", r"shokoladnica",
    ],
    "Транспорт": [
        r"яндекс.?такси", r"taxi", r"метро", r"топливо", r"fuel", r"gazprom.?neft", r"азс",
        r"бензин", r"trip\.com", r"t-travel", r"travel_trains", r"avia",
    ],
    "Развлечения": [
        r"кино", r"окко", r"авито", r"stoloto", r"лотерея",
    ],
    "Здоровье": [
        r"аптека", r"apteka", r"ригла", r"rigla", r"стоматолог", r"khirurg", r"лекарства",
    ],
    "Красота": [
        r"парикмахерская", r"салон", r"magnit.?cosmetic",
    ],
    "Коммунальные": [
        r"мтс", r"mts", r"мбанк", r"mbank", r"жкх", r"ростелеком", r"timeweb", r"vpn",
    ],
    "Автомобиль": [
        r"бензин", r"азс", r"gazprom", r"топливо", r"fuel",
    ],
}

def detect_category(description: str) -> Optional[str]:
    desc_lower = description.lower()
    for category, patterns in CATEGORY_KEYWORDS.items():
        for pattern in patterns:
            if re.search(pattern, desc_lower):
                return category
    return None

def detect_type(description: str, amount: float) -> TransactionType:
    desc_lower = description.lower()
    for pattern in INTERNAL_TRANSFER_PATTERNS:
        if re.search(pattern, desc_lower):
            return TransactionType.TRANSFER
    if amount > 0:
        return TransactionType.INCOME
    return TransactionType.EXPENSE

def extract_counterparty(description: str) -> Optional[str]:
    match = re.search(r"оплата в\s+([A-ZА-ЯЁ&_\s\d\*]+?)(?:\s+(?:Miass|MOSCOW|RUS|RU|\d+)|$)", description, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    match = re.search(r"[A-Z]+\*([A-Za-zА-Яа-яЁё\d]+)", description)
    if match:
        return match.group(1).strip()
    return None

def clean_description(raw_desc: str) -> str:
    """Пуленепробиваемая очистка описания от банковского мусора."""
    desc = raw_desc
    # 1. Удаляем 4-значные номера карт (1600, 9501)
    desc = re.sub(r'\b\d{4}\b', '', desc)
    # 2. Удаляем время операции (15:07)
    desc = re.sub(r'\b\d{2}:\d{2}\b', '', desc)
    # 3. Удаляем коды стран (RUS, RU)
    desc = re.sub(r'\b(RUS|RU)\b', '', desc, flags=re.IGNORECASE)
    # 4. Удаляем длинные числа (например, 26296)
    desc = re.sub(r'\b\d{5,}\b', '', desc)
    # 5. Схлопываем множественные пробелы в один и убираем пробелы по краям
    desc = re.sub(r'\s{2,}', ' ', desc).strip()
    return desc

def parse_tinkoff_csv(content: str) -> list[ParsedTransaction]:
    transactions = []
    lines = content.split('\n')
    
    cleaned_lines = []
    current_line = ""
    
    for line in lines:
        line = line.strip().strip('"')
        if not line:
            continue
        if re.match(r'^\d{2}:\d{2}\s+\d{2}:\d{2}', line):
            current_line += " " + line
        else:
            if current_line:
                cleaned_lines.append(current_line)
            current_line = line
    if current_line:
        cleaned_lines.append(current_line)
    
    txn_pattern = re.compile(
        r'^(\d{2}\.\d{2}\.\d{4})'
        r'.*?'
        r'([+-]?\s*[\d\s]+(?:\.\d+)?)\s*₽'
        r'.*?'
        r'([+-]?\s*[\d\s]+(?:\.\d+)?)\s*₽'
        r'\s+(.*)$'
    )
    
    for line in cleaned_lines:
        match = txn_pattern.match(line)
        if not match:
            continue
            
        date_str = match.group(1)
        amount_str = match.group(2).replace(' ', '').replace('₽', '').strip()
        raw_description = match.group(4).strip()
        
        # 🔥 ПРИМЕНЯЕМ УМНУЮ ОЧИСТКУ
        desc = clean_description(raw_description)
        
        try:
            date = datetime.strptime(date_str, '%d.%m.%Y')
            amount = float(amount_str)
        except (ValueError, TypeError):
            continue
        
        if abs(amount) < 0.01:
            continue
        
        txn_type = detect_type(desc, amount)
        if txn_type == TransactionType.TRANSFER:
            continue
        
        transactions.append(ParsedTransaction(
            date=date,
            amount=abs(amount),
            type=TransactionType.INCOME if amount > 0 else TransactionType.EXPENSE,
            description=desc,
            counterparty=extract_counterparty(desc),
            category_hint=detect_category(desc),
            raw={"bank": "Т-Банк"},
        ))
    
    return transactions

class TinkoffParser(BaseParser):
    @property
    def bank_name(self) -> str:
        return "Т-Банк (Тинькофф)"
    
    def parse(self, file_content: bytes, filename: str) -> list[ParsedTransaction]:
        content = file_content.decode('utf-8-sig', errors='ignore')
        return parse_tinkoff_csv(content)
