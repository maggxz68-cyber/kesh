#!/bin/bash

# Скрипт для установки и запуска финансового трекера на Ubuntu

set -e

echo "🚀 Установка финансового трекера..."
echo ""

# Проверка прав root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Запустите скрипт с правами root: sudo ./install.sh"
    exit 1
fi

# Установка Docker если не установлен
if ! command -v docker &> /dev/null; then
    echo "📦 Установка Docker..."
    apt update
    apt install -y docker.io docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    echo "✅ Docker установлен"
else
    echo "✅ Docker уже установлен"
fi

# Создание .env если не существует
if [ ! -f .env ]; then
    echo "📝 Создание .env файла..."
    cp .env.example .env
    
    # Генерация случайного JWT_SECRET
    JWT_SECRET=$(openssl rand -base64 32)
    sed -i "s/your-secret-key-change-in-production-12345/$JWT_SECRET/" .env
    
    echo "✅ .env создан с случайным JWT_SECRET"
else
    echo "✅ .env уже существует"
fi

# Остановка старых контейнеров если есть
echo "🛑 Остановка старых контейнеров..."
docker compose down 2>/dev/null || true

# Сборка и запуск
echo "🔨 Сборка Docker образов..."
docker compose up -d --build

echo ""
echo "✅ Установка завершена!"
echo ""
echo "🌐 Приложение доступно по адресу:"
echo "   http://$(hostname -I | awk '{print $1}')"
echo ""
echo "📋 Полезные команды:"
echo "   Логи: docker compose logs -f"
echo "   Остановка: docker compose down"
echo "   Перезапуск: docker compose restart"
echo "   Обновление: docker compose up -d --build"
echo ""
echo "🔐 Не забудьте:"
echo "   1. Открыть порт 80 в firewall: sudo ufw allow 80/tcp"
echo "   2. Настроить HTTPS для production"
echo "   3. Сделать резервную копию .env файла"
