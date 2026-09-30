# Multi-stage build: Frontend + Backend в одном образе

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies for server
COPY server/package*.json ./server/
RUN cd server && npm ci --only=production

# Copy built frontend from stage 1
COPY --from=frontend-build /app/dist ./dist

# Copy server code
COPY server/index.js ./server/

# Create directory for SQLite database
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV JWT_SECRET=change-this-in-production

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "server/index.js"]
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
