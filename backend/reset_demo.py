import asyncio
from sqlalchemy import select, delete
from app.db.session import SessionLocal
from app.models.family import Family, User
from app.models.enums import UserRole
from app.core.security import hash_password
from app.services.family_template import populate_family_reference

async def reset_demo():
    print("🔄 Запуск сброса демо-данных...")
    async with SessionLocal() as session:
        # 1. Находим демо-пользователя
        result = await session.execute(select(User).where(User.email == "demo@example.com"))
        user = result.scalar_one_or_none()
        
        if user:
            family_id = user.family_id
            print(f"🗑️ Удаляем текущего демо-пользователя и семью (ID: {family_id})...")
            await session.execute(delete(User).where(User.email == "demo@example.com"))
            await session.execute(delete(Family).where(Family.id == family_id))
            await session.commit()
            print("✅ Старые данные удалены.")
        else:
            print("ℹ️ Демо-пользователь не найден, создаем с нуля.")
        
        # 2. Создаем новую чистую семью
        print("🏠 Создаем новую семью 'Семья Ивановых'...")
        new_family = Family(name="Семья Ивановых", timezone="Europe/Moscow", currency="RUB", is_demo=True, is_sandbox=False)
        session.add(new_family)
        await session.flush() # Чтобы получить new_family.id
        
        # 3. Создаем нового пользователя Ивана
        print("👤 Создаем пользователя Иван (demo@example.com)...")
        new_user = User(
            family_id=new_family.id,
            email="demo@example.com",
            name="Иван",
            role=UserRole.OWNER,
            password_hash=hash_password("demo1234"),
            is_active=True
        )
        session.add(new_user)
        await session.flush()
        
        # 4. Наполняем семью демо-данными (категории, счета, транзакции)
        print("📦 Наполняем семью демо-данными (категории, счета, транзакции)...")
        await populate_family_reference(session, new_family.id, currency="RUB")
        
        await session.commit()
        print("🎉 Демо-данные успешно сброшены и восстановлены!")

if __name__ == "__main__":
    asyncio.run(reset_demo())
