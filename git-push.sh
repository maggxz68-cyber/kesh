#!/bin/bash

# Скрипт для пуша кода в GitHub

set -e

# Проверка аргументов
if [ $# -eq 0 ]; then
    echo "❌ Ошибка: Укажите username и название репозитория"
    echo ""
    echo "Использование:"
    echo "  ./git-push.sh <github-username> <repo-name>"
    echo ""
    echo "Пример:"
    echo "  ./git-push.sh myusername family-budget"
    exit 1
fi

if [ $# -lt 2 ]; then
    echo "❌ Ошибка: Укажите оба параметра"
    echo ""
    echo "Использование:"
    echo "  ./git-push.sh <github-username> <repo-name>"
    exit 1
fi

USERNAME=$1
REPO_NAME=$2
REMOTE_URL="https://github.com/${USERNAME}/${REPO_NAME}.git"

echo "🚀 Пуш кода в GitHub..."
echo "📦 Репозиторий: ${REMOTE_URL}"
echo ""

# Проверка что git инициализирован
if [ ! -d ".git" ]; then
    echo "❌ Ошибка: Git репозиторий не инициализирован"
    echo "Запустите сначала: ./git-init.sh"
    exit 1
fi

# Добавление remote если его нет
if ! git remote | grep -q "origin"; then
    echo "🔗 Добавление remote origin..."
    git remote add origin ${REMOTE_URL}
else
    echo "🔄 Обновление remote origin..."
    git remote set-url origin ${REMOTE_URL}
fi

# Добавление всех изменений
echo "📝 Добавление изменений..."
git add .

# Проверка есть ли изменения для коммита
if git diff --staged --quiet; then
    echo "ℹ️  Нет изменений для коммита"
else
    # Коммит
    echo "💾 Создание коммита..."
    git commit -m "Update: $(date '+%Y-%m-%d %H:%M:%S')"
fi

# Пуш в GitHub
echo "📤 Пуш в GitHub..."
git push -u origin main

echo ""
echo "✅ Код успешно отправлен в GitHub!"
echo "🌐 URL: https://github.com/${USERNAME}/${REPO_NAME}"
