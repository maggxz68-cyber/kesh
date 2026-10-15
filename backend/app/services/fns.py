import re
import logging
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

logger = logging.getLogger(__name__)

class FnPayload(BaseModel):
    type_tag: int
    sum2: float
    fd: int
    fn: str
    fp: str
    date: Optional[datetime] = None
    receipt_number: Optional[str] = None
    raw: str
    meta: dict = {}
    operation_type: int = 1

def _parse_sum(sum_str: str, fmt: Optional[int] = None) -> float:
    if not sum_str:
        return 0.0
    clean_sum = sum_str.replace(',', '.')
    try:
        return float(clean_sum)
    except ValueError:
        logger.warning(f"Не удалось распарсить сумму: {sum_str}")
        return 0.0

def parse_payload(payload: str) -> Optional[FnPayload]:
    """Разбор стандартного TLV-payload QR ФНС."""
    if not payload or "&" not in payload or "t=" not in payload or "s=" not in payload:
        logger.warning(f"QR-код не похож на ФНС: {payload[:100]!r}")
        return None
    
    kv = {}
    for chunk in payload.split("&"):
        if "=" in chunk:
            k, v = chunk.split("=", 1)
            kv[k.lstrip("&").strip()] = v.strip()
            
    if not kv.get("t"):
        return None
        
    try:
        raw_t = kv["t"]
        date = None
        type_tag = 0
        
        if re.fullmatch(r"[0-9a-fA-F]{12}", raw_t):
            type_tag = int(raw_t[:2], 16)
        elif re.fullmatch(r"\d{8}T?\d{4,6}", raw_t):
            type_tag = 0
            clean_t = raw_t.replace("T", "")
            try:
                if len(clean_t) == 12:
                    date = datetime.strptime(clean_t, "%Y%m%d%H%M")
                elif len(clean_t) == 14:
                    date = datetime.strptime(clean_t, "%Y%m%d%H%M%S")
            except ValueError:
                pass
        elif re.fullmatch(r"\d+", raw_t):
            type_tag = int(raw_t)
            
        if "dt" in kv and not date:
            dt_v = kv["dt"]
            for fmt_d in ("%Y%m%dT%H%M%S", "%Y%m%d%H%M%S", "%Y%m%d"):
                try:
                    date = datetime.strptime(dt_v, fmt_d)
                    break
                except ValueError:
                    continue

        sum_val = _parse_sum(kv.get("s", "0"), int(kv["fmt"]) if kv.get("fmt", "").isdigit() else None)

        return FnPayload(
            type_tag=type_tag,
            sum2=sum_val,
            fd=int(kv.get("n", 0) or 0),
            fn=kv.get("fn", ""),
            fp=kv.get("fp", ""),
            date=date,
            receipt_number=kv.get("i", "").split("&")[0] if kv.get("i") else None,
            raw=payload
        )
    except Exception as e:
        logger.error(f"Ошибка при парсинге payload {payload}: {e}")
        return None

def decode_qr(image_path: str) -> str | None:
    """Декодирует QR-код с изображения, используя предобработку для улучшения качества."""
    try:
        from pyzbar.pyzbar import decode
        from app.services import ocr
        
        processed_img = ocr.preprocess(image_path)
        decoded_objects = decode(processed_img)
        
        for obj in decoded_objects:
            if obj.type == 'QRCODE':
                return obj.data.decode('utf-8', errors='ignore')
    except Exception as e:
        logger.warning(f"QR-декодирование не удалось: {e}")
    return None

async def check_receipt(payload: FnPayload) -> dict | None:
    """
    Возвращает None, так как публичные API ФНС требуют сложной авторизации.
    Система полагается на точные данные из QR-кода (сумма, дата), 
    а категорию и магазин пользователь уточняет в интерфейсе в один клик.
    """
    return None
