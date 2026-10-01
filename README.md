# 💰 Финансовый трекер

Простая и эффективная система учёта личных финансов с серверной архитектурой.

## 🚀 Возможности

- ✅ Регистрация и авторизация пользователей
- ✅ Управление счетами (наличные, карты, банки)
- ✅ Учёт доходов и расходов
- ✅ Категории с иконками
- ✅ Сводка по финансам (неделя/месяц/год)
- ✅ Автоматический пересчёт балансов
- ✅ Серверное хранение данных
- ✅ Docker для простого деплоя

## 🏗️ Архитектура

- **Backend**: Node.js + Express + SQLite
- **Frontend**: React + Vite + Tailwind CSS
- **Database**: SQLite (файловая БД)
- **Deploy**: Docker + Docker Compose

## 📋 Требования

- Ubuntu 20.04+ (или любой Linux)
- Docker 20.10+
- Docker Compose 2.0+

## 🚀 Быстрый старт

### 1. Установка Docker на Ubuntu

```bash
# Обновление пакетов
sudo apt update
sudo apt upgrade -y

# Установка Docker
sudo apt install -y docker.io docker-compose-plugin

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER

# Перезагрузка (или перелогиньтесь)
newgrp docker
```

### 2. Клонирование проекта

```bash
git clone <your-repo-url>
cd finance-tracker
```

### 3. Настройка

```bash
# Копирование примера .env
cp .env.example .env

# Редактирование .env (ОБЯЗАТЕЛЬНО измените JWT_SECRET!)
nano .env
```

### 4. Запуск

```bash
# Сборка и запуск
docker compose up -d --build

# Проверка статуса
docker compose ps

# Просмотр логов
docker compose logs -f
```

### 5. Открыть приложение

Откройте браузер: `http://your-server-ip`

## 🔐 Учётные записи

### Демо-пользователь (для тестирования)
- **Логин**: `demo`
- **Пароль**: `demo`
- Включает демо-семью, счета, категории и транзакции

### Супер-администратор (для управления системой)
- **Логин**: `admin`
- **Пароль**: `1968`
- Доступ к админ-панели для управления пользователями и семьями

⚠️ **Важно**: В production измените пароли или создайте новых администраторов!

📖 Подробная информация: [ACCOUNTS.md](ACCOUNTS.md)

## 📖 Использование

### Регистрация

1. Откройте приложение
2. Нажмите "Зарегистрируйтесь"
3. Введите имя, email и пароль
4. Нажмите "Зарегистрироваться"

### Добавление счёта

1. Перейдите в "Счета"
2. Нажмите "Добавить счёт"
3. Заполните название, тип, валюту и начальный баланс
4. Нажмите "Добавить"

### Добавление категории

1. Перейдите в "Категории"
2. Нажмите "Добавить категорию"
3. Выберите тип (расход/доход)
4. Укажите название, иконку и цвет
5. Нажмите "Добавить"

### Добавление транзакции

1. Перейдите в "Транзакции"
2. Нажмите "Добавить"
3. Выберите тип (доход/расход)
4. Укажите сумму, счёт, категорию, дату и описание
5. Нажмите "Добавить"

## 🔧 Управление

### Остановка

```bash
docker compose down
```

### Перезапуск

```bash
docker compose restart
```

### Обновление

```bash
# Получить последние изменения
git pull

# Пересобрать и перезапустить
docker compose up -d --build
```

### Просмотр логов

```bash
# Все логи
docker compose logs -f

# Только backend
docker compose logs -f backend

# Только frontend
docker compose logs -f frontend
```

### Резервное копирование

```bash
# Остановить контейнеры
docker compose down

# Создать бэкап
docker run --rm -v finance-tracker_backend-data:/data -v $(pwd):/backup alpine tar czf /backup/backup-$(date +%Y%m%d-%H%M%S).tar.gz /data

# Запустить обратно
docker compose up -d
```

### Восстановление из бэкапа

```bash
# Остановить контейнеры
docker compose down

# Удалить старые данные
docker volume rm finance-tracker_backend-data

# Восстановить из бэкапа
docker run --rm -v finance-tracker_backend-data:/data -v $(pwd):/backup alpine tar xzf /backup/backup-YYYYMMDD-HHMMSS.tar.gz -C /

# Запустить
docker compose up -d
```

## 🔒 Безопасность

### Обязательно измените:

1. **JWT_SECRET** в `.env` - используйте длинную случайную строку:
   ```bash
   openssl rand -base64 32
   ```

2. **Настройте firewall**:
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 22/tcp
   sudo ufw enable
   ```

3. **Используйте HTTPS** (опционально):
   - Установите Nginx как reverse proxy
   - Получите SSL сертификат через Let's Encrypt
   - Настройте редирект с HTTP на HTTPS

## 📊 Структура проекта

```
finance-tracker/
├── backend/
│   ├── index.js          # API сервер
│   ├── package.json      # Зависимости backend
│   └── Dockerfile        # Docker образ backend
├── frontend/
│   ├── src/
│   │   ├── pages/        # Страницы приложения
│   │   ├── components/   # Компоненты
│   │   ├── api.js        # API клиент
│   │   ├── App.jsx       # Главный компонент
│   │   └── main.jsx      # Точка входа
│   ├── package.json      # Зависимости frontend
│   ├── nginx.conf        # Конфигурация Nginx
│   └── Dockerfile        # Docker образ frontend
├── docker-compose.yml    # Оркестрация контейнеров
├── .env.example          # Пример переменных окружения
└── README.md             # Этот файл
```

## 🐛 Решение проблем

### Порт 80 уже занят

Измените порт в `docker-compose.yml`:
```yaml
ports:
  - "8080:80"  # Измените 8080 на нужный порт
```

### Backend не запускается

Проверьте логи:
```bash
docker compose logs backend
```

### Frontend не подключается к backend

Проверьте, что backend запущен:
```bash
docker compose ps
```

### Ошибка "Permission denied"

Добавьте пользователя в группу docker:
```bash
sudo usermod -aG docker $USER
newgrp docker
```

## 📝 API Endpoints

### Аутентификация
- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход
- `GET /api/auth/me` - Текущий пользователь

### Счета
- `GET /api/accounts` - Список счетов
- `POST /api/accounts` - Создать счёт
- `PUT /api/accounts/:id` - Обновить счёт
- `DELETE /api/accounts/:id` - Удалить счёт

### Категории
- `GET /api/categories` - Список категорий
- `POST /api/categories` - Создать категорию
- `PUT /api/categories/:id` - Обновить категорию
- `DELETE /api/categories/:id` - Удалить категорию

### Транзакции
- `GET /api/transactions` - Список транзакций
- `POST /api/transactions` - Создать транзакцию
- `PUT /api/transactions/:id` - Обновить транзакцию
- `DELETE /api/transactions/:id` - Удалить транзакцию

### Сводка
- `GET /api/summary?period=month` - Сводка (week/month/year)

## 📄 Лицензия

MIT

## 🤝 Поддержка

При возникновении проблем:
1. Проверьте логи: `docker compose logs`
2. Убедитесь, что все контейнеры запущены: `docker compose ps`
3. Проверьте, что порты не заняты: `sudo netstat -tulpn | grep :80`
