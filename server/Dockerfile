FROM node:20-alpine

# Устанавливаем зависимости для компиляции нативных модулей
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3001
CMD ["node", "index.js"]
