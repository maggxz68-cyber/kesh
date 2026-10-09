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
from app.services import fns, ocr

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
             "total": i.total, "vat_rate": i.vat_rate}
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
    store_final = parsed.store_name or r.store_name
    inn_final = parsed.inn or r.inn
    text_final = (parsed.text[:20000] if parsed.text else None) or r.ocr_text

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
        )
    )
    set_committed_value(r, "parse_status", status_)
    set_committed_value(r, "total_amount", total_final)
    set_committed_value(r, "store_name", store_final)
    set_committed_value(r, "inn", inn_final)
    set_committed_value(r, "ocr_text", text_final)
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
        except Exception as exc:  # noqa: BLE001 — распознавание не должно ломать загрузку
            logger.warning(f"Автопарсинг чека {r.id} не удался: {exc}", exc_info=True)
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
            logger.error(f"Чек {r.id} не удалось сохранить: {exc2}", exc_info=True)
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                f"Ошибка сохранения чека: {exc2.__class__.__name__}: {str(exc2)[:200]}",
            ) from exc2


async def _parse_internal(db: DbDep, r: Receipt) -> tuple[str, dict | None]:
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
        payload = await asyncio.to_thread(fns.decode_qr, str(abs_path))
    except Exception as exc:  # noqa: BLE001 — pyzbar/PIL могут отсутствовать в окружении
        logger.warning(f"QR-декодирование недоступно ({exc.__class__.__name__}: {exc}); пробуем OCR")
        payload = None
    if payload:
        try:
            p = fns.parse_payload(payload)
        except Exception as exc:  # noqa: BLE001 — повреждённый/нестандартный payload не должен давать 500
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
            meta = dict(p.meta)
            meta["fn"] = p.fn
            meta["operation_type"] = p.operation_type
            if p.receipt_number:
                r.receipt_number = p.receipt_number[:64]
            if p.date:
                r.receipt_date = p.date.replace(tzinfo=timezone.utc) if p.date.tzinfo is None else p.date
            try:
                check = await fns.check_receipt(p)
            except Exception as exc:  # noqa: BLE001 — недоступность API ФНС не должна давать 500
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
                        db.add(
                            ReceiptItem(
                                receipt_id=r.id,
                                name=str(it.get("name", ""))[:500],
                                quantity=Decimal(str(it.get("quantity", 1))),
                                price=Decimal(str(it.get("price", 0))),
                                total=Decimal(str(it.get("total", 0))),
                                vat_rate=it.get("vat_rate"),
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
    if r.mime_type == "application/pdf":
        r.parse_status = ReceiptParseStatus.RAW
        return "none", None
    try:
        parsed = await asyncio.to_thread(ocr.run_ocr, abs_path)
    except Exception as exc:  # noqa: BLE001 — tesseract/cv2 могут отсутствовать в окружении
        logger.error(
            f"OCR недоступен ({exc.__class__.__name__}: {exc}). "
            "Установите tesseract-ocr (+ rus lang), libopencv и pytesseract в образ backend."
        )
        r.parse_status = ReceiptParseStatus.FAILED
        meta = dict(r.meta or {})
        meta["parse_error"] = f"{exc.__class__.__name__}: {str(exc)[:300]}"
        r.meta = meta
        await db.flush()
        return "none", None
    if parsed.text:
        # Если OCR вернул «мусор» (не найдено ни суммы, ни ИНН) — пробуем ещё раз
        # по исходному изображению без OpenCV-предобработки (она иногда портит фото).
        if parsed.total is None and parsed.inn is None:
            try:
                import pytesseract
                from PIL import Image

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


@router.post("/{receipt_id}/parse", response_model=ReceiptParseResult)
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
