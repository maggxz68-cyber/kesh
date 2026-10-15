"""Сервис для сканирования чеков: QR-коды и OCR."""
from __future__ import annotations

import logging
import re
from datetime import datetime
from decimal import Decimal
from io import BytesIO
from typing import Optional, Dict, Any

from PIL import Image
from pyzbar.pyzbar import decode as pyzbar_decode

logger = logging.getLogger(__name__)

# Паттерн для парсинга строки QR-кода ФНС
# Формат: t=YYYYMMDDTHHMMSS&s=SUM&fn=FN&i=DOC&fp=FP&n=TYPE
QR_FNS_PATTERN = re.compile(
    r't=(?P<date>\d{14})&s=(?P<sum>[\d.]+)&fn=(?P<fn>\d+)&i=(?P<doc>\d+)&fp=(?P<fp>\d+)(?:&n=(?P<type>\d))?'
)

def parse_fns_qr_string(qr_string: str) -> Optional[Dict[str, Any]]:
    """Парсит строку QR-кода ФНС и возвращает структурированные данные."""
    match = QR_FNS_PATTERN.search(qr_string)
    if not match:
        return None
    
    data = match.groupdict()
    
    # Парсим дату
    try:
        receipt_date = datetime.strptime(data['date'], '%Y%m%dT%H%M%S')
    except ValueError:
        receipt_date = None
    
    # Парсим сумму (в копейках, делим на 100)
    try:
        amount = Decimal(data['sum']) / Decimal('100')
    except Exception:
        amount = None
    
    return {
        'date': receipt_date.isoformat() if receipt_date else None,
        'amount': float(amount) if amount else None,
        'fiscal_number': data.get('fn'),
        'document_number': data.get('doc'),
        'fiscal_sign': data.get('fp'),
        'type': int(data['type']) if data.get('type') else None,  # 1=приход, 2=возврат прихода
        'raw_qr': qr_string,
    }

def decode_qr_from_image(image_bytes: bytes) -> Optional[str]:
    """Пытается найти и декодировать QR-код на изображении."""
    try:
        image = Image.open(BytesIO(image_bytes))
        # Конвертируем в RGB, если нужно
        if image.mode not in ('RGB', 'L'):
            image = image.convert('RGB')
        
        decoded_objects = pyzbar_decode(image)
        for obj in decoded_objects:
            if obj.type == 'QRCODE':
                return obj.data.decode('utf-8', errors='ignore')
    except Exception as e:
        logger.warning(f"Ошибка декодирования QR: {e}")
    
    return None

def ocr_receipt(image_bytes: bytes) -> Optional[Dict[str, Any]]:
    """Резервный метод: OCR распознавание текста чека."""
    try:
        import pytesseract
        
        image = Image.open(BytesIO(image_bytes))
        if image.mode not in ('RGB', 'L'):
            image = image.convert('RGB')
        
        # Распознаем текст (русский + английский)
        text = pytesseract.image_to_string(image, lang='rus+eng')
        
        # Пытаемся извлечь сумму (ищем паттерн "ИТОГ" или "ИТОГО" с числом)
        amount_match = re.search(r'(?:ИТОГ|ИТОГО|TOTAL)[:\s]*([\d\s,]+)', text, re.IGNORECASE)
        amount = None
        if amount_match:
            amount_str = amount_match.group(1).replace(' ', '').replace(',', '.')
            try:
                amount = float(Decimal(amount_str))
            except Exception:
                pass
        
        # Пытаемся извлечь дату
        date_match = re.search(r'(\d{2}[./]\d{2}[./]\d{4})', text)
        date_str = None
        if date_match:
            date_str = date_match.group(1)
        
        # Пытаемся извлечь название магазина (обычно первая строка)
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        shop_name = lines[0] if lines else None
        
        return {
            'text': text,
            'amount': amount,
            'date': date_str,
            'shop_name': shop_name,
            'method': 'ocr',
        }
    except Exception as e:
        logger.error(f"Ошибка OCR: {e}")
        return None

def scan_receipt(image_bytes: bytes) -> Dict[str, Any]:
    """
    Главная функция сканирования чека.
    Сначала пытается прочитать QR, если не получается — использует OCR.
    """
    # 1. Пробуем QR
    qr_string = decode_qr_from_image(image_bytes)
    if qr_string:
        parsed = parse_fns_qr_string(qr_string)
        if parsed:
            parsed['method'] = 'qr'
            return parsed
        # Если QR есть, но не парсится как ФНС, возвращаем сырые данные
        return {
            'raw_qr': qr_string,
            'method': 'qr_raw',
        }
    
    # 2. Если QR не найден, используем OCR
    ocr_result = ocr_receipt(image_bytes)
    if ocr_result:
        return ocr_result
    
    return {'error': 'Не удалось распознать чек. Убедитесь, что изображение четкое.'}
