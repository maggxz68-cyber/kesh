#!/bin/bash

# Скрипт для удаления последних 2 коммитов (без интерактивного выбора)
# Используется когда коммиты ещё не были запушены в GitHub

set -e

echo "🗑️  Удаление последних 2 коммитов..."
echo ""

# Показать текущие коммиты
echo "📋 Текущие коммиты:"
git log -5 --pretty=format:"%h - %s (%ar)"
echo ""
echo ""

# Удалить последние 2 коммита, сохранить изменения в staging area
git reset --mixed HEAD~2

echo "✅ Удалено 2 коммита"
echo ""
echo "📋 Новые последние коммиты:"
git log -3 --pretty=format:"%h - %s (%ar)"
echo ""
echo ""
echo "📊 Изменения остались в staging area (готовы к новому коммиту)"
echo ""
git status --short
