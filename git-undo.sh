#!/bin/bash

# Скрипт для удаления N последних коммитов

set -e

# Количество коммитов для удаления (по умолчанию 1)
COUNT=${1:-1}

echo "🗑️  Удаление последних $COUNT коммит(ов)..."
echo ""

# Проверка что git инициализирован
if [ ! -d ".git" ]; then
    echo "❌ Ошибка: Git репозиторий не инициализирован"
    exit 1
fi

# Показать последние коммиты
echo "📋 Последние коммиты:"
git log -n $((COUNT + 1)) --pretty=format:"%h - %s (%ar)"
echo ""
echo ""

echo "Выберите вариант:"
echo "1) Удалить коммиты, сохранить изменения в working directory (soft reset)"
echo "2) Удалить коммиты, сохранить изменения в staging area (mixed reset - по умолчанию)"
echo "3) Удалить коммиты полностью, отменить все изменения (hard reset)"
echo "4) Отмена"
echo ""

read -p "Ваш выбор (1-4): " choice

case $choice in
    1)
        echo ""
        echo "🔄 Soft reset..."
        git reset --soft HEAD~$COUNT
        echo "✅ Удалено $COUNT коммит(ов) (soft)"
        ;;
    2)
        echo ""
        echo "🔄 Mixed reset..."
        git reset --mixed HEAD~$COUNT
        echo "✅ Удалено $COUNT коммит(ов) (mixed)"
        ;;
    3)
        echo ""
        echo "⚠️  ВНИМАНИЕ: Все изменения будут потеряны!"
        read -p "Продолжить? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git reset --hard HEAD~$COUNT
            echo "✅ Удалено $COUNT коммит(ов) (hard)"
        else
            echo "Отменено"
            exit 0
        fi
        ;;
    4)
        echo "Отменено"
        exit 0
        ;;
    *)
        echo "❌ Неверный выбор"
        exit 1
        ;;
esac

echo ""
echo "📊 Текущий статус:"
git log -3 --pretty=format:"%h - %s (%ar)"
echo ""
echo ""
git status --short

# Проверка есть ли remote
if git remote | grep -q "origin"; then
    echo ""
    echo "💡 Если коммиты уже были запушены в GitHub, выполните:"
    echo "   git push -f origin main"
fi
