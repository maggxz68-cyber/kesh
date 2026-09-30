#!/bin/bash

# Скрипт для деплоя на сервер

SERVER="100.82.77.94"
REMOTE_PATH="/home/magg/kesh-deploy"

echo "🚀 Деплой на сервер $SERVER..."
echo ""

# 1. Копируем собранный frontend
echo "📦 Копирование frontend..."
rsync -avz --delete dist/ $SERVER:$REMOTE_PATH/dist/

# 2. Копируем обновлённый server
echo "📦 Копирование backend..."
rsync -avz --delete server/ $SERVER:$REMOTE_PATH/server/

# 3. Копируем package.json если изменился
echo "📦 Копирование package.json..."
rsync -avz package.json $SERVER:$REMOTE_PATH/

echo ""
echo "✅ Файлы скопированы на сервер"
echo ""
echo "🔧 Теперь выполните на сервере:"
echo "   ssh $SERVER"
echo "   cd $REMOTE_PATH"
echo "   cd server && npm install && cd .."
echo "   pm2 restart all  # или другой процесс-менеджер"
echo ""
echo "🌐 После перезапуска откройте: http://$SERVER"
echo ""
echo "💡 Не забудьте очистить кеш браузера: Ctrl+Shift+R"
