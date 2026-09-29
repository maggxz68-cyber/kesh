# 🐳 Docker Руководство

Полное руководство по запуску приложения "Семейный бюджет" в Docker.

## 📋 Требования

- Docker Engine 20.10+
- Docker Compose 2.0+

Проверка установки:
```bash
docker --version
docker-compose --version
```

## 🚀 Быстрый старт

### Production режим

```bash
# 1. Клонировать репозиторий
git clone <repo>
cd family-budget

# 2. Настроить переменные окружения
cp .env.example .env
nano .env  # Измените JWT_SECRET!

# 3. Запустить приложение
./docker-start.sh

# Или вручную:
docker-compose up -d --build
```

Приложение будет доступно на `http://localhost:3001`

### Development режим

```bash
# Запустить с hot reload
./docker-dev.sh

# Или вручную:
docker-compose -f docker-compose.dev.yml up -d --build
```

- Frontend: `http://localhost:3000` (hot reload)
- Backend: `http://localhost:3001` (hot reload)

## 📁 Структура Docker файлов

```
family-budget/
├── Dockerfile                      # Multi-stage build (production)
├── Dockerfile.frontend.dev         # Frontend для разработки
├── docker-compose.yml              # Production конфигурация
├── docker-compose.dev.yml          # Development конфигурация
├── nginx.conf                      # Nginx reverse proxy
├── .env.example                    # Пример переменных окружения
├── .dockerignore                   # Исключения для Docker
├── docker-start.sh                 # Скрипт запуска (production)
├── docker-dev.sh                   # Скрипт запуска (development)
├── docker-stop.sh                  # Скрипт остановки
├── docker-logs.sh                  # Скрипт просмотра логов
├── docker-backup.sh                # Скрипт бэкапа БД
├── docker-restore.sh               # Скрипт восстановления БД
└── server/
    └── Dockerfile.dev              # Backend для разработки
```

## 🔧 Полезные команды

### Управление контейнерами

```bash
# Запуск
docker-compose up -d

# Остановка
docker-compose down

# Перезапуск
docker-compose restart

# Просмотр статуса
docker-compose ps

# Просмотр логов (все сервисы)
docker-compose logs -f

# Просмотр логов (конкретный сервис)
docker-compose logs -f app

# Остановка и удаление volumes
docker-compose down -v
```

### Сборка

```bash
# Пересборка без кэша
docker-compose build --no-cache

# Сборка конкретного сервиса
docker-compose build app
```

### Доступ к контейнеру

```bash
# Войти в контейнер
docker exec -it family-budget-app sh

# Выполнить команду
docker exec family-budget-app ls -la /app/data
```

### База данных

```bash
# Войти в SQLite
docker exec -it family-budget-app sh
sqlite3 /app/data/budget.db

# Примеры запросов:
.tables                    # Показать таблицы
SELECT * FROM users;       # Все пользователи
SELECT * FROM families;    # Все семьи
.quit                      # Выйти
```

## 💾 Бэкап и восстановление

### Создание бэкапа

```bash
./docker-backup.sh
```

Бэкапы сохраняются в `./backups/`

### Восстановление из бэкапа

```bash
# Список доступных бэкапов
ls -lh backups/

# Восстановить конкретный бэкап
./docker-restore.sh backups/budget_backup_20240101_120000.db
```

### Автоматический бэкап (cron)

```bash
# Добавить в crontab (ежедневный бэкап в 2:00)
crontab -e

# Добавить строку:
0 2 * * * /path/to/family-budget/docker-backup.sh
```

## 🌐 Доступ извне

### Локальная сеть

Приложение доступно по IP сервера:
```
http://192.168.1.100:3001
```

### Публичный доступ

#### Вариант 1: Прямой доступ (порт 3001)

Открыть порт в firewall:
```bash
sudo ufw allow 3001/tcp
```

#### Вариант 2: Nginx reverse proxy (рекомендуется)

```bash
# Запустить с Nginx
docker-compose --profile with-nginx up -d

# Приложение доступно на порту 80
```

#### Вариант 3: С SSL (Let's Encrypt)

1. Установите Certbot:
```bash
sudo apt install certbot python3-certbot-nginx
```

2. Получите сертификат:
```bash
sudo certbot --nginx -d yourdomain.com
```

3. Обновите `nginx.conf` для HTTPS

## 🔒 Безопасность

### Обязательные шаги для production

1. **Измените JWT_SECRET**:
```bash
# Генерация случайного ключа
openssl rand -base64 32

# Добавьте в .env
JWT_SECRET=<ваш_секретный_ключ>
```

2. **Измените порты** (опционально):
```bash
# В .env
APP_PORT=8080  # Вместо 3001
```

3. **Настройте firewall**:
```bash
# Разрешить только необходимые порты
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

4. **Используйте HTTPS**:
- Настройте SSL сертификат
- Используйте Nginx reverse proxy

5. **Регулярные бэкапы**:
```bash
# Настройте автоматический бэкап через cron
```

## 📊 Мониторинг

### Проверка здоровья

```bash
# Статус контейнера
docker inspect --format='{{.State.Health.Status}}' family-budget-app

# API health check
curl http://localhost:3001/api/health
```

### Логи

```bash
# Все логи
docker-compose logs -f

# Только ошибки
docker-compose logs -f 2>&1 | grep -i error

# Логи за последний час
docker-compose logs --since 1h
```

### Ресурсы

```bash
# Использование ресурсов
docker stats family-budget-app
```

## 🔄 Обновление

```bash
# 1. Остановить контейнеры
docker-compose down

# 2. Получить обновления
git pull

# 3. Пересобрать образ
docker-compose build --no-cache

# 4. Запустить
docker-compose up -d
```

## 🐛 Troubleshooting

### Контейнер не запускается

```bash
# Проверить логи
docker-compose logs app

# Проверить статус
docker-compose ps

# Перезапустить
docker-compose restart app
```

### Ошибка подключения к БД

```bash
# Проверить что volume создан
docker volume ls | grep budget-data

# Проверить права доступа
docker exec family-budget-app ls -la /app/data
```

### Порт уже занят

```bash
# Найти процесс
sudo lsof -i :3001

# Изменить порт в .env
APP_PORT=3002
```

### Очистка всего

```bash
# Остановить и удалить всё
docker-compose down -v --rmi all

# Удалить образы
docker rmi $(docker images | grep family-budget)
```

## 📚 Дополнительные ресурсы

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Nginx Documentation](https://nginx.org/en/docs/)

## 🆘 Поддержка

При возникновении проблем:

1. Проверьте логи: `docker-compose logs -f`
2. Проверьте health check: `curl http://localhost:3001/api/health`
3. Убедитесь что порты не заняты
4. Проверьте переменные окружения в `.env`
