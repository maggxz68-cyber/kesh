"""Сервис для получения детализации чека через API OFD.ru (QR Cash)."""
import urllib.parse
import httpx
import logging
from typing import Dict, Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

def _format_qr_date_to_iso(qr_date: str) -> str:
    """
    Преобразует дату из QR-кода (формат YYYYMMDDThhmmss или YYYYMMDDThhmm) 
    в формат ISO, требуемый OFD.ru: YYYY-MM-DDThh:mm:ss.000
    """
    if 'T' not in qr_date:
        return qr_date
    
    date_part, time_part = qr_date.split('T', 1)
    
    # Форматируем дату YYYYMMDD -> YYYY-MM-DD
    if len(date_part) == 8:
        date_part = f"{date_part[:4]}-{date_part[4:6]}-{date_part[6:]}"
    
    # Форматируем время hhmmss или hhmm -> hh:mm:ss
    if len(time_part) == 4:
        time_part = f"{time_part[:2]}:{time_part[2:]}:00"
    elif len(time_part) == 6:
        time_part = f"{time_part[:2]}:{time_part[2:4]}:{time_part[4:]}"
        
    return f"{date_part}T{time_part}.000"

async def fetch_receipt_details(qr_string: str) -> Optional[Dict[str, Any]]:
    """
    Запрашивает детализацию чека по строке QR-кода через API OFD.ru.
    Возвращает объект Data из ответа или None в случае ошибки.
    """
    token_secret = getattr(settings, 'ofd_ru_token_secret', None)
    
    if not token_secret:
        logger.warning("OFD_RU_TOKEN_SECRET не настроен, пропускаем запрос детализации")
        return None

    # 1. Парсим параметры из QR-строки
    qr_params = dict(urllib.parse.parse_qsl(qr_string))
    
    # 2. Формируем payload строго по Таблице 1 спецификации OFD.ru
    raw_sum = qr_params.get('s', '0')
    payload = {
        "TotalSum": int(float(raw_sum) * 100),  # Сумма в копейках (целое число)
        "DocDateTime": _format_qr_date_to_iso(qr_params.get('t', '')),
        "FnNumber": qr_params.get('fn', ''),
        "ReceiptOperationType": qr_params.get('n', '1'),  # Строка: "1"=приход, "3"=расход
        "DocNumber": qr_params.get('i', ''),
        "DocFiscalSign": qr_params.get('fp', ''),
        "tokenSecret": token_secret
    }

    # 3. Делаем запрос к API
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://ofd.ru/api/partner/v3/receipts/GetReceipt",
                json=payload
            )
            
            # Логируем сырой ответ для отладки
            logger.debug(f"OFD.ru Response Status: {response.status_code}")
            
            data = response.json()
            
            # Проверяем успешность по полю Success (как в Таблице 3 PDF)
            if data.get("Success") is True and "Data" in data:
                logger.info(f"✅ Успешно получена детализация чека от OFD.ru")
                return data["Data"]
            else:
                errors = data.get("Errors", [])
                error_msg = ", ".join([e.get("Message", "Unknown error") for e in errors])
                logger.warning(f"⚠️ OFD.ru вернул ошибку: {error_msg} (Code: {data.get('Errors', [{}])[0].get('Code') if errors else 'N/A'})")
                return None
                
    except httpx.HTTPStatusError as e:
        logger.error(f"❌ HTTP ошибка при запросе к OFD.ru: {e.response.status_code} - {e.response.text}")
        return None
    except Exception as e:
        logger.error(f"❌ Неожиданная ошибка при запросе к OFD.ru: {e}")
        return None
