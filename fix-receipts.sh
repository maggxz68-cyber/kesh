#!/bin/bash

echo "🔧 Исправление проблемы с чеками..."
echo ""

# Останавливаем сервер если запущен
echo "🛑 Остановка сервера..."
pkill -f "node server/index.js" 2>/dev/null || true
sleep 2

# Удаляем старую базу данных
echo "🗑️  Удаление старой базы данных..."
if [ -f "server/data/budget.db" ]; then
    rm -f server/data/budget.db
    echo "✅ База данных удалена"
else
    echo "ℹ️  База данных не найдена"
fi

# Перезапускаем сервер
echo ""
echo "🚀 Запуск сервера..."
cd server
npm start &
SERVER_PID=$!

# Ждём пока сервер запустится
echo "⏳  Ожидание запуска сервера..."
sleep 3

# Проверяем что сервер запущен
if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "✅ Сервер успешно запущен!"
    echo ""
    echo "📋 Теперь можно:"
    echo "   1. Открыть http://localhost:3000"
    echo "   2. Войти как demo / demo"
    echo "   3. Попробовать добавить транзакцию с чеком"
    echo ""
    echo "🆔 PID сервера: $SERVER_PID"
else
    echo "❌ Ошибка запуска сервера"
    echo "Проверьте логи: cd server && npm start"
    exit 1
fi
