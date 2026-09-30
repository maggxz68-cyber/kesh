#!/bin/bash

# Скрипт для удаления последнего коммита

set -e

echo "🗑️  Удаление последнего коммита..."
echo ""

# Проверка что git инициализирован
if [ ! -d ".git" ]; then
    echo "❌ Ошибка: Git репозиторий не инициализирован"
    exit 1
fi

# Показать последний коммит
echo "📋 Последний коммит:"
git log -1 --pretty=format:"%h - %s (%ar)"
echo ""
echo ""

echo "Выберите вариант:"
echo "1) Удалить коммит, сохранить изменения в working directory (soft reset)"
echo "2) Удалить коммит, сохранить изменения в staging area (mixed reset - по умолчанию)"
echo "3) Удалить коммит полностью, отменить все изменения (hard reset)"
echo "4) Отмена"
echo ""

read -p "Ваш выбор (1-4): " choice

case $choice in
    1)
        echo ""
        echo "🔄 Soft reset - изменения останутся в working directory..."
        git reset --soft HEAD~1
        echo "✅ Последний коммит удалён (soft)"
        echo "📝 Изменения остались в working directory"
        ;;
    2)
        echo ""
        echo "🔄 Mixed reset - изменения останутся в staging area..."
        git reset --mixed HEAD~1
        echo "✅ Последний коммит удалён (mixed)"
        echo "📝 Изменения остались в staging area (готовы к коммиту)"
        ;;
    3)
        echo ""
        echo "⚠️  ВНИМАНИЕ: Все изменения последнего коммита будут потеряны!"
        read -p "Продолжить? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git reset --hard HEAD~1
            echo "✅ Последний коммит удалён (hard)"
            echo "🗑️  Все изменения отменены"
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
echo "📊 Статус:"
git status --short

echo ""
echo "💡 Если нужно отменить push в GitHub, выполните:"
echo "   git push -f origin main"
