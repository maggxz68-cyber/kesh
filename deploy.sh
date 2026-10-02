#!/usr/bin/env bash
# Первичный деплой Family Finance Tracker на Ubuntu 22.04/24.04.
# Идея: docker + compose plugin → .env → build → миграции+seed → certbot → UFW.
# Подробная версия с интерактивом — этап 10.
set -euo pipefail

echo "[deploy] Этап 1: каркас. Скрипт будет дополнен на этапе 10."
echo "[deploy] Пока можно запустить стек так:"
echo "  cp .env.example .env && \$EDITOR .env"
echo "  docker compose up -d --build"
echo "  curl -s localhost/api/health  # через nginx→backend (на этапе 1 nginx отдаёт 301)"
