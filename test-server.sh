#!/bin/bash

echo "🔍 Проверка работы сервера..."
echo ""

# Проверяем что сервер запущен
if ! curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "❌ Сервер не запущен на порту 3001"
    echo "Запустите сервер: cd server && npm start"
    exit 1
fi

echo "✅ Сервер запущен"
echo ""

# Проверяем health endpoint
echo "📡 Проверка /api/health..."
HEALTH=$(curl -s http://localhost:3001/api/health)
echo "Ответ: $HEALTH"
echo ""

# Проверяем маршруты для чеков
echo "📋 Проверка маршрутов для чеков..."
echo "GET /api/families/demo-family-001/receipts"

# Сначала нужно получить токен
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"demo","password":"demo"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "❌ Не удалось получить токен"
    echo "Ответ: $LOGIN_RESPONSE"
    exit 1
fi

echo "✅ Токен получен"
echo ""

# Проверяем receipts endpoint
echo "🔍 Проверка GET /api/families/demo-family-001/receipts..."
RECEIPTS_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/families/demo-family-001/receipts)

HTTP_CODE=$(echo "$RECEIPTS_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RECEIPTS_RESPONSE" | sed '/HTTP_CODE:/d')

echo "HTTP код: $HTTP_CODE"
echo "Ответ: $BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Маршрут /api/families/:familyId/receipts работает!"
else
    echo "❌ Маршрут не работает (HTTP $HTTP_CODE)"
fi
