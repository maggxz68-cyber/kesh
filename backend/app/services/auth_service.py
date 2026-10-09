"""Сервис аутентификации: регистрация семьи, вход, refresh-ротация, demo-sandbox."""
from __future__ import annotations

import uuid as _uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_token, hash_password, verify_password
from app.models.enums import UserRole
from app.models.family import Family, SuperAdmin, User
from app.models.transaction import affected_account_ids, mark_accounts_dirty
from app.services.family_template import populate_family_reference

DEMO_EMAIL = "demo@example.com"


@dataclass
class TokenPair:
    access_token: str
    refresh_token: str
    access_exp: datetime
    refresh_exp: datetime
    csrf_token: str


def issue_tokens(
    *, user_id: _uuid.UUID | None, family_id: _uuid.UUID | None,
    is_superadmin: bool = False, is_demo: bool = False,
    impersonator_id: int | None = None,
) -> TokenPair:
    import secrets

    sub = str(user_id if user_id is not None else 0)
    fid = str(family_id) if family_id is not None else None
    kind_a: str = "superadmin_access" if is_superadmin else "access"
    kind_r: str = "superadmin_refresh" if is_superadmin else "refresh"
    access, a_exp = create_token(
        sub=sub, kind=kind_a, family_id=fid,  # type: ignore[arg-type]
        is_superadmin=is_superadmin, is_demo=is_demo, impersonator_id=impersonator_id,
    )
    refresh, r_exp = create_token(
        sub=sub, kind=kind_r, family_id=fid,  # type: ignore[arg-type]
        is_superadmin=is_superadmin, is_demo=is_demo, impersonator_id=impersonator_id,
    )
    return TokenPair(access, refresh, a_exp, r_exp, secrets.token_urlsafe(32))


async def register_family(
    session: AsyncSession,
    *,
    family_name: str,
    name: str,
    email: str,
    password: str,
    timezone_str: str = "Europe/Moscow",
    currency: str = "RUB",
) -> tuple[Family, User]:
    """ТЗ 5.1: семья + owner + полный шаблон справочников (без денежных данных)."""
    email = email.strip().lower()
    exists = (await session.execute(select(User.id).where(func.lower(User.email) == email))).first()
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email уже зарегистрирован")

    fam = Family(name=family_name.strip(), timezone=timezone_str, currency=currency)
    session.add(fam)
    await session.flush()

    owner = User(
        family_id=fam.id, email=email, name=name.strip(),
        role=UserRole.OWNER, password_hash=hash_password(password),
    )
    session.add(owner)
    await session.flush()

    await populate_family_reference(session, fam.id, currency=currency)
    return fam, owner


async def authenticate_user(session: AsyncSession, email: str, password: str) -> User:
    identifier = email.strip().lower()
    # Гибкий вход (ТЗ 4.1/5.2): допускаем ИЛИ email, ИЛИ логин супер-админа
    # (например "admin"/"1968" без символа @ — браузерная валидация раньше
    # блокировала такой ввод). Пароли проверяются разными хэшами, подбора нет.
    if "@" not in identifier:
        sa = (
            await session.execute(select(SuperAdmin).where(func.lower(SuperAdmin.login) == identifier))
        ).scalar_one_or_none()
        if sa is not None and verify_password(password, sa.password_hash):
            fam = (
                await session.execute(
                    select(Family).where(Family.is_demo.is_(True), Family.is_sandbox.is_(False))
                    .order_by(Family.created_at.asc())
                )
            ).scalars().first()
            if fam is not None:
                demo_owner = (
                    await session.execute(
                        select(User).where(User.family_id == fam.id, User.deleted_at.is_(None))
                        .order_by(User.created_at.asc())
                    )
                ).scalars().first()
                if demo_owner is not None:
                    sa.last_login_at = datetime.now(timezone.utc)
                    demo_owner.last_login_at = sa.last_login_at
                    return demo_owner

    user = (
        await session.execute(select(User).where(func.lower(User.email) == identifier))
    ).scalar_one_or_none()
    if user is None or user.deleted_at is not None or not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный email или пароль")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Пользователь заблокирован")
    fam = await session.get(Family, user.family_id)
    if fam is None or fam.deleted_at is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Семья удалена")
    if fam.is_blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Семья заблокирована администратором")
    user.last_login_at = datetime.now(timezone.utc)
    return user


async def authenticate_superadmin(session: AsyncSession, login: str, password: str) -> SuperAdmin:
    sa = (await session.execute(select(SuperAdmin).where(SuperAdmin.login == login))).scalar_one_or_none()
    if sa is None or not verify_password(password, sa.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный логин или пароль")
    sa.last_login_at = datetime.now(timezone.utc)
    return sa


# --- Demo sandbox (ТЗ 5.2) -----------------------------------------------------

async def create_demo_sandbox(session: AsyncSession) -> tuple[Family, User]:
    """Персональная sandbox-копия демо-семьи для гостя (TTL = sandbox_ttl_hours).

    Копируются все сущности демо-семьи (счета, категории, транзакции, чеки-метаданные,
    бюджеты, теги); файлы изображений чеков не дублируются (read-only по пути).
    Если эталонной демо-семьи ещё нет (не засиджена) — создаётся пустая семья-шаблон.
    """
    # эталонная демо-семья: is_demo=True и НЕ sandbox (иначе копировали бы песочницу)
    demo = (
        await session.execute(
            select(Family).where(
                Family.is_demo.is_(True), Family.is_sandbox.is_(False), Family.deleted_at.is_(None)
            )
        )
    ).scalars().first()

    sandbox = Family(
        name="Демо (песочница)",
        timezone=demo.timezone if demo else "Europe/Moscow",
        currency=demo.currency if demo else "RUB",
        is_demo=True,
        is_sandbox=True,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=settings.sandbox_ttl_hours),
    )
    session.add(sandbox)
    await session.flush()

    guest_email = f"sandbox-{uuid4hex()}@demo.invalid"
    guest = User(
        family_id=sandbox.id,
        email=guest_email,
        name="Гость демо",
        role=UserRole.OWNER,
        # Пароль не нужен: вход только через /auth/demo-login (is_demo=true в JWT)
        password_hash=hash_password(_uuid.uuid4().hex),
    )
    session.add(guest)
    await session.flush()

    if demo is not None:
        await _copy_family_data(session, demo.id, sandbox.id)
    else:
        await populate_family_reference(session, sandbox.id, currency=sandbox.currency)
    return sandbox, guest


