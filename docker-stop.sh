#!/bin/bash

# Скрипт для остановки приложения в Docker

set -e

echo "🛑 Остановка Семейного бюджета..."

# Остановка production контейнеров
docker-compose down

# Остановка development контейнеров (если запущены)
docker-compose -f docker-compose.dev.yml down 2>/dev/null || true

echo "✅ Все контейнеры остановлены"
