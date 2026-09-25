# Используем легкий и надежный образ Nginx на базе Alpine Linux
FROM nginx:alpine

# Копируем содержимое папки public в стандартную директорию раздачи статики Nginx
COPY public /usr/share/nginx/html

# Открываем 80 порт
EXPOSE 80

# Запускаем Nginx в foreground-режиме (чтобы контейнер не завершался)
CMD ["nginx", "-g", "daemon off;"]