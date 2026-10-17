import tempfile
"""Чеки (ТЗ 7.4): загрузка, QR ФНС / OCR-распознавание, привязка M:N к транзакциям.

Хранение файлов: settings.receipts_dir (в docker — volume /data/receipts), в БД — относительный путь.
Защита: лимит размера (MAX_UPLOAD_MB), MIME-whitelist, rate limit на upload.
"""

import asyncio
import mimetypes
import uuid as uuid_mod
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from loguru import logger
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy import update as sa_update
from sqlalchemy.orm import noload
from sqlalchemy.orm.attributes import set_committed_value

from app.core.config import settings
from app.core.deps import CurrentUser, DbDep, csrf_guard, get_current_user, parse_uuid
from app.core.security import limiter
from app.models.enums import ReceiptParseStatus, TransactionType
from app.models.receipt import Receipt, ReceiptItem, ReceiptTransaction
from app.models.transaction import Transaction
from app.schemas.reports import ReceiptOut, ReceiptParseResult, ReceiptUpdate
from app.services import fns, ocr, receipt_categorization
from app.services.ofd_service import fetch_receipt_details
from app.services.store_lookup import get_store_name_by_inn
from app.services.item_categorization import categorize_item

# ==========================================
# Умная нормализация названий магазинов
# ==========================================
STORE_NAME_ALIASES = {
    "интернет решения": "Ozon",
    "ооо интернет решения": "Ozon",
    "интернет решения, ооо": "Ozon",
    'общество с ограниченной ответственностью "интернет решения"': 'Ozon',
    'общество с ограниченной ответственностью "интернет решения"': 'Ozon',
    "www.ozon": "Ozon",
    "ozon.ru": "Ozon",
    "ozon": "Ozon",
    "wildberries": "Wildberries",
    "вайлдберриз": "Wildberries",
    "яндекс маркет": "Яндекс Маркет",
    "яндекс.маркет": "Яндекс Маркет",
    "самокат": "Самокат",
    "lavka": "Яндекс Лавка",
    "пятерочка": "Пятёрочка",
    "pyaterochka": "Пятёрочка",
    "магнит": "Магнит",
    "magnit": "Магнит",
    "перекресток": "Перекрёсток",
    "perekrestok": "Перекрёсток",
    "лента": "Лента",
    "lenta": "Лента",
    "вкусвилл": "ВкусВилл",
    "vkusvill": "ВкусВилл",
}

def normalize_store_name(name: str | None) -> str | None:
    if not name:
        return None
    name_lower = name.lower().strip()
    for alias, clean_name in STORE_NAME_ALIASES.items():
        if alias in name_lower:
            return clean_name
    return name
# ==========================================



async def _refresh_noload(db, obj):
    """Обновить scalar-поля объекта через Core SELECT (async-safe: без lazy-load relations).

    ВАЖНО: не трогаем collection-атрибуты (relationship list) — запись None в
    __dict__ вместо ActiveCollection ломает ORM (AttributeError '_sa_adapter'
    при следующем flush/rollback). Их перезагружаем selectin-запросом отдельно.
    """
    from sqlalchemy import inspect as sa_inspect
    from sqlalchemy import select
    from sqlalchemy.orm.attributes import set_committed_value

    mp = sa_inspect(type(obj)).mapper
    table = mp.local_table
    pk_names = [pk.name for pk in mp.primary_key]
    stmt = select(table).where(*[table.c[n] == getattr(obj, n) for n in pk_names])
    res = await db.execute(stmt)
    row = res.mappings().one()
    for col in table.columns:
        if col.key in mp.attrs and col.key not in mp.relationships:
            set_committed_value(obj, col.key, row[col.key])


async def _reload_receipt_state(db, r: Receipt) -> Receipt:
    """Перезагрузить чек после rollback/ошибок парсинга (async-safe)."""
    fresh = (
        await db.execute(select(Receipt).where(Receipt.id == r.id))
    ).scalar_one_or_none()
    if fresh is None:
        # запись отсутствует в текущей транзакции (например, после rollback)
        return None
    items = (
        await db.execute(select(ReceiptItem).where(ReceiptItem.receipt_id == fresh.id))
    ).scalars().all()
    links = (
        await db.execute(
            select(ReceiptTransaction).where(ReceiptTransaction.receipt_id == fresh.id)
        )
    ).scalars().all()
    set_coll = getattr(fresh, "items", None)
    adapter = getattr(set_coll, "_sa_adapter", None)
    if adapter is not None and hasattr(adapter, "set"):
        adapter.set(items)
    else:  # pragma: no cover - fallback
        fresh.items = list(items)
    set_tl = getattr(fresh, "transaction_links", None)
    tl_adapter = getattr(set_tl, "_sa_adapter", None)
    if tl_adapter is not None and hasattr(tl_adapter, "set"):
        tl_adapter.set(links)
    else:  # pragma: no cover - fallback
        fresh.transaction_links = list(links)
    return fresh


