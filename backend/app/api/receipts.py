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
from sqlalchemy.orm import noload
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbDep, csrf_guard, get_current_user, parse_uuid
from app.core.security import limiter
from app.models.enums import ReceiptParseStatus, TransactionType
from app.models.receipt import Receipt, ReceiptItem, ReceiptTransaction
from app.models.transaction import Transaction
from app.schemas.reports import ReceiptOut, ReceiptParseResult, ReceiptUpdate
from app.services import fns, ocr

async def _refresh_noload(db, obj):
    """Обновить scalar-поля объекта через Core SELECT (async-safe: без lazy-load relations)."""
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
        if col.key in mp.attrs:
            set_committed_value(obj, col.key, row[col.key])


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
        "items_total": r.items_total,
        "meta": r.meta,
        "items": [
            {"id": i.id, "name": i.name, "quantity": i.quantity, "price": i.price,
             "total": i.total, "vat_rate": i.vat_rate}
            for i in r.items
        ],
        "transaction_ids": [l.transaction_id for l in r.transaction_links],
        "created_at": r.created_at,
    }
    if include_payload:
        data["qr_payload_raw"] = r.qr_payload_raw
        data["ocr_text"] = r.ocr_text
    return ReceiptOut.model_validate(data)


async def _apply_parse(db: DbDep, r: Receipt, parsed: ocr.OcrResult, status_: ReceiptParseStatus) -> None:
    """Сохраняет OCR-результат: реквизиты + позиции (автопересчёт суммы из позиций, ТЗ 7.4)."""
    r.parse_status = status_
    r.ocr_text = parsed.text[:20000] if parsed.text else r.ocr_text
    if parsed.store_name and not r.store_name:
        r.store_name = parsed.store_name
    if parsed.inn and not r.inn:
        r.inn = parsed.inn
    # позиции
    if parsed.items and not r.items:
        r.items.clear()
        for it in parsed.items:
            r.items.append(
                ReceiptItem(
                    name=str(it["name"])[:500],
                    quantity=Decimal(str(it.get("quantity", 1))),
                    price=Decimal(str(it.get("price", 0))),
                    total=Decimal(str(it.get("total", 0))),
                )
            )
        items_sum = sum((i.total for i in r.items), Decimal("0"))
        if items_sum > 0:
            r.total_amount = items_sum
    elif parsed.total and not r.total_amount:
        r.total_amount = parsed.total
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
            logger.warning(f"Автопарсинг чека {r.id} не удался: {exc}")
            r.parse_status = ReceiptParseStatus.FAILED
            await db.flush()

    await _refresh_noload(db, r)
    return _to_out(r)


async def _parse_internal(db: DbDep, r: Receipt) -> tuple[str, dict | None]:
    """QR ФНС → fallback OCR. Возвращает (method, ответ проверки ФНС)."""
    abs_path = _receipts_root() / r.file_path
    r.parse_status = ReceiptParseStatus.PARSING
    await db.flush()

    # 1) QR-код ФНС
    payload = await asyncio.to_thread(fns.decode_qr, abs_path)
    if payload:
        p = fns.parse_payload(payload)
        if p is not None:
            r.qr_payload_raw = payload[:2000]
            r.total_amount = p.sum2
            r.fiscal_document_number = str(p.fd)
            r.fiscal_sign = p.fp
            meta = dict(p.meta)
            meta["fn"] = p.fn
            if p.receipt_number:
                r.receipt_number = p.receipt_number[:64]
            if p.date:
                r.receipt_date = p.date.replace(tzinfo=timezone.utc)
            check = await fns.check_receipt(p)
            if check:
                meta["fns_check"] = check
                r.store_name = check.get("store_name") or r.store_name
                r.inn = check.get("inn") or r.inn
                r.fiscal_provider_inn = check.get("fiscal_provider_inn") or r.fiscal_provider_inn
                if check.get("items"):
                    r.items.clear()
                    for it in check["items"]:
                        r.items.append(
                            ReceiptItem(
                                name=str(it.get("name", ""))[:500],
                                quantity=Decimal(str(it.get("quantity", 1))),
                                price=Decimal(str(it.get("price", 0))),
                                total=Decimal(str(it.get("total", 0))),
                                vat_rate=it.get("vat_rate"),
                            )
                        )
            r.meta = meta
            r.parse_status = ReceiptParseStatus.PARSED_QR
            await db.flush()
            return "qr", check

    # 2) OCR текстового чека (fallback)
    if r.mime_type == "application/pdf":
        r.parse_status = ReceiptParseStatus.RAW
        return "none", None
    parsed = await asyncio.to_thread(ocr.run_ocr, abs_path)
    if parsed.text:
        # дата чека из OCR недоступна в OcrResult — фиксируем только распознанные поля
        await _apply_parse(db, r, parsed, ReceiptParseStatus.PARSED_OCR)
        return "ocr", None
    r.parse_status = ReceiptParseStatus.FAILED
    await db.flush()
    return "none", None


@router.post("/{receipt_id}/parse", response_model=ReceiptParseResult)
async def parse_receipt(receipt_id: str, db: DbDep, current: CurrentUserDep) -> ReceiptParseResult:
    """Явный запуск распознавания (индикатор обработки на /scan, ТЗ 7.7)."""
    r = await _get_receipt(db, current, parse_uuid(receipt_id))
    method, fns_check = await _parse_internal(db, r)
    await _refresh_noload(db, r)
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
