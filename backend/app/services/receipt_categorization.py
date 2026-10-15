"""Автокатегоризация чеков по названию магазина."""
from typing import Optional

# Справочник популярных магазинов и их категорий
# Словарь известных ИНН для 100% точного определения магазина
INN_TO_STORE = {
    "1585882520": "Пятёрочка",
    "7707306206": "Магнит",
    "7707083893": "СберМаркет",
    "7715038993": "Лента",
    "7725041054": "Дикси",
    "7707306206": "Верный",
}

STORE_CATEGORIES = {
    # Продукты
    "пятёрочка": "products",
    "pyaterochka": "products",
    "x5": "products",
    "магнит": "products",
    "magnit": "products",
    "перекрёсток": "products",
    "perekrestok": "products",
    "лента": "products",
    "lenta": "products",
    "азбука вкуса": "products",
    "globus": "products",
    "глобус": "products",
    "metro": "products",
    "ашан": "products",
    "auchan": "products",
    
    # АЗС
    "лукойл": "fuel",
    "lukoil": "fuel",
    "газпромнефть": "fuel",
    "gazprom": "fuel",
    "роснефть": "fuel",
    "rosneft": "fuel",
    "татнефть": "fuel",
    "tatneft": "fuel",
    "шелл": "fuel",
    "shell": "fuel",
    "bp": "fuel",
    
    # Рестораны и кафе
    "теремок": "restaurants",
    "вкусно и точка": "restaurants",
    "mc": "restaurants",
    "mcdonald": "restaurants",
    "burger king": "restaurants",
    "бургер кинг": "restaurants",
    "kfc": "restaurants",
    "starbucks": "restaurants",
    "кофемания": "restaurants",
    "шоколадница": "restaurants",
    
    # Аптеки
    "аптека": "pharmacy",
    "apteka": "pharmacy",
    "ригла": "pharmacy",
    "rigla": "pharmacy",
    "36,6": "pharmacy",
    "gorzdrav": "pharmacy",
    "горздрав": "pharmacy",
    
    # Одежда и обувь
    "zara": "clothing",
    "h&m": "clothing",
    "hm": "clothing",
    "mango": "clothing",
    "adidas": "clothing",
    "nike": "clothing",
    "reebok": "clothing",
    "sportmaster": "clothing",
    "спортмастер": "clothing",
    
    # Электроника
    "dns": "electronics",
    "mvideo": "electronics",
    "м.видео": "electronics",
    "eldorado": "electronics",
    "ситилинк": "electronics",
    "citilink": "electronics",
    
    # Дом и ремонт
    "leroy": "home",
    "леруа": "home",
    "obi": "home",
    "хофф": "home",
    "hoff": "home",
    
    # Такси и транспорт
    "яндекс такси": "transport",
    "yandex taxi": "transport",
    "uber": "transport",
    "ситимобил": "transport",
    "citymobil": "transport",
}

def find_store_in_text(text: str) -> Optional[str]:
    """Ищет название магазина в OCR-тексте по частичному совпадению."""
    if not text:
        return None
    text_lower = text.lower()
    
    # Частичные совпадения для популярных магазинов
    store_patterns = {
        "пятёрочка": "products",
        "pyaterochka": "products",
        "x5": "products",
        "магнит": "products",
        "magnit": "products",
        "перекрёсток": "products",
        "perekrestok": "products",
        "лента": "products",
        "lenta": "products",
        "ашан": "products",
        "auchan": "products",
        "globus": "products",
        "глобус": "products",
        "metro": "products",
    }
    
    for pattern, category in store_patterns.items():
        if pattern in text_lower:
            return category
    return None


def get_store_by_inn(inn: Optional[str]) -> Optional[str]:
    if inn and inn in INN_TO_STORE:
        return INN_TO_STORE[inn]
    return None

def categorize_by_store(store_name: Optional[str], inn: Optional[str]) -> Optional[str]:
    """
    Определяет категорию по названию магазина или ИНН.
    Возвращает slug категории (products, fuel, restaurants и т.д.)
    """
    if not store_name:
        return None
    
    # Нормализуем название: нижний регистр, убираем лишние символы
    normalized = store_name.lower().strip()
    
    # Проверяем полное совпадение
    if normalized in STORE_CATEGORIES:
        return STORE_CATEGORIES[normalized]
    
    # Проверяем частичное совпадение (содержит ключевое слово)
    for key, category in STORE_CATEGORIES.items():
        if key in normalized:
            return category
    
    # Если не нашли — пробуем по ИНН (в будущем можно добавить базу)
    # if inn:
    #     category = categorize_by_inn(inn)
    #     if category:
    #         return category
    
    return None

def get_category_display_name(category_slug: str) -> str:
    """Возвращает человекочитаемое название категории."""
    display_names = {
        "products": "Продукты",
        "fuel": "Топливо",
        "restaurants": "Рестораны",
        "pharmacy": "Аптека",
        "clothing": "Одежда",
        "electronics": "Электроника",
        "home": "Дом и ремонт",
        "transport": "Транспорт",
    }
    return display_names.get(category_slug, category_slug)