router = APIRouter(dependencies=[Depends(csrf_guard)])
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"}


def _receipts_root() -> Path:
    root = Path(settings.receipts_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


async def _get_receipt(db: DbDep, current: CurrentUser, receipt_id: uuid_mod.UUID) -> Receipt:
    r = (await db.execute(select(Receipt).where(Receipt.id == receipt_id))).scalar_one_or_none()
    if r is None or r.family_id != current.family_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Чек не найден")
    return r


def _to_out(r: Receipt, include_payload: bool = False) -> ReceiptOut:
    items_total = sum((i.total for i in r.items), Decimal("0")) if r.items else Decimal("0")
    data = {
        "id": r.id,
        "original_name": r.original_name,
        "mime_type": r.mime_type,
        "size_bytes": r.size_bytes,
        "parse_status": r.parse_status,
        "store_name": r.store_name,
        "inn": r.inn,
        "receipt_date": r.receipt_date,
        "total_amount": r.total_amount,
        "items_total": items_total,
        "meta": r.meta,
        "items": [
            {"id": i.id, "name": i.name, "quantity": i.quantity, "price": i.price,
             "total": i.total, "vat_rate": i.vat_rate, "category_name": i.category_name}
            for i in (r.items or [])
        ],
        "transaction_ids": [l.transaction_id for l in (r.transaction_links or [])],
        "created_at": r.created_at,
    }
    if include_payload:
        data["qr_payload_raw"] = r.qr_payload_raw
        data["ocr_text"] = r.ocr_text
    return ReceiptOut.model_validate(data)


async def _recreate_failed_receipt(
    db: DbDep, current: CurrentUser, abs_path: Path, file: UploadFile, content: bytes, mime_guess: str
) -> Receipt | None:
    """Пересоздать запись чека со статусом FAILED, если она была потеряна из-за rollback."""
    try:
        r2 = Receipt(
            family_id=current.family_id,
            uploaded_by_id=current.user.id,
            file_path=str(abs_path.relative_to(_receipts_root())),
            original_name=(file.filename or "receipt")[:512],
            mime_type=mime_guess or "image/jpeg",
            size_bytes=len(content),
            parse_status=ReceiptParseStatus.FAILED,
        )
        db.add(r2)
        await db.flush()
        await db.commit()
        logger.info(f"Чек пересоздан после сбоя парсинга: {r2.id}")
        return r2
    except Exception as exc:  # noqa: BLE001
        logger.error(f"Не удалось пересоздать чек: {exc}", exc_info=True)
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass
        return None


async def _apply_parse(db: DbDep, r: Receipt, parsed: ocr.OcrResult | None, status_: ReceiptParseStatus) -> None:
    """Сохраняет OCR-результат: реквизиты + позиции (автопересчёт суммы из позиций, ТЗ 7.4).

    ВАЖНО: после db.rollback() scalar-поля объекта остаются «грязными» (в history),
    и присваивание им тех же значений не создаёт UPDATE — в БД оставался NULL
    (отсюда «Сумма чека: 0,00 ₽»). Поэтому store_name/inn/ocr_text total_amount
    принудительно сбрасываем через Core UPDATE.
    """
    if parsed is None:
        parsed = ocr.OcrResult()
    # Гарантируем списки даже при None (fix 'NoneType' object is not iterable)
    parsed_items = list(parsed.items or [])
    existing = list(r.items or [])

    new_items_sum: Decimal | None = None
    if parsed_items and not existing:
        for it in parsed_items:
            new_item = ReceiptItem(
                receipt_id=r.id,
                name=str(it.get("name", "Позиция"))[:500],
                quantity=Decimal(str(it.get("quantity", 1) or 1)),
                price=Decimal(str(it.get("price", 0) or 0)),
                total=Decimal(str(it.get("total", 0) or 0)),
            )
            db.add(new_item)
            existing.append(new_item)
        s = sum((i.total for i in existing), Decimal("0"))
        if s > 0:
            new_items_sum = s

    # Автопересчёт из позиций имеет приоритет над OCR-полем «ИТОГ» и старым значением (ТЗ 7.4)
    total_final = new_items_sum if new_items_sum is not None else (r.total_amount or parsed.total or Decimal("0"))
    
    # Умное определение магазина: приоритет у ИНН, так как это 100% точно
    from app.services.receipt_categorization import get_store_by_inn
    inn_final = parsed.inn or r.inn
    store_by_inn = get_store_by_inn(inn_final)
    
    if store_by_inn:
        store_final = store_by_inn
    else:
        inn_final = parsed.inn or r.inn
    from app.services.receipt_categorization import get_store_by_inn
    store_by_inn = get_store_by_inn(inn_final)
    if store_by_inn:
        store_final = store_by_inn
    else:
        store_final = parsed.store_name or r.store_name
        if store_final in (None, "", "None"): store_final = None
        # Очищаем мусорные значения, если они вдруг попали туда
        if store_final in (None, "None", None, ""):
            store_final = None
    
    # Автокатегоризация по магазину
    suggested_category = None
    if store_final or inn_final:
        suggested_category = receipt_categorization.categorize_by_store(store_final, inn_final)
    text_final = (parsed.text[:20000] if parsed.text else None) or r.ocr_text
    
    # Обработка даты из OCR (может быть строкой 'YYYY-MM-DD' или объектом date/datetime)
    date_final = getattr(r, 'receipt_date', None)
    if getattr(parsed, 'receipt_date', None):
        try:
            from datetime import datetime, date
            if isinstance(parsed.receipt_date, str):
                date_final = datetime.fromisoformat(parsed.receipt_date).date()
            elif isinstance(parsed.receipt_date, (datetime, date)):
                date_final = parsed.receipt_date
        except Exception:
            pass
    
    # Автокатегоризация по магазину
    suggested_category = None
    if store_final or inn_final:
        suggested_category = receipt_categorization.categorize_by_store(store_final, inn_final)
    
    # Сохраняем категорию в meta
    meta_current = dict(r.meta or {})
    if suggested_category:
        meta_current["suggested_category"] = suggested_category
        meta_current["suggested_category_name"] = receipt_categorization.get_category_display_name(suggested_category)

    r.parse_status = status_
    await db.flush()
    # Принудительный Core UPDATE — гарантирует запись даже после rollback
    await db.execute(
        sa_update(Receipt)
        .where(Receipt.id == r.id)
        .values(
            parse_status=status_,
            total_amount=total_final,
            store_name=store_final,
            inn=inn_final,
            ocr_text=text_final,
            receipt_date=date_final,
            meta=meta_current,
        )
    )
    set_committed_value(r, "parse_status", status_)
    set_committed_value(r, "total_amount", total_final)
    set_committed_value(r, "store_name", store_final)
    set_committed_value(r, "inn", inn_final)
    set_committed_value(r, "ocr_text", text_final)
    set_committed_value(r, "receipt_date", date_final)
    await db.flush()


@router.post("/upload", response_model=ReceiptOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.rate_limit_upload)
async def upload_receipt(
    request: Request,  # нужен SlowAPI (limiter)
    db: DbDep,
    current: CurrentUserDep,
    file: UploadFile = File(...),
    auto_parse: bool = Query(True, description="Сразу попробовать распознать QR/OCR"),
) -> ReceiptOut:
    """Загрузка снимка чека с камеры телефона или из галереи."""
    # MIME whitelist (проверяем и declared, и определённый по расширению)
    mime = (file.content_type or "").lower()
    guessed = mimetypes.guess_type(file.filename or "")[0]
    if mime and mime not in ALLOWED_MIME:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f"Недопустимый тип файла: {mime}")
    if guessed and guessed not in ALLOWED_MIME:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f"Недопустимое расширение файла: {guessed}")

    max_bytes = settings.max_upload_mb * 1024 * 1024
    content = await file.read()
    logger.info(f"📥 Загружен файл: name={file.filename}, mime={mime}, guessed={guessed}, size={len(content)} bytes")
    if len(content) == 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Пустой файл")
    if len(content) > max_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Файл больше лимита {settings.max_upload_mb} МБ",
        )

    fam_dir = _receipts_root() / str(current.family_id)
    fam_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "receipt.jpg").suffix.lower() or ".jpg"
    fname = f"{uuid_mod.uuid4().hex}{ext}"
    abs_path = fam_dir / fname
    abs_path.write_bytes(content)

    r = Receipt(
        family_id=current.family_id,
        uploaded_by_id=current.user.id,
        file_path=str(abs_path.relative_to(_receipts_root())),
        original_name=(file.filename or "receipt")[:512],
        mime_type=mime or guessed or "image/jpeg",
        size_bytes=len(content),
        parse_status=ReceiptParseStatus.RAW,
    )
    db.add(r)
    await db.flush()

    if auto_parse:
        try:
            await _parse_internal(db, r)
        except ValueError as e:
            # _parse_internal специально выбрасывает ValueError("DUPLICATE_RECEIPT:<id>") при дубликате
            if str(e).startswith("DUPLICATE_RECEIPT:"):
                existing_id = str(e).split(":")[1]
                logger.warning(f"⚠️ Обнаружен дубликат чека. Существующий ID: {existing_id}")
                
                # Откатываем создание нового чека
                await db.rollback()
                
                # Безопасно получаем существующий чек
                from sqlalchemy.orm import selectinload
                stmt = select(Receipt).where(Receipt.id == existing_id).options(
                    selectinload(Receipt.items),
                    selectinload(Receipt.transaction_links)
                )
                res = await db.execute(stmt)
                fresh = res.scalar_one_or_none()
                
                if fresh:
                    out_obj = _to_out(fresh)
                    return out_obj.model_copy(update={"warning": "Этот чек уже был загружен ранее"})
                else:
                    raise HTTPException(status.HTTP_409_CONFLICT, "Чек уже существует, но не найден в БД")
            else:
                raise e # Пробрасываем другие ValueError
        except IntegrityError:
            # Дубликат - просто сообщаем клиенту
            logger.info(f"✅ Дубликат чека: fn={r.fiscal_document_number}, fp={r.fiscal_sign}")
            raise HTTPException(
                status.HTTP_409_CONFLICT, 
                "Этот чек уже был загружен ранее"
            )
        except Exception as exc:  # noqa: BLE001 — распознавание не должно ломать загрузку
            logger.warning("Автопарсинг чека {} не удался: {}", r.id, str(exc), exc_info=True)
            try:
                await db.rollback()
            except Exception:  # noqa: BLE001
                pass
            # ВАЖНО: после rollback неостановленный flush/commit приведёт к потере
            # записи (No row was found при финализации). Принудительно коммитим чек
            # со статусом FAILED.
            try:
                r = await _reload_receipt_state(db, r)
                if r is not None and r.id is not None:
                    await db.execute(
                        sa_update(Receipt)
                        .where(Receipt.id == r.id)
                        .values(parse_status=ReceiptParseStatus.FAILED)
                    )
                    set_committed_value(r, "parse_status", ReceiptParseStatus.FAILED)
                    await db.commit()
                else:
                    r = await _recreate_failed_receipt(db, current, abs_path, file, content, mime or guessed)
            except Exception as exc2:  # noqa: BLE001
                logger.error(f"Не удалось зафиксировать чек после сбоя парсинга: {exc2}", exc_info=True)
                try:
                    await db.rollback()
                except Exception:  # noqa: BLE001
                    pass

    # Финальный шлюз: любые ошибки сохранения/перезагрузки НЕ должны превращаться
    # в голый Internal Server Error (500) для клиента. Чек уже сохранён на диск и в БД.
    try:
        if r is None or getattr(r, "id", None) is None:
            raise RuntimeError("Запись чека отсутствует в БД после загрузки")
        
        await _refresh_noload(db, r)
        
        # БЕЗОПАСНАЯ загрузка items для асинхронной SQLAlchemy:
        # 1. Явно запрашиваем товары из БД
        items_result = await db.execute(
            select(ReceiptItem).where(ReceiptItem.receipt_id == r.id)
        )
        loaded_items = list(items_result.scalars().all())
        
        # 2. Безопасно внедряем их в объект r, избегая lazy-load и greenlet_spawn ошибок
        from sqlalchemy.orm.attributes import set_committed_value
        set_committed_value(r, 'items', loaded_items)
        
        r.store_name = normalize_store_name(r.store_name)
        return _to_out(r)
    except Exception as exc:  # noqa: BLE001
        logger.error(f"Ошибка финализации загрузки чека: {exc}", exc_info=True)
        try:
            await db.rollback()
            r3 = await _reload_receipt_state(db, r) if r is not None else None
            if r3 is None:
                r3 = await _recreate_failed_receipt(
                    db, current, abs_path, file, content, mime or guessed or "image/jpeg"
                )
            if r3 is None:
                raise RuntimeError("Чек не удалось сохранить в БД")
            return _to_out(r3)
        except HTTPException:
            raise
        except Exception as exc2:  # noqa: BLE001
            # удаляем файл, если запись в БД так и не стала доступна
            try:
                abs_path.unlink(missing_ok=True)
            except OSError:
                pass
            logger.error(f"Чек {r.id if r else 'UNKNOWN'} не удалось сохранить: {exc2}", exc_info=True)
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                f"Ошибка сохранения чека: {exc2.__class__.__name__}: {str(exc2)[:200]}",
            ) from exc2


