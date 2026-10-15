#!/bin/bash
echo "⚠️  Внимание: Это удалит все текущие данные демо-семьи и восстановит их до заводских настроек."
read -p "Вы уверены? (да/нет): " confirm
if [ "$confirm" = "да" ]; then
    echo "🔄 Выполняем сброс..."
    docker compose exec backend python reset_demo.py
    echo "✅ Готово! Теперь можно войти в демо-режим заново."
else
    echo "❌ Отменено."
fi
