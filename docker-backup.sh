#!/bin/bash

# Скрипт для создания бэкапа базы данных

set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/budget_backup_$TIMESTAMP.db"

echo "💾 Создание бэкапа базы данных..."

# Создание директории для бэкапов
mkdir -p $BACKUP_DIR

# Копирование базы данных из контейнера
docker cp family-budget-app:/app/data/budget.db "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Бэкап создан: $BACKUP_FILE"
    echo "📦 Размер: $(du -h "$BACKUP_FILE" | cut -f1)"
else
    echo "❌ Ошибка создания бэкапа"
    exit 1
fi

# Удаление старых бэкапов (оставить последние 10)
cd $BACKUP_DIR
ls -t budget_backup_*.db | tail -n +11 | xargs -r rm --
echo "🗑️  Старые бэкапы удалены (оставлено 10 последних)"