async def _parse_internal(db: DbDep, r: Receipt) -> tuple[str, dict | None]:
    logger.info(f"🚀 НАЧАЛО _parse_internal для чека {r.id}, файл: {r.file_path}")
    abs_path = _receipts_root() / r.file_path
    logger.info(f"📁 Абсолютный путь: {abs_path}, существует: {abs_path.exists()}, размер: {abs_path.stat().st_size if abs_path.exists() else 0} bytes")
    """QR ФНС → fallback OCR. Возвращает (method, ответ проверки ФНС).

    Безопасно для async: связи r.items / r.transaction_links объявлены как
    lazy="selectin" и уже загружены при получении чека; изменённые позиции
    перезагружаются через select-запрос после flush.
    """
    abs_path = _receipts_root() / r.file_path
    r.parse_status = ReceiptParseStatus.PARSING
    await db.flush()

    async def _reload_items(receipt: Receipt) -> list[ReceiptItem]:
        return list(
            (
                await db.execute(
                    select(ReceiptItem).where(ReceiptItem.receipt_id == receipt.id)
                )
            )
            .scalars()
            .all()
        )

    # 1) QR-код ФНС
    try:
        logger.info("🔍 Пытаемся декодировать QR-код...")
        
        # 🎯 ПРОФЕССИОНАЛЬНАЯ ПРЕДОБРАБОТКА QR (как в мобильных сканерах)
        qr_path = str(abs_path)
        try:
            from PIL import Image, ImageOps
            import tempfile
            
            with Image.open(abs_path) as img:
                # 1. Поворот по EXIF (чтобы не было боком)
                img = ImageOps.exif_transpose(img)
                
                # 2. Перевод в оттенки серого (цвет = шум для zbar)
                img = img.convert('L')
                
                # 3. Уменьшение размера. zbar ИДЕАЛЬНО работает на изображениях ~800-1000px
                # На огромных фото с телефона он просто "теряет" мелкий QR-код
                img.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
                
                # 4. БИНАРИЗАЦИЯ (Магия!): Убирает тени, блики и шум бумаги.
                # Все пиксели ярче 128 становятся белыми (255), темнее - чёрными (0).
                img = img.point(lambda p: 255 if p > 128 else 0)
                
                # 5. Сохраняем в PNG (для идеальных чёрно-белых границ без JPEG-артефактов)
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                    img.save(tmp.name, "PNG")
                    qr_path = tmp.name
                    logger.info(f"✅ QR-изображение оптимизировано: размер={img.size}, бинаризовано")
        except Exception as prep_err:
            logger.warning(f"⚠️ QR prep failed: {prep_err}")
            
        payload = await asyncio.to_thread(fns.decode_qr, qr_path)
        logger.info(f"Результат decode_qr: {repr(payload)}")
    except Exception as exc:
        logger.warning(f"QR-декодирование недоступно ({exc.__class__.__name__}: {exc}); пробуем OCR")
        payload = None
    if payload:
        logger.info("✅ QR-код найден, парсим payload...")
        try:
            p = fns.parse_payload(payload)
        except Exception as exc:  # noqa: BLE001
            logger.error(f"Не удалось разобрать QR-payload '{payload[:200]}': {exc}", exc_info=True)
            p = None
            
        if p is not None:
            logger.info(
                f"Распарсенные данные QR: sum={p.sum2}, type_tag={p.type_tag}, "
                f"operation={p.operation_type}, fd={p.fd}, fn={p.fn}, fp={p.fp}, date={p.date}"
            )
            r.qr_payload_raw = payload[:2000]
            r.total_amount = p.sum2 if p.sum2 else (r.total_amount or Decimal("0"))
            r.fiscal_document_number = str(p.fd)
            r.fiscal_sign = p.fp
            
            # Проверка на дубликат по уникальным реквизитам
            if p.fd and p.fp:
                dup_check = await db.execute(
                    select(Receipt).where(
                        Receipt.fiscal_document_number == str(p.fd),
                        Receipt.fiscal_sign == p.fp
                    )
                )
                existing = dup_check.scalars().first()
                if existing:
                    # Не прерываем выполнение вручную. 
                    # Позволим SQLAlchemy самой вызвать IntegrityError при попытке сохранить дубликат.
                    # Это самый надежный и стандартный способ.
                    pass
            meta = dict(p.meta)
            meta["fn"] = p.fn
            meta["operation_type"] = p.operation_type
            if p.receipt_number:
                r.receipt_number = p.receipt_number[:64]
            if p.date:
                r.receipt_date = p.date.replace(tzinfo=timezone.utc) if p.date.tzinfo is None else p.date
            
            # Запускаем минимальный OCR для извлечения магазина и ИНН
            try:
                from app.services.receipt_minimal_ocr import extract_store_and_inn
                ocr_data = await asyncio.to_thread(extract_store_and_inn, str(abs_path))
                if ocr_data.get('inn') and not r.inn:
                    r.inn = ocr_data['inn']  # Исправлена опечатка из исходного кода (было ocd_data)
                if ocr_data.get('store_name') and not r.store_name:
                    r.store_name = ocr_data['store_name']
            except Exception as exc:
                logger.warning("Минимальный OCR не удался: {}", str(exc))
            
            # Автокатегоризация по магазину/ИНН
            try:
                from app.services.receipt_categorization import categorize_by_store, get_category_display_name
                category = categorize_by_store(r.store_name, r.inn)
                if category:
                    meta["suggested_category"] = category
                    meta["suggested_category_name"] = get_category_display_name(category)
                    logger.info(f"Автокатегория: {category} ({get_category_display_name(category)})")
            except Exception as exc:
                logger.warning("Автокатегоризация не удалась: {}", str(exc))

            # --- 🟢 НАЧАЛО: ИНТЕГРАЦИЯ OFD.RU ---
            ofd_data = await fetch_receipt_details(payload)
            if ofd_data and "Document" in ofd_data:
                doc = ofd_data["Document"]
                
                # Логируем ключевые поля OFD.ru для отладки
                logger.info(f"OFD.ru Document поля: User='{doc.get('User')}', UserInn='{doc.get('UserInn')}', RetailPlaceAddress='{doc.get('RetailPlaceAddress')}'")
                
                # 1. Обогащаем данные чека из OFD, если их нет из OCR
                if not r.inn and doc.get("UserInn"):
                    r.inn = str(doc.get("UserInn"))
                if not r.store_name and doc.get("User"):
                    r.store_name = str(doc.get("User"))[:500]
                # Fallback: если User пустой, пробуем RetailPlaceAddress
                if not r.store_name and doc.get("RetailPlaceAddress"):
                    r.store_name = str(doc.get("RetailPlaceAddress"))[:500]

                # 2. Сохраняем товары из OFD.ru
                items = doc.get("Items", [])
                if items:
                    # Очищаем старые, если были (на всякий случай)
                    for old in await _reload_items(r):
                        await db.delete(old)

                    for it in items:
                        # OFD.ru возвращает цены в копейках (целые числа), переводим в рубли (Decimal)
                        price_kopecks = it.get("Price", 0)
                        total_kopecks = it.get("Total", 0)
                        quantity = float(it.get("Quantity", 1.0))

                        # Определяем категорию товара
                        item_name = str(it.get("Name", "Товар"))[:500]
                        db.add(
                            ReceiptItem(
                                receipt_id=r.id,
                                name=item_name,
                                quantity=Decimal(str(quantity)),
                                price=Decimal(str(price_kopecks)) / Decimal("100"),
                                total=Decimal(str(total_kopecks)) / Decimal("100"),
                                vat_rate=None,
                                category_name=categorize_item(item_name),
                            )
                        )
                    await db.flush()
                    logger.info(f"✅ Успешно загружено {len(items)} товаров из OFD.ru")
            # --- 🔴 КОНЕЦ: ИНТЕГРАЦИЯ OFD.RU ---

            # Пытаемся определить название магазина по ИНН (приоритет над адресом кассы)
            if r.inn:
                try:
                    store_from_inn = await get_store_name_by_inn(db, r.inn)
                    if store_from_inn:
                        # Если текущее имя похоже на адрес или пустое, заменяем его на название сети
                        if not r.store_name or any(word in r.store_name.lower() for word in ["москва", "проспект", "улица", "шоссе", "бульвар", "г."]):
                            r.store_name = store_from_inn
                            logger.info(f"✅ Магазин переопределён по ИНН {r.inn}: {store_from_inn}")
                except Exception as exc:
                    logger.warning(f"Не удалось определить магазин по ИНН: {exc}")

            # 3. Проверка чека в ФНС (если ФНС вернет товары, они перезапишут данные OFD, что правильно)
            try:
                check = await fns.check_receipt(p)
            except Exception as exc:  # noqa: BLE001
                logger.error(f"Проверка чека в ФНС завершилась ошибкой: {exc}", exc_info=True)
                check = None
                
            if check:
                meta["fns_check"] = check
                r.store_name = check.get("store_name") or r.store_name
                r.inn = check.get("inn") or r.inn
                r.fiscal_provider_inn = check.get("fiscal_provider_inn") or r.fiscal_provider_inn
                
                if check.get("items"):
                    for old in await _reload_items(r):
                        await db.delete(old)
                    for it in check["items"]:
                        item_name = str(it.get("name", ""))[:500]
                        db.add(
                            ReceiptItem(
                                receipt_id=r.id,
                                name=item_name,
                                quantity=Decimal(str(it.get("quantity", 1))),
                                price=Decimal(str(it.get("price", 0))),
                                total=Decimal(str(it.get("total", 0))),
                                vat_rate=it.get("vat_rate"),
                                category_name=categorize_item(item_name),
                            )
                        )
                    await db.flush()
                    new_items = await _reload_items(r)
                    s = sum((i.total for i in new_items), Decimal("0"))
                    if s > 0:
                        r.total_amount = s
                        
            r.meta = meta
            r.parse_status = ReceiptParseStatus.PARSED_QR
            await db.flush()
            return "qr", check

    # 2) OCR текстового чека (fallback)
    logger.info("🚀 ДОШЛИ ДО FALLBACK OCR! Проверяем условия...")
    if r.mime_type == "application/pdf":
        logger.info("📄 Это PDF, пропускаем OCR")
        r.parse_status = ReceiptParseStatus.RAW
        return "none", None
        
    logger.info(f"🔍 Запускаем OCR для файла: {abs_path} (размер: {abs_path.stat().st_size} bytes)")
    
    # 🛡️ БЕЗОПАСНАЯ ПРЕДОБРАБОТКА ДЛЯ МОБИЛЬНЫХ ФОТО (EXIF + Resize)
    ocr_target_path = abs_path
    try:
        # Явный импорт внутри блока для 100% защиты от конфликтов имен в Python 3.12+
        import PIL.Image as PILImage
        import PIL.ImageOps as PILImageOps
        import tempfile as tempfile_mod
        
        with PILImage.open(abs_path) as img:
            # 1. Автоповорот по EXIF
            img = PILImageOps.exif_transpose(img)
            
            # 2. Уменьшение размера
            max_dim = 2000
            if max(img.size) > max_dim:
                ratio = max_dim / max(img.size)
                new_size = tuple(int(dim * ratio) for dim in img.size)
                img = img.resize(new_size, PILImage.Resampling.LANCZOS)
            
            # 3. Конвертация в оттенки серого
            if img.mode != 'L':
                img = img.convert('L')
            
            # 4. Повышение контраста для текста (метод Otsu для бинаризации)
            import numpy as np
            img_array = np.array(img)
            # Простая бинаризация: пиксели темнее 128 -> 0 (чёрный), светлее -> 255 (белый)
            img_array = np.where(img_array < 128, 0, 255).astype(np.uint8)
            img = PILImage.fromarray(img_array)
            logger.info("📝 Применена бинаризация (чёрно-белый текст)")
                
            # Сохраняем во временный файл для OCR
            with tempfile_mod.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                img.save(tmp.name, 'PNG')
                ocr_target_path = tmp.name
                logger.info(f"🖼️ Изображение подготовлено: размер={img.size}, режим={img.mode}, путь={tmp.name}")
    except Exception as prep_err:
        logger.warning(f"⚠️ Не удалось подготовить изображение ({prep_err}), используем оригинал")
        ocr_target_path = abs_path

    try:
        parsed = await asyncio.to_thread(ocr.run_ocr, ocr_target_path)
        logger.info(f"✅ OCR завершился успешно! Результат: {repr(parsed)[:300] if parsed else 'Пусто'}...")
    except Exception as exc:  # noqa: BLE001
        logger.error(
            f"❌ КРИТИЧЕСКАЯ ОШИБКА OCR ({exc.__class__.__name__}: {exc}).",
            exc_info=True  # <-- Это выведет полный стек вызовов в логи!
        )
        r.parse_status = ReceiptParseStatus.FAILED
        await db.flush()
        return "ocr_failed", None
        meta = dict(r.meta or {})
        meta["parse_error"] = f"{exc.__class__.__name__}: {str(exc)[:300]}"
        r.meta = meta
        await db.flush()
        return "none", None
        
    if parsed.text:
        if parsed.total is None and parsed.inn is None:
            try:
                import pytesseract
                from PIL import Image, ImageOps

                with Image.open(str(abs_path)) as raw_im:
                    raw_text = await asyncio.to_thread(
                        lambda: pytesseract.image_to_string(raw_im, lang="rus+eng", config="--psm 6")
                    )
                reparsed = ocr.parse_ocr_text(raw_text)
                if (reparsed.total is not None or reparsed.inn is not None) and (
                    (reparsed.total or 0) >= (parsed.total or 0)
                ):
                    logger.info("OCR с предобработкой дал мусор — использован повторный проход по оригиналу")
                    parsed = reparsed if reparsed.text else parsed
            except Exception as exc:  # noqa: BLE001
                logger.warning(f"Повторный OCR-проход не удался: {exc}")
        await _apply_parse(db, r, parsed, ReceiptParseStatus.PARSED_OCR)
        return "ocr", None
        
    r.parse_status = ReceiptParseStatus.FAILED
    await db.flush()
    return "none", None
