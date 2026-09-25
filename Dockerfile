# Этап 1: Сборка приложения через Node.js
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем весь исходный код
COPY . .

# Собираем проект (Vite создаст папку dist)
RUN npm run build

# Этап 2: Раздача собранного приложения через Nginx
FROM nginx:alpine

# Копируем собранные файлы из этапа builder в директорию Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Копируем конфигурацию Nginx для SPA (React Router)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
