# Семейный бюджет - Онлайн приложение

Веб-приложение для учёта семейных финансов с серверной архитектурой. Все данные хранятся на сервере и доступны с любого устройства через интернет.

## 🚀 Возможности

- **Учёт транзакций** - доходы, расходы, переводы
- **Семейный доступ** - несколько пользователей в одной семье
- **Бюджеты** - планирование и контроль расходов по категориям
- **Регулярные платежи** - автоматическое создание повторяющихся транзакций
- **Отчёты и аналитика** - графики, диаграммы, статистика
- **Мультивалютность** - поддержка RUB, USD, EUR, KZT, CNY
- **Синхронизация** - все данные автоматически синхронизируются через сервер

## 🏗️ Архитектура

Приложение состоит из двух частей:

### Frontend (React + Vite)
- Современный React с TypeScript
- Vite для быстрой сборки
- Tailwind CSS для стилей
- Zustand для управления состоянием
- Recharts для графиков
- PWA поддержка

### Backend (Node.js + Express)
- Express.js сервер
- SQLite база данных
- JWT аутентификация
- REST API

**Важно**: Все данные хранятся на сервере. Локальные устройства не хранят никаких данных (кроме токена авторизации).

## 📦 Установка и запуск

### 1. Клонирование и установка зависимостей

```bash
# Установка зависимостей фронтенда
npm install

# Установка зависимостей сервера
cd server
npm install
cd ..
```

### 2. Запуск в режиме разработки

**Терминал 1 - Сервер:**
```bash
cd server
npm start
```
Сервер запустится на `http://localhost:3001`

**Терминал 2 - Frontend:**
```bash
npm run dev
```
Frontend запустится на `http://localhost:3000` с проксированием API на сервер

### 3. Production сборка

```bash
# Собрать frontend
npm run build

# Запустить сервер (обслуживает и API и статику)
cd server
npm start
```

Приложение будет доступно на `http://localhost:3001`

## 🔐 Демо-доступ

- **Демо пользователь**: `demo` / `demo`
- **Администратор**: `admin` / `1968`

## 📱 Использование

### Регистрация и вход

1. Откройте приложение
2. Войдите с демо-доступом или создайте свою семью
3. Пригласите членов семьи через код приглашения

### Основные функции

- **Дашборд** - обзор финансов, балансы счетов, последние транзакции
- **Транзакции** - добавление, редактирование, фильтрация операций
- **Бюджеты** - создание бюджетов по категориям, отслеживание прогресса
- **Регулярные платежи** - настройка автоматических транзакций
- **Отчёты** - аналитика по категориям, счетам, членам семьи, датам
- **Семья** - управление участниками, коды приглашений
- **Настройки** - экспорт данных, курсы валют, тема оформления

### Синхронизация

Все данные автоматически синхронизируются через сервер:
- Изменения сохраняются сразу при каждом действии
- Доступ к данным с любого устройства
- Не требуется ручная синхронизация

## 🛠️ Технологии

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- Zustand (state management)
- React Router
- Recharts (графики)
- Lucide React (иконки)

### Backend
- Node.js
- Express.js
- SQLite (better-sqlite3)
- JWT (jsonwebtoken)
- bcryptjs (хеширование паролей)
- CORS

## 📂 Структура проекта

```
├── src/                    # Frontend исходники
│   ├── api/               # API клиент
│   ├── components/        # React компоненты
│   ├── pages/             # Страницы приложения
│   ├── store/             # Zustand stores
│   ├── types/             # TypeScript типы
│   └── utils/             # Утилиты
├── server/                # Backend
│   ├── index.js          # Express сервер
│   ├── package.json      # Зависимости сервера
│   └── README.md         # Документация сервера
├── dist/                  # Production сборка
└── package.json          # Зависимости фронтенда
```

## 🔒 Безопасность

- Все пароли хешируются с помощью bcrypt
- JWT токены для аутентификации
- Проверка доступа к данным семьи
- Защита API endpoints middleware

## 📊 API

Полная документация API доступна в [server/README.md](server/README.md)

