#!/bin/bash

# Скрипт для запуска приложения в Docker (production)

set -e

echo "🚀 Запуск Семейного бюджета в Docker..."

# Проверка наличия .env файла
if [ ! -f .env ]; then
    echo "📝 Создание .env файла из .env.example..."
    cp .env.example .env
    echo "⚠️  ВАЖНО: Измените JWT_SECRET в .env файле!"
fi

# Остановка старых контейнеров
echo "🛑 Остановка старых контейнеров..."
docker-compose down 2>/dev/null || true

# Сборка и запуск
echo "🔨 Сборка образа..."
docker-compose build

echo "▶️  Запуск контейнеров..."
docker-compose up -d

echo ""
echo "✅ Приложение запущено!"
echo "🌐 URL: http://localhost:${APP_PORT:-3001}"
echo ""
echo "📋 Команды:"
echo "   Логи: docker-compose logs -f"
echo "   Остановка: docker-compose down"
echo "   Перезапуск: docker-compose restart"
echo ""
echo "🔐 Демо-доступ:"
echo "   Пользователь: demo / demo"
echo "   Админ: admin / 1968"
