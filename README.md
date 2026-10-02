# Family Finance Tracker — учёт семейных доходов и расходов
# Multi-tenant (изоляция по family_id), роли: superadmin / owner / member.

## Архитектура
- backend/  — FastAPI + SQLAlchemy 2.0 (async) + Alembic + PostgreSQL 16
- frontend/ — React 18 + TypeScript + Vite + TailwindCSS + PWA
- nginx/    — reverse-proxy, HTTPS (Let's Encrypt), SPA + /api
- docker-compose.yml — postgres + backend + scheduler + frontend + nginx

## Быстрый старт (dev, без Docker)
```bash
cd backend && python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
cp ../.env.example .env   # заполните DATABASE_URL / JWT_SECRET
alembic upgrade head
python scripts/seed.py    # супер-админ admin/1968 + демо-семья
uvicorn app.main:app --reload --port 8000

cd ../frontend && npm install && npm run dev -- --port 5173
```

## Прод (Docker)
```bash
cp .env.example .env      # задайте POSTGRES_PASSWORD, JWT_SECRET, DOMAIN
./deploy.sh               # первичный деплой на Ubuntu 22.04/24.04
docker compose ps         # проверка healthcheck'ов
```

## Ключевые URL
- UI: https://<DOMAIN>/ ; логин /login; регистрация /register
- Демо-вход без пароля: кнопка «Войти в демо-семью» на /login
- Панель супер-админа: /superadmin/login (admin / 1968)
- OpenAPI: /api/docs

## Бэкапы / логи / обновление
- ./backup.sh — pg_dump + tar volume чеков в ./backups (добавьте в cron)
- Логи backend: docker volume backend_logs (/logs/backend.log, loguru JSON)
- Обновление: git pull && docker compose up -d --build && docker compose exec backend alembic upgrade head

Подробности: docs/README-DEPLOY.md (этап 10).