async def parse_receipt(receipt_id: str, db: DbDep, current: CurrentUserDep) -> ReceiptParseResult:
    """Явный запуск распознавания (индикатор обработки на /scan, ТЗ 7.7)."""
    r = await _get_receipt(db, current, parse_uuid(receipt_id))
    try:
        method, fns_check = await _parse_internal(db, r)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — понятное сообщение вместо голого 500
        logger.error(f"Ошибка распознавания чека {receipt_id}: {exc}", exc_info=True)
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Ошибка распознавания: {exc.__class__.__name__}: {str(exc)[:300]}",
        ) from exc
    try:
        await _refresh_noload(db, r)
    except Exception as exc:  # noqa: BLE001
        logger.error(f"Ошибка перезагрузки чека после парсинга: {exc}", exc_info=True)
        try:
            await db.rollback()
            r = await _reload_receipt_state(db, r)
        except Exception as exc2:  # noqa: BLE001
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                f"Ошибка распознавания: {exc2.__class__.__name__}: {str(exc2)[:300]}",
            ) from exc2
    return ReceiptParseResult(receipt=_to_out(r, include_payload=True), method=method, fns_check=fns_check)


@router.get("", response_model=list[ReceiptOut])
async def list_receipts(
    db: DbDep, current: CurrentUserDep, limit: int = Query(100, ge=1, le=500)
) -> list[ReceiptOut]:
    rows = (
        await db.execute(
            select(Receipt)
            .where(Receipt.family_id == current.family_id)
            .order_by(Receipt.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [_to_out(r) for r in rows]


@router.get("/{receipt_id}", response_model=ReceiptOut)
async def get_receipt(receipt_id: str, db: DbDep, current: CurrentUserDep) -> ReceiptOut:
    r = await _get_receipt(db, current, parse_uuid(receipt_id))
    return _to_out(r, include_payload=True)


@router.get("/{receipt_id}/file")
async def download_receipt(receipt_id: str, db: DbDep, current: CurrentUserDep) -> FileResponse:
    """Скачивание изображения чека (ТЗ 7.4)."""
    r = await _get_receipt(db, current, parse_uuid(receipt_id))
    path = _receipts_root() / r.file_path
    if not path.exists():
        raise HTTPException(status.HTTP_410_GONE, "Файл чека утрачен")
    return FileResponse(path, media_type=r.mime_type, filename=r.original_name or path.name)


@router.patch("/{receipt_id}", response_model=ReceiptOut)
async def update_receipt(receipt_id: str, body: ReceiptUpdate, db: DbDep, current: CurrentUserDep) -> ReceiptOut:
    """Редактирование реквизитов и перепривязка к транзакциям (M:N)."""
    r = await _get_receipt(db, current, parse_uuid(receipt_id))
    if body.store_name is not None:
        r.store_name = body.store_name[:300]
    if body.transaction_ids is not None:
        txs = (
            await db.execute(
                select(Transaction).where(
                    Transaction.id.in_(body.transaction_ids),
                    Transaction.family_id == current.family_id,
                    Transaction.deleted_at.is_(None),
                )
            )
        ).scalars().all()
        if len(txs) != len(set(body.transaction_ids)):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Транзакция не найдена в вашей семье")
        r.transaction_links.clear()
        for tx in txs:
            r.transaction_links.append(ReceiptTransaction(transaction_id=tx.id))
        await db.flush()
        for tx in txs:
            tx.has_receipt = True
    await db.flush()
    await _refresh_noload(db, r)
    return _to_out(r)


@router.delete("/{receipt_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_receipt(receipt_id: str, db: DbDep, current: CurrentUserDep) -> None:
    r = await _get_receipt(db, current, parse_uuid(receipt_id))
    links = [l.transaction_id for l in r.transaction_links]
    path = _receipts_root() / r.file_path
    await db.delete(r)
    await db.flush()
    # снимаем признак «есть чек», если других чеков не осталось
    for tx_id in links:
        remaining = (
            await db.execute(
                select(ReceiptTransaction.receipt_id)
                .where(ReceiptTransaction.transaction_id == tx_id)
                .limit(1)
            )
        ).scalar_one_or_none()
        if remaining is None:
            tx = (await db.execute(select(Transaction).where(Transaction.id == tx_id))).scalar_one_or_none()
            if tx is not None:
                tx.has_receipt = False
    try:
        path.unlink(missing_ok=True)
    except OSError as exc:
        logger.warning(f"Не удалось удалить файл чека {path}: {exc}")
    await db.flush()
