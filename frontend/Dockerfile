# syntax=docker/dockerfile:1.7
# ============================== build (node) ==============================
FROM node:20-alpine AS build

ARG VITE_API_BASE=/api
ENV VITE_API_BASE=${VITE_API_BASE}

WORKDIR /app

# Кэш зависимостей
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig*.json vite.config.ts postcss.config.cjs tailwind.config.js index.html ./
COPY public ./public
COPY src ./src

RUN npm run build   # tsc -b && vite build → /app/dist

# ============================== serve (nginx) ==============================
FROM nginx:1.27-alpine AS serve

LABEL org.opencontainers.image.title="family-finance-frontend"

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/ff-frontend.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
