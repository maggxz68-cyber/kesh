"""Минимальный OCR: извлекает только магазин и ИНН из чека."""
import re
from pathlib import Path
from typing import Optional, Dict

def extract_store_and_inn(image_path: str) -> Dict[str, Optional[str]]:
    """
    Запускает Tesseract и ищет:
    1. ИНН (10 или 12 цифр)
    2. Название магазина по ключевым словам
    Возвращает {'store_name': ..., 'inn': ...}
    """
    try:
        from app.services.ocr import preprocess
        import pytesseract
        from PIL import Image
        
        processed = preprocess(image_path)
        text = pytesseract.image_to_string(processed, lang='rus+eng')
    except Exception as e:
        print(f"OCR error: {e}")
        return {'store_name': None, 'inn': None}
    
    result = {'store_name': None, 'inn': None}
    
    # 1. ИНН: ищем 10 или 12 цифр рядом со словом "ИНН"
    inn_match = re.search(r'ИНН[:\s]*(\d{10}|\d{12})', text)
    if inn_match:
        result['inn'] = inn_match.group(1)
    else:
        # Запасной вариант: просто первые 10-12 цифр в тексте
        inn_match = re.search(r'\b(\d{10}|\d{12})\b', text)
        if inn_match:
            result['inn'] = inn_match.group(1)
    
    # 2. Магазин: ищем по ключевым словам (регистронезависимо)
    store_keywords = [
        ('пятёрочка', 'Пятёрочка'), ('pyaterochka', 'Пятёрочка'),
        ('пятерочка', 'Пятёрочка'), ('x5', 'Пятёрочка'),
        ('магнит', 'Магнит'), ('magnit', 'Магнит'),
        ('перекрёсток', 'Перекрёсток'), ('perekrestok', 'Перекрёсток'),
        ('лента', 'Лента'), ('lenta', 'Лента'),
        ('ашан', 'Ашан'), ('auchan', 'Ашан'),
        ('дикси', 'Дикси'), ('dixy', 'Дикси'),
        ('metro', 'Метро'), ('globus', 'Глобус'),
        ('вкусвилл', 'ВкусВилл'), ('vkusvill', 'ВкусВилл'),
        ('окей', 'О\'КЕЙ'), ('okay', 'О\'КЕЙ'),
    ]
    
    text_lower = text.lower()
    for keyword, display_name in store_keywords:
        if keyword in text_lower:
            result['store_name'] = display_name
            break
    
    return result
