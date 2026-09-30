#!/bin/bash

# Скрипт для быстрого обновления кода в GitHub

set -e

echo "🚀 Быстрое обновление кода в GitHub..."

# Проверка что git инициализирован
if [ ! -d ".git" ]; then
    echo "❌ Ошибка: Git репозиторий не инициализирован"
    echo "Запустите сначала: ./git-init.sh"
    exit 1
fi

# Добавление всех изменений
echo "📝 Добавление изменений..."
git add .

# Проверка есть ли изменения для коммита
if git diff --staged --quiet; then
    echo "ℹ️  Нет изменений для коммита"
else
    # Коммит с автоматическим сообщением
    echo "💾 Создание коммита..."
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    git commit -m "Update: ${TIMESTAMP}"
fi

# Пуш в GitHub
echo "📤 Пуш в GitHub..."
git push

echo ""
echo "✅ Код успешно обновлён в GitHub!"
