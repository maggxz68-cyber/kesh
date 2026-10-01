# 🚀 Деплой на Ubuntu

## Быстрая установка (автоматическая)

```bash
# 1. Клонируйте проект
git clone <your-repo-url>
cd finance-tracker

# 2. Запустите установку
chmod +x install.sh
sudo ./install.sh

# 3. Откройте http://your-server-ip
```

## Ручная установка

### 1. Установка Docker

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Клонирование проекта

```bash
git clone <your-repo-url>
cd finance-tracker
```

### 3. Настройка

```bash
cp .env.example .env
nano .env
# Измените JWT_SECRET на случайную строку
```

### 4. Запуск

```bash
docker compose up -d --build
```

### 5. Открыть порт

```bash
sudo ufw allow 80/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

### 6. Открыть приложение

```
http://your-server-ip
```

## Управление

```bash
# Логи
docker compose logs -f

# Остановка
docker compose down

# Перезапуск
docker compose restart

# Обновление
git pull
docker compose up -d --build
```

## Резервное копирование

```bash
# Создать бэкап
docker run --rm -v finance-tracker_backend-data:/data -v $(pwd):/backup alpine tar czf /backup/backup-$(date +%Y%m%d-%H%M%S).tar.gz /data

# Восстановить
docker compose down
docker volume rm finance-tracker_backend-data
docker run --rm -v finance-tracker_backend-data:/data -v $(pwd):/backup alpine tar xzf /backup/backup-YYYYMMDD-HHMMSS.tar.gz -C /
docker compose up -d
```

## HTTPS (опционально)

```bash
# Установить Nginx и Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Получить сертификат
sudo certbot --nginx -d your-domain.com

# Автоматическое обновление
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```
