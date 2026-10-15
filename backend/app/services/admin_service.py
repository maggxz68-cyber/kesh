"""Сервисные функции для панели супер-администратора."""
import os
import asyncio
import uuid
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family import Family, User
from app.models.transaction import Transaction, Budget
from app.models.reference import Account, Category, Tag, Counterparty
from app.models.enums import UserRole
from app.core.security import hash_password
from app.services.seed import seed_demo_family
from app.services.family_template import populate_family_reference
from app.core.config import settings

BACKUP_DIR = "/data/backups"

async def reset_family_to_default(session: AsyncSession, family_id: uuid.UUID, is_demo: bool = False):
    """Полностью очищает семью и восстанавливает данные (для демо — полноценный seed)."""
    
    # 1. Удаляем ВСЕ дочерние данные семьи в правильном порядке (из-за внешних ключей)
    await session.execute(delete(Transaction).where(Transaction.family_id == family_id))
    await session.execute(delete(Budget).where(Budget.family_id == family_id))
    await session.execute(delete(Account).where(Account.family_id == family_id))
    await session.execute(delete(Category).where(Category.family_id == family_id))
    await session.execute(delete(Tag).where(Tag.family_id == family_id))
    await session.execute(delete(Counterparty).where(Counterparty.family_id == family_id))
    await session.commit()

    # 2. Восстанавливаем данные
    if is_demo:
        # Для демо-семьи используем официальный скрипт генерации богатых демо-данных.
        # Он сам найдет "Семья Ивановых", восстановит пользователей (Ивана и др.), 
        # создаст правильные счета с балансами и демо-транзакции.
        # Так как мы всё удалили выше, дубликатов не будет.
        await seed_demo_family(session)
    else:
        # Для обычных семей восстанавливаем только пустой шаблон справочников
        await populate_family_reference(session, family_id, currency="RUB")
        
    await session.commit()
    return True


async def create_database_backup() -> str:
    """Создает дамп всей базы данных и возвращает имя файла."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    filename = f"ff_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql"
    filepath = os.path.join(BACKUP_DIR, filename)
    
    cmd = [
        "pg_dump", "-h", "postgres", "-U", "ffuser", "-d", "family_finance", "-F", "p", "-f", filepath
    ]
    
    env = os.environ.copy()
    env["PGPASSWORD"] = settings.database_password if hasattr(settings, 'database_password') else "35040cf53ec800a34e5a94ab8534e36376183fc77d83cc69028b941327db57c6"
    
    process = await asyncio.create_subprocess_exec(
        *cmd, env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await process.communicate()
    
    if process.returncode != 0:
        raise Exception(f"Ошибка бекапа: {stderr.decode()}")
    
    return filename


async def restore_database_backup(filename: str):
    """Восстанавливает базу данных из файла бекапа."""
    filepath = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Файл бекапа {filename} не найден")
        
    cmd = ["psql", "-h", "postgres", "-U", "ffuser", "-d", "family_finance", "-f", filepath]
    
    env = os.environ.copy()
    env["PGPASSWORD"] = settings.database_password if hasattr(settings, 'database_password') else "35040cf53ec800a34e5a94ab8534e36376183fc77d83cc69028b941327db57c6"
    
    process = await asyncio.create_subprocess_exec(
        *cmd, env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await process.communicate()
    
    if process.returncode != 0:
        raise Exception(f"Ошибка восстановления: {stderr.decode()}")
