# 🚀 Быстрый старт

## Локальный запуск (без Docker)

### 1. Установка зависимостей

```bash
# Frontend
npm install

# Backend
cd server
npm install
cd ..
```

### 2. Запуск

**Терминал 1 - Backend:**
```bash
cd server
npm start
```

**Терминал 2 - Frontend:**
```bash
npm run dev
```

Откройте `http://localhost:3000`

---

## Docker (рекомендуется)

### Production

```bash
# 1. Настроить
cp .env.example .env
nano .env  # Измените JWT_SECRET!

# 2. Запустить
./docker-start.sh
```

Откройте `http://localhost:3001`

### Development

```bash
./docker-dev.sh
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

---

## 🔐 Демо-доступ

- **Пользователь**: `demo` / `demo`
- **Админ**: `admin` / `1968`

---

## 📚 Документация

- [README.md](README.md) - Основная документация
- [DOCKER.md](DOCKER.md) - Подробное руководство по Docker
- [server/README.md](server/README.md) - API документация

---

## 🆘 Проблемы?

1. Проверьте логи: `docker-compose logs -f`
2. Убедитесь что порты свободны
3. Проверьте `.env` файл

Подробнее: [DOCKER.md - Troubleshooting](DOCKER.md#-troubleshooting)
