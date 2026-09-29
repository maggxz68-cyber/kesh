#!/bin/bash

# Скрипт для запуска приложения в Docker (development)

set -e

echo "🚀 Запуск Семейного бюджета в Docker (режим разработки)..."

# Остановка старых контейнеров
echo "🛑 Остановка старых контейнеров..."
docker-compose -f docker-compose.dev.yml down 2>/dev/null || true

# Сборка и запуск
echo "🔨 Сборка образов..."
docker-compose -f docker-compose.dev.yml build

echo "▶️  Запуск контейнеров..."
docker-compose -f docker-compose.dev.yml up -d

echo ""
echo "✅ Приложение запущено в режиме разработки!"
echo "🌐 Frontend: http://localhost:3000"
echo "🔌 Backend API: http://localhost:3001"
echo ""
echo "📋 Команды:"
echo "   Логи frontend: docker-compose -f docker-compose.dev.yml logs -f frontend"
echo "   Логи backend: docker-compose -f docker-compose.dev.yml logs -f backend"
echo "   Все логи: docker-compose -f docker-compose.dev.yml logs -f"
echo "   Остановка: docker-compose -f docker-compose.dev.yml down"
echo "   Перезапуск: docker-compose -f docker-compose.dev.yml restart"
echo ""
echo "🔐 Демо-доступ:"
echo "   Пользователь: demo / demo"
echo "   Админ: admin / 1968"
