#!/bin/bash

# Скрипт для полного сброса и пуша в GitHub (force push)

set -e

# Проверка аргументов
if [ $# -eq 0 ]; then
    echo "❌ Ошибка: Укажите username и название репозитория"
    echo ""
    echo "Использование:"
    echo "  ./git-reset-push.sh <github-username> <repo-name>"
    echo ""
    echo "Пример:"
    echo "  ./git-reset-push.sh myusername family-budget"
    exit 1
fi

if [ $# -lt 2 ]; then
    echo "❌ Ошибка: Укажите оба параметра"
    echo ""
    echo "Использование:"
    echo "  ./git-reset-push.sh <github-username> <repo-name>"
    exit 1
fi

USERNAME=$1
REPO_NAME=$2
REMOTE_URL="https://github.com/${USERNAME}/${REPO_NAME}.git"

echo "⚠️  ВНИМАНИЕ: Это полностью перезапишет историю в GitHub!"
echo "📦 Репозиторий: ${REMOTE_URL}"
echo ""
read -p "Продолжить? (y/N) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Отменено"
    exit 0
fi

echo ""
echo "🗑️  Удаление старой .git директории..."
rm -rf .git

echo "📦 Инициализация нового Git репозитория..."
git init
git branch -M main

echo "📝 Добавление всех файлов..."
git add .

echo "💾 Создание коммита..."
git commit -m "Initial commit: Семейный бюджет - онлайн приложение для учёта финансов"

echo "🔗 Добавление remote..."
git remote add origin ${REMOTE_URL}

echo "📤 Force push в GitHub..."
git push -f origin main

echo ""
echo "✅ Код полностью сброшен и отправлен в GitHub!"
echo "🌐 URL: https://github.com/${USERNAME}/${REPO_NAME}"
