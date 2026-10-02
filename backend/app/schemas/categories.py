"""Схемы категорий, тегов, контрагентов (ТЗ 7.2)."""
from __future__ import annotations

import uuid

from pydantic import Field

from app.models.enums import CategoryKind
from app.schemas.common import ORMBase


class CategoryCreate(ORMBase):
    name: str = Field(min_length=1, max_length=200)
    kind: CategoryKind
    parent_id: uuid.UUID | None = None
    icon: str | None = Field(default=None, max_length=64)
    color: str | None = Field(default=None, max_length=16)


class CategoryUpdate(ORMBase):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    parent_id: uuid.UUID | None = None
    icon: str | None = None
    color: str | None = None
    is_archived: bool | None = None


class CategoryOut(ORMBase):
    id: uuid.UUID
    family_id: uuid.UUID | None
    is_system: bool
    name: str
    kind: CategoryKind
    parent_id: uuid.UUID | None
    icon: str | None
    color: str | None
    sort_order: int
    is_archived: bool


class TagCreate(ORMBase):
    name: str = Field(min_length=1, max_length=64)
    color: str | None = Field(default=None, max_length=16)


class TagOut(ORMBase):
    id: uuid.UUID
    name: str
    color: str | None


class CounterpartyCreate(ORMBase):
    name: str = Field(min_length=1, max_length=300)
    inn: str | None = Field(default=None, max_length=12)
    category_id: uuid.UUID | None = None


class CounterpartyOut(ORMBase):
    id: uuid.UUID
    name: str
    inn: str | None
    category_id: uuid.UUID | None
