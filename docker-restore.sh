#!/bin/bash

# Скрипт для восстановления базы данных из бэкапа

set -e

if [ -z "$1" ]; then
    echo "❌ Укажите файл бэкапа"
    echo "Использование: ./docker-restore.sh <backup_file.db>"
    echo ""
    echo "Доступные бэкапы:"
    ls -lh backups/*.db 2>/dev/null || echo "  (нет бэкапов)"
    exit 1
fi

BACKUP_FILE=$1

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Файл не найден: $BACKUP_FILE"
    exit 1
fi

echo "⚠️  ВНИМАНИЕ: Это заменит текущую базу данных!"
echo "Файл бэкапа: $BACKUP_FILE"
read -p "Продолжить? (y/N) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Отменено"
    exit 0
fi

echo "🔄 Остановка контейнера..."
docker-compose stop app

echo "📥 Восстановление базы данных..."
docker cp "$BACKUP_FILE" family-budget-app:/app/data/budget.db

echo "▶️  Запуск контейнера..."
docker-compose start app

echo "✅ База данных восстановлена из: $BACKUP_FILE"
