#!/bin/bash

echo "🔧 Установка Node.js и npm..."
echo ""

# Проверяем, установлен ли Node.js
if command -v node &> /dev/null; then
    echo "✅ Node.js уже установлен: $(node --version)"
else
    echo "📦 Установка Node.js..."
    
    # Обновляем список пакетов
    sudo apt update
    
    # Устанавливаем Node.js (версия 18 или выше)
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
    
    echo "✅ Node.js установлен: $(node --version)"
fi

# Проверяем npm
if command -v npm &> /dev/null; then
    echo "✅ npm уже установлен: $(npm --version)"
else
    echo "❌ npm не найден, попробуйте переустановить Node.js"
    exit 1
fi

echo ""
echo "🚀 Установка зависимостей сервера..."
cd server
npm install

echo ""
echo "✅ Установка завершена!"
echo ""
echo "📋 Теперь запустите сервер:"
echo "   cd server && npm start"
echo ""
echo "🌐 Откройте http://localhost:3000"
