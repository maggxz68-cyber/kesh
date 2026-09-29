# Сервер "Семейный бюджет"

Серверная часть приложения для учёта семейных финансов. Все данные хранятся на сервере, локальные устройства не хранят никаких данных (кроме токена авторизации).

## Технологии

- **Express.js** - веб-фреймворк
- **SQLite** (better-sqlite3) - база данных
- **JWT** - аутентификация
- **bcryptjs** - хеширование паролей

## Установка и запуск

### 1. Установка зависимостей

```bash
cd server
npm install
```

### 2. Запуск сервера

```bash
npm start
```

Сервер запустится на порту 3001 (или PORT из переменных окружения).

### 3. Запуск фронтенда (в режиме разработки)

В другом терминале:

```bash
npm run dev
```

Фронтенд будет доступен на `http://localhost:5173` с проксированием API запросов на сервер.

### 4. Production сборка

```bash
# Собрать фронтенд
npm run build

# Запустить сервер (он будет обслуживать и API и статику)
cd server
npm start
```

Приложение будет доступно на `http://localhost:3001`

## Переменные окружения

- `PORT` - порт сервера (по умолчанию 3001)
- `JWT_SECRET` - секретный ключ для JWT токенов (по умолчанию встроенный, рекомендуется изменить в production)

## API Endpoints

### Аутентификация

- `POST /api/auth/login` - вход (login/email + password)
- `POST /api/auth/register` - регистрация (name, email, password, familyName)
- `POST /api/auth/join-family` - присоединение к семье по коду
- `GET /api/auth/me` - получение информации о текущем пользователе

### Семьи

- `GET /api/families/:familyId` - получить информацию о семье
- `GET /api/families/:familyId/data` - получить все данные семьи (счета, категории, транзакции, бюджеты, участники)
- `POST /api/families/:familyId/invite-code` - сгенерировать код приглашения
- `POST /api/families/:familyId/members` - добавить участника
- `DELETE /api/families/:familyId/members/:userId` - удалить участника

### Счета

- `GET /api/families/:familyId/accounts` - получить счета
- `POST /api/families/:familyId/accounts` - создать счёт
- `PUT /api/families/:familyId/accounts/:id` - обновить счёт
- `DELETE /api/families/:familyId/accounts/:id` - удалить счёт

### Категории

- `GET /api/families/:familyId/categories` - получить категории
- `POST /api/families/:familyId/categories` - создать категорию
- `PUT /api/families/:familyId/categories/:id` - обновить категорию
- `DELETE /api/families/:familyId/categories/:id` - удалить категорию

### Транзакции

- `GET /api/families/:familyId/transactions` - получить транзакции
- `POST /api/families/:familyId/transactions` - создать транзакцию
- `PUT /api/families/:familyId/transactions/:id` - обновить транзакцию
- `DELETE /api/families/:familyId/transactions/:id` - удалить транзакцию

### Бюджеты

- `GET /api/families/:familyId/budgets` - получить бюджеты
- `POST /api/families/:familyId/budgets` - создать бюджет
- `PUT /api/families/:familyId/budgets/:id` - обновить бюджет
- `DELETE /api/families/:familyId/budgets/:id` - удалить бюджет

### Регулярные платежи

- `GET /api/families/:familyId/recurring` - получить правила
- `POST /api/families/:familyId/recurring` - создать правило
- `DELETE /api/families/:familyId/recurring/:id` - удалить правило

### Администрирование (только для SUPER_ADMIN)

- `GET /api/admin/users` - список пользователей
- `GET /api/admin/families` - список семей
- `DELETE /api/admin/users/:id` - удалить пользователя
- `DELETE /api/admin/families/:id` - удалить семью

## Демо-доступ

- **Демо пользователь**: demo / demo
- **Администратор**: admin / 1968

## Безопасность

- Все пароли хешируются с помощью bcrypt
- JWT токены имеют срок действия 30 дней
- Все API endpoints (кроме auth) защищены middleware аутентификации
- Доступ к данным семьи проверяется через middleware familyAccess

## База данных

SQLite база данных создаётся автоматически при первом запуске в файле `server/budget.db`.

### Структура таблиц

- `users` - пользователи
- `families` - семьи
- `family_members` - связь пользователей и семей
- `family_members_display` - отображаемая информация об участниках
- `accounts` - счета
- `categories` - категории
- `transactions` - транзакции
- `budgets` - бюджеты
- `recurring_rules` - регулярные платежи

## Архитектура

Приложение работает полностью онлайн:
- Все данные хранятся на сервере
- Клиент получает данные через API при каждом запросе
- Изменения сразу сохраняются на сервере
- Локально хранится только JWT токен для аутентификации
- Синхронизация между устройствами происходит автоматически через сервер
