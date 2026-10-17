"""Базовый абстрактный класс для парсеров банковских выписок."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from enum import Enum


class TransactionType(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"  # внутренний перевод (обычно игнорируется)


@dataclass
class ParsedTransaction:
    """Унифицированная транзакция из любой выписки."""
    date: datetime
    amount: float
    type: TransactionType
    description: str
    counterparty: Optional[str] = None  # магазин/получатель
    category_hint: Optional[str] = None  # подсказка категории от парсера
    raw: Optional[dict] = None  # исходные данные для отладки
    
    @property
    def is_internal_transfer(self) -> bool:
        """Внутренний перевод между своими счетами — обычно игнорируется."""
        return self.type == TransactionType.TRANSFER


class BaseParser(ABC):
    """Абстрактный базовый класс парсера."""
    
    @abstractmethod
    def parse(self, file_content: bytes, filename: str) -> list[ParsedTransaction]:
        """Парсит файл и возвращает список транзакций."""
        pass
    
    @property
    @abstractmethod
    def bank_name(self) -> str:
        """Название банка."""
        pass
