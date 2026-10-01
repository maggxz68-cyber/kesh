#!/bin/bash
echo "🔄 Начало обновления..."
cd ~/kesh-deploy

# Подтягиваем последние изменения из GitHub
git pull origin main

# Пересобираем и перезапускаем контейнер
docker compose up -d --build

# Очищаем старые неиспользуемые образы
docker image prune -f

echo "✅ Деплой успешно завершен!"
