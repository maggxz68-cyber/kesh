"""CRUD категорий, тегов, контрагентов (ТЗ 7.2, 9).

Системные категории (family_id IS NULL) доступны всем семьям на чтение;
редактирование/удаление — только пользовательских категорий семьи.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select

from app.core.deps import CurrentUser, DbDep, csrf_guard, get_current_user, parse_uuid
from app.models.enums import CategoryKind
from app.models.reference import Category, Counterparty, Tag
from app.schemas.categories import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    CounterpartyCreate,
    CounterpartyOut,
    TagCreate,
    TagOut,
)

router = APIRouter(dependencies=[Depends(csrf_guard)])
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


# ---------- Категории ----------


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(db: DbDep, current: CurrentUserDep, kind: str | None = None) -> list[Category]:
    stmt = select(Category).where(
        or_(Category.family_id == current.family_id, Category.is_system.is_(True)),
        Category.deleted_at.is_(None),
    )
    if kind:
        stmt = stmt.where(Category.kind == CategoryKind(kind))
    stmt = stmt.order_by(Category.kind, Category.sort_order, Category.name)
    return list((await db.execute(stmt)).scalars().all())


async def _system_parent(db: DbDep, parent_id: uuid.UUID | None) -> Category | None:
    if parent_id is None:
        return None
    parent = (await db.execute(select(Category).where(Category.id == parent_id))).scalar_one_or_none()
    if parent is None or parent.deleted_at is not None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Родительская категория не найдена")
    return parent


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(body: CategoryCreate, db: DbDep, current: CurrentUserDep) -> Category:
    parent = await _system_parent(db, body.parent_id)
    if parent is not None and parent.kind != body.kind:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Тип родителя должен совпадать")
    cat = Category(
        family_id=current.family_id,
        is_system=False,
        name=body.name.strip(),
        kind=body.kind,
        parent_id=body.parent_id,
        icon=body.icon,
        color=body.color,
    )
    db.add(cat)
    await db.flush()
    return cat


async def _get_own_category(db: DbDep, current: CurrentUser, category_id: uuid.UUID) -> Category:
    cat = (await db.execute(select(Category).where(Category.id == category_id))).scalar_one_or_none()
    if cat is None or cat.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Категория не найдена")
    if cat.is_system or cat.family_id != current.family_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Системные категории доступны только для чтения")
    return cat


@router.patch("/categories/{category_id}", response_model=CategoryOut)
async def update_category(category_id: str, body: CategoryUpdate, db: DbDep, current: CurrentUserDep) -> Category:
    cat = await _get_own_category(db, current, parse_uuid(category_id))
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    await db.flush()
    return cat


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_category(category_id: str, db: DbDep, current: CurrentUserDep) -> None:
    cat = await _get_own_category(db, current, parse_uuid(category_id))
    cat.deleted_at = datetime.now(timezone.utc)
    await db.flush()


# ---------- Теги ----------


@router.get("/tags", response_model=list[TagOut])
async def list_tags(db: DbDep, current: CurrentUserDep) -> list[Tag]:
    stmt = (
        select(Tag)
        .where(Tag.family_id == current.family_id, Tag.deleted_at.is_(None))
        .order_by(Tag.name)
    )
    return list((await db.execute(stmt)).scalars().all())


@router.post("/tags", response_model=TagOut, status_code=status.HTTP_201_CREATED)
async def create_tag(body: TagCreate, db: DbDep, current: CurrentUserDep) -> Tag:
    tag = Tag(family_id=current.family_id, name=body.name.strip().lower(), color=body.color)
    db.add(tag)
    await db.flush()
    return tag


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_tag(tag_id: str, db: DbDep, current: CurrentUserDep) -> None:
    tag = (await db.execute(select(Tag).where(Tag.id == parse_uuid(tag_id)))).scalar_one_or_none()
    if tag is None or tag.family_id != current.family_id or tag.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Тег не найден")
    tag.deleted_at = datetime.now(timezone.utc)
    await db.flush()


# ---------- Контрагенты ----------


@router.get("/counterparties", response_model=list[CounterpartyOut])
async def list_counterparties(db: DbDep, current: CurrentUserDep, q: str | None = None) -> list[Counterparty]:
    stmt = select(Counterparty).where(
        Counterparty.family_id == current.family_id, Counterparty.deleted_at.is_(None)
    )
    if q:
        stmt = stmt.where(Counterparty.name.ilike(f"%{q}%"))
    return list((await db.execute(stmt.order_by(Counterparty.name).limit(200))).scalars().all())


@router.post("/counterparties", response_model=CounterpartyOut, status_code=status.HTTP_201_CREATED)
async def create_counterparty(body: CounterpartyCreate, db: DbDep, current: CurrentUserDep) -> Counterparty:
    cp = Counterparty(family_id=current.family_id, name=body.name.strip(), inn=body.inn, category_id=body.category_id)
    db.add(cp)
    await db.flush()
    return cp


@router.delete("/counterparties/{cp_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_counterparty(cp_id: str, db: DbDep, current: CurrentUserDep) -> None:
    cp = (await db.execute(select(Counterparty).where(Counterparty.id == parse_uuid(cp_id)))).scalar_one_or_none()
    if cp is None or cp.family_id != current.family_id or cp.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Контрагент не найден")
    cp.deleted_at = datetime.now(timezone.utc)
    await db.flush()
