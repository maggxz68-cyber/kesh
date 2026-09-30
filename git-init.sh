#!/bin/bash

# Скрипт для инициализации Git репозитория и первого коммита

set -e

echo "🚀 Инициализация Git репозитория..."

# Проверка что мы в правильной директории
if [ ! -f "package.json" ]; then
    echo "❌ Ошибка: package.json не найден. Запустите скрипт из корня проекта."
    exit 1
fi

# Инициализация git если нужно
if [ ! -d ".git" ]; then
    echo "📦 Инициализация Git..."
    git init
    git branch -M main
fi

# Добавление всех файлов
echo "📝 Добавление файлов..."
git add .

# Первый коммит
echo "💾 Создание первого коммита..."
git commit -m "Initial commit: Семейный бюджет - онлайн приложение для учёта финансов"

echo ""
echo "✅ Git репозиторий инициализирован!"
echo ""
echo "📋 Следующие шаги:"
echo "1. Создайте репозиторий на GitHub"
echo "2. Выполните: ./git-push.sh <your-github-username> <repo-name>"
echo ""
echo "Пример:"
echo "  ./git-push.sh myusername family-budget"