Основные endpoints:
- `/api/auth/*` - аутентификация
- `/api/families/*` - управление семьями
- `/api/families/:id/transactions` - транзакции
- `/api/families/:id/accounts` - счета
- `/api/families/:id/categories` - категории
- `/api/families/:id/budgets` - бюджеты

## 🐳 Docker

### Быстрый старт (Production)

```bash
# 1. Клонировать репозиторий
git clone <repo>
cd family-budget

# 2. Скопировать .env файл и настроить
cp .env.example .env
# Отредактируйте .env (особенно JWT_SECRET!)

# 3. Запустить приложение
./docker-start.sh

# Или вручную:
docker-compose up -d --build
```

Приложение будет доступно на `http://localhost:3001`

### Режим разработки

```bash
# Запустить frontend и backend в отдельных контейнерах с hot reload
./docker-dev.sh

# Или вручную:
docker-compose -f docker-compose.dev.yml up -d --build
```

- Frontend: `http://localhost:3000` (с hot reload)
- Backend: `http://localhost:3001` (с hot reload)

### Команды Docker

```bash
# Просмотр логов
docker-compose logs -f

# Остановка
docker-compose down

# Перезапуск
docker-compose restart

# Полная пересборка
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Доступ к базе данных
docker exec -it family-budget-app sh
# SQLite: sqlite3 /app/data/budget.db
```

### С Nginx (опционально)

Для production с reverse proxy:

```bash
docker-compose --profile with-nginx up -d
```

Приложение будет доступно на `http://localhost:80`

### Структура Docker файлов

- `Dockerfile` - Multi-stage build для production
- `Dockerfile.frontend.dev` - Frontend для разработки
- `server/Dockerfile.dev` - Backend для разработки
- `docker-compose.yml` - Production конфигурация
- `docker-compose.dev.yml` - Development конфигурация
- `nginx.conf` - Конфигурация Nginx reverse proxy
- `.env.example` - Пример переменных окружения
- `.dockerignore` - Исключения для Docker build

### Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `APP_PORT` | Порт приложения | `3001` |
| `JWT_SECRET` | Секретный ключ JWT | `change-this-in-production` |
| `NGINX_PORT` | Порт Nginx | `80` |
| `NODE_ENV` | Режим работы | `production` |

### Volumes

- `budget-data` - Persistent storage для SQLite базы данных

Данные сохраняются между перезапусками контейнеров.

### Health Check

Контейнер имеет встроенный health check:

```bash
docker inspect --format='{{.State.Health.Status}}' family-budget-app
```

## 🌐 Деплой

### Вариант 1: VPS/Сервер (без Docker)

```bash
# На сервере
git clone <repo>
cd family-budget
npm install
cd server && npm install && cd ..
npm run build
cd server && npm start
```

### Вариант 2: Docker (рекомендуется)

См. секцию [🐳 Docker](#-docker) выше.

### Вариант 3: Облачные платформы

- **Frontend**: Vercel, Netlify
- **Backend**: Railway, Render, Heroku, DigitalOcean App Platform
- **База данных**: SQLite в volume, или мигрировать на PostgreSQL

### Вариант 4: Kubernetes

Для масштабирования можно использовать Kubernetes:

```yaml
# Пример deployment (упрощённый)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: family-budget
spec:
  replicas: 2
  selector:
    matchLabels:
      app: family-budget
  template:
    metadata:
      labels:
        app: family-budget
    spec:
      containers:
      - name: app
        image: your-registry/family-budget:latest
        ports:
        - containerPort: 3001
        env:
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: family-budget-secrets
              key: jwt-secret
        volumeMounts:
        - name: data
          mountPath: /app/data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: family-budget-data
```

## 📝 Лицензия

MIT

## 🤝 Поддержка

При возникновении проблем:
1. Проверьте что сервер запущен
2. Проверьте логи сервера и браузера (F12)
3. Убедитесь что порт 3001 доступен

---

**Важно**: Приложение работает только онлайн. Все данные хранятся на сервере и доступны через интернет.
