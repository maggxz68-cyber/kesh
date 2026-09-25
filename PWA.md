# ФинТрекер v2.0 — PWA Setup

## PWA (Progressive Web App)

Приложение настроено как PWA с поддержкой offline-режима.

### Что включено:

✅ **manifest.json** — манифест PWA с иконками и метаданными  
✅ **Service Worker** — автоматическое кэширование статики  
✅ **Offline-режим** — приложение работает без интернета  
✅ **Иконки** — SVG-иконки 192x192 и 512x512  
✅ **Install prompt** — возможность установки на устройство  

### Кэширование:

**Кэшируется:**
- ✅ HTML, CSS, JavaScript файлы
- ✅ Шрифты (Google Fonts)
- ✅ Изображения (PNG, JPG, SVG)
- ✅ Статические ресурсы

**НЕ кэшируется:**
- ❌ API-запросы (если есть backend)
- ❌ Динамические данные

### Иконки

Приложение использует SVG-иконки для совместимости со всеми браузерами.

#### Генерация PNG-иконок (опционально):

Для максимальной совместимости можно сгенерировать PNG-иконки:

1. Откройте `public/generate-icons.html` в браузере
2. Скачайте сгенерированные PNG-файлы
3. Поместите их в `public/`:
   - `icon-192x192.png`
   - `icon-512x512.png`
4. Обновите `public/manifest.json`, заменив SVG на PNG:

```json
{
  "icons": [
    {
      "src": "/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### Установка на устройство

**Desktop (Chrome/Edge):**
1. Откройте приложение в браузере
2. Нажмите на иконку установки в адресной строке
3. Подтвердите установку

**Mobile (Android):**
1. Откройте приложение в Chrome
2. Нажмите меню (⋮) → "Добавить на главный экран"
3. Подтвердите установку

**iOS (Safari):**
1. Откройте приложение в Safari
2. Нажмите кнопку "Поделиться" (⬆️)
3. Выберите "На экран «Домой»"
4. Подтвердите установку

### Обновление PWA

Приложение автоматически обновляется при наличии новой версии:
- Service Worker проверяет обновления при каждой загрузке
- Пользователь получает уведомление о доступности новой версии
- Обновление происходит в фоновом режиме

### Тестирование PWA

**Lighthouse:**
```bash
npm run build
npx serve dist
# Откройте http://localhost:3000
# Запустите Lighthouse в DevTools → вкладка Lighthouse → Generate report
```

**DevTools:**
1. Откройте DevTools (F12)
2. Вкладка Application → Manifest (проверьте манифест)
3. Вкладка Application → Service Workers (проверьте SW)
4. Вкладка Application → Cache Storage (проверьте кэш)

### Конфигурация

Настройки PWA находятся в `vite.config.js`:

```javascript
VitePWA({
  registerType: 'autoUpdate',  // Автоматическое обновление
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
    runtimeCaching: [
      // API-запросы не кэшируются
      {
        urlPattern: /^https:\/\/api\./i,
        handler: 'NetworkOnly',
      },
      // Шрифты кэшируются
      {
        urlPattern: /^https:\/\/fonts\./i,
        handler: 'CacheFirst',
      },
    ],
  },
})
```

### Отладка

**Очистка кэша:**
```javascript
// В консоли браузера:
caches.keys().then(names => {
  names.forEach(name => caches.delete(name));
});
```

**Отключение Service Worker:**
```javascript
// В консоли браузера:
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(reg => reg.unregister());
});
```

### Production Checklist

- [ ] Сгенерировать PNG-иконки (опционально)
- [ ] Проверить manifest.json
- [ ] Протестировать offline-режим
- [ ] Проверить установку на мобильные устройства
- [ ] Запустить Lighthouse audit
- [ ] Настроить HTTPS (обязательно для PWA)

### Полезные ссылки

- [PWA Documentation](https://web.dev/progressive-web-apps/)
- [Workbox Documentation](https://developers.google.com/web/tools/workbox)
- [Web App Manifest](https://web.dev/add-manifest/)
- [PWA Builder](https://www.pwabuilder.com/)
