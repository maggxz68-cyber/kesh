"""Сервис для определения названия организации по ИНН через DaData API."""
import logging
from typing import Optional, Dict, Any
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)
DADATA_API_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party"

async def lookup_organization_by_inn(inn: str) -> Optional[Dict[str, Any]]:
    token = getattr(settings, 'dadata_token', None)
    if not token or token == "your_dadata_token_here":
        logger.info("DADATA_TOKEN не настроен")
        return None
    
    headers = {
        "Authorization": f"Token {token}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(DADATA_API_URL, headers=headers, json={"query": inn})
            if response.status_code != 200:
                logger.warning(f"DaData API вернул статус {response.status_code}")
                return None
            
            data = response.json()
            suggestions = data.get("suggestions", [])
            if not suggestions:
                return None
            
            org = suggestions[0]["data"]
            return {
                "name": org.get("name", {}).get("full_with_opf", ""),
                "short_name": org.get("name", {}).get("short_with_opf", ""),
                "inn": org.get("inn", ""),
                "address": org.get("address", {}).get("value", ""),
            }
    except Exception as e:
        logger.error(f"Ошибка при запросе к DaData: {e}")
        return None