def uuid4hex() -> str:
    return _uuid.uuid4().hex[:12]


async def _copy_family_data(session: AsyncSession, src: _uuid.UUID, dst: _uuid.UUID) -> None:
    """Поверхностное копирование справочников и транзакций демо-семьи в sandbox."""
    from app.models.receipt import Receipt, ReceiptItem
    from app.models.reference import Account, Category, Counterparty, Tag
    from app.models.transaction import Budget, Transaction, transaction_tags

    id_map: dict[str, dict[_uuid.UUID, _uuid.UUID]] = {"accounts": {}, "categories": {}, "tags": {}, "counterparties": {}}

    for account in (await session.execute(select(Account).where(Account.family_id == src, Account.deleted_at.is_(None)))).scalars():
        new = Account(
            family_id=dst, name=account.name, type=account.type, currency=account.currency,
            opening_balance=account.opening_balance, balance=account.balance,
            icon=account.icon, color=account.color, sort_order=account.sort_order,
        )
        session.add(new)
        await session.flush()
        id_map["accounts"][account.id] = new.id

    for cat in (await session.execute(select(Category).where(Category.family_id == src, Category.deleted_at.is_(None)).order_by(Category.parent_id.isnot(None)))).scalars():
        new = Category(
            family_id=dst, name=cat.name, kind=cat.kind, icon=cat.icon, color=cat.color,
            sort_order=cat.sort_order,
            parent_id=id_map["categories"].get(cat.parent_id) if cat.parent_id else None,
        )
        session.add(new)
        await session.flush()
        id_map["categories"][cat.id] = new.id

    for tag in (await session.execute(select(Tag).where(Tag.family_id == src, Tag.deleted_at.is_(None)))).scalars():
        new = Tag(family_id=dst, name=tag.name)
        session.add(new)
        await session.flush()
        id_map["tags"][tag.id] = new.id

    for cp in (await session.execute(select(Counterparty).where(Counterparty.family_id == src, Counterparty.deleted_at.is_(None)))).scalars():
        new = Counterparty(family_id=dst, name=cp.name, inn=cp.inn, category_id=id_map["categories"].get(cp.category_id) if cp.category_id else None)
        session.add(new)
        await session.flush()
        id_map["counterparties"][cp.id] = new.id

    for tx in (await session.execute(select(Transaction).where(Transaction.family_id == src, Transaction.deleted_at.is_(None)))).scalars():
        tags = list(tx.tags)
        new = Transaction(
            family_id=dst, author_id=None, type=tx.type, amount=tx.amount, currency=tx.currency,
            account_id=id_map["accounts"].get(tx.account_id, tx.account_id),
            target_account_id=id_map["accounts"].get(tx.target_account_id) if tx.target_account_id else None,
            category_id=id_map["categories"].get(tx.category_id) if tx.category_id else None,
            counterparty_id=id_map["counterparties"].get(tx.counterparty_id) if tx.counterparty_id else None,
            occurred_at=tx.occurred_at, comment=tx.comment, has_receipt=tx.has_receipt,
        )
        session.add(new)
        # Явный контракт автопересчёта балансов: отмечаем затронутые счета до commit()
        mark_accounts_dirty(session, affected_account_ids(new))
        await session.flush()
        for t in tags:
            nt = id_map["tags"].get(t.id)
            if nt:
                await session.execute(transaction_tags.insert().values(transaction_id=new.id, tag_id=nt))

    for b in (await session.execute(select(Budget).where(Budget.family_id == src, Budget.deleted_at.is_(None)))).scalars():
        new_cat = id_map["categories"].get(b.category_id)
        if new_cat:
            session.add(
                Budget(
                    family_id=dst, category_id=new_cat, period=b.period, limit_amount=b.limit_amount,
                    period_start=b.period_start, period_end=b.period_end, notify_on_overrun=b.notify_on_overrun,
                )
            )

    # Чеки: метаданные копируем, файл изображения остаётся общим (не мутируется в песочнице)
    for r in (await session.execute(select(Receipt).where(Receipt.family_id == src))).scalars():
        new = Receipt(
            family_id=dst, file_path=r.file_path, original_name=r.original_name,
            mime_type=r.mime_type, size_bytes=r.size_bytes, store_name=r.store_name,
            inn=r.inn, fiscal_provider_inn=r.fiscal_provider_inn, receipt_date=r.receipt_date,
            receipt_number=r.receipt_number, fiscal_sign=r.fiscal_sign, total_amount=r.total_amount,
            qr_payload_raw=r.qr_payload_raw, ocr_text=r.ocr_text, meta=r.meta,
            parse_status=r.parse_status,
        )
        session.add(new)
        await session.flush()
        for item in r.items:
            session.add(
                ReceiptItem(
                    receipt_id=new.id, name=item.name, quantity=item.quantity,
                    price=item.price, total=item.total, vat_rate=item.vat_rate,
                )
            )
    await session.flush()
