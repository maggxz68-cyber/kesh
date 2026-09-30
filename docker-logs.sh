#!/bin/bash

# Скрипт для просмотра логов Docker

set -e

SERVICE=${1:-app}

echo "📋 Логи сервиса: $SERVICE"
echo "Для выхода нажмите Ctrl+C"
echo ""

docker-compose logs -f $SERVICE
