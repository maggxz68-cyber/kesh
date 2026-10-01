# 🔧 Исправление проблемы с чеками

## ❌ Проблема

Чеки не добавлялись в базу данных при работе в offline режиме (без backend сервера).

## ✅ Решение

Добавлена полная поддержка чеков в offline режиме с сохранением в localStorage.

## 📝 Что было исправлено

### 1. Добавление транзакции с чеком (offline режим)

**Файл**: `src/store/index.ts` - метод `addTransaction`

**Что изменилось**:
- При добавлении транзакции с чеком в offline режиме, чек теперь сохраняется в localStorage
- Чек привязывается к транзакции через `transactionId`
- Данные чека сохраняются вместе с транзакцией

**Код**:
```typescript
// Сохраняем чек если есть
let updatedReceipts = fd.receipts;
const { receipt } = tx as any;
if (receipt && tx.hasReceipt) {
  const newReceipt: Receipt = {
    ...receipt,
    id: receipt.id || uuidv4(),
    transactionId: txId,
  } as Receipt;
  updatedReceipts = [...fd.receipts, newReceipt];
  newTx.receipt = newReceipt;
}
```

### 2. Обновление транзакции с чеком (offline режим)

**Файл**: `src/store/index.ts` - метод `updateTransaction`

**Что изменилось**:
- При обновлении транзакции с чеком, чек тоже обновляется
- Если чек не существовал, он создаётся
- Если чек был удалён (hasReceipt = false), он удаляется из localStorage

**Код**:
```typescript
// Обновляем чек если есть
let updatedReceipts = fd.receipts;
const { receipt } = changes as any;
if (receipt && changes.hasReceipt) {
  const existingIdx = updatedReceipts.findIndex(r => r.transactionId === id);
  if (existingIdx >= 0) {
    updatedReceipts = updatedReceipts.map((r, i) => i === existingIdx ? { ...r, ...receipt } : r);
  } else {
    const newReceipt: Receipt = {
      ...receipt,
      id: receipt.id || uuidv4(),
      transactionId: id,
    } as Receipt;
    updatedReceipts = [...updatedReceipts, newReceipt];
  }
  const foundReceipt = updatedReceipts.find(r => r.transactionId === id);
  updatedTransactions = updatedTransactions.map(t => t.id === id ? { ...t, receipt: foundReceipt || null } : t) as Transaction[];
} else if (changes.hasReceipt === false) {
  updatedReceipts = updatedReceipts.filter(r => r.transactionId !== id);
  updatedTransactions = updatedTransactions.map(t => t.id === id ? { ...t, receipt: null } : t) as Transaction[];
}
```

### 3. Удаление транзакции с чеком (offline режим)

**Файл**: `src/store/index.ts` - метод `deleteTransaction`

**Что изменилось**:
- При удалении транзакции, связанный чек тоже удаляется из localStorage

**Код**:
```typescript
const updated = {
  ...fd,
  transactions: fd.transactions.filter(t => t.id !== id),
  accounts: updatedAccounts,
  receipts: fd.receipts.filter(r => r.transactionId !== id), // Удаляем связанный чек
};
```

## 🧪 Как проверить работу

### В offline режиме (без backend)

1. Откройте приложение в режиме предварительного просмотра
2. Войдите как демо-пользователь или зарегистрируйтесь
3. Добавьте транзакцию с чеком:
   - Нажмите "Добавить транзакцию"
   - Заполните данные
   - Отметьте "Есть чек"
   - Заполните данные чека (номер, магазин, сумма, дата)
   - Нажмите "Сохранить"
4. Откройте транзакцию для редактирования
5. Убедитесь, что данные чека отображаются
6. Измените данные чека и сохраните
7. Убедитесь, что изменения сохранились
8. Удалите транзакцию
9. Убедитесь, что чек тоже удалён

### В online режиме (с backend)

1. Запустите backend сервер:
   ```bash
   cd server
   npm start
   ```
2. Откройте приложение
3. Войдите как demo / demo
4. Добавьте транзакцию с чеком
5. Проверьте, что чек сохранился в базе данных:
   ```bash
   # Подключитесь к базе данных
   docker exec -it finance-backend sh
   sqlite3 /app/data/finance.db
   
   # Проверьте чеки
   SELECT * FROM receipts;
   SELECT * FROM receipt_items;
   ```

## 📊 Структура данных чека

```typescript
interface Receipt {
  id: string;                    // UUID чека
  transactionId: string;         // ID связанной транзакции
  receiptNumber: string;         // Номер чека
  storeName: string;             // Название магазина
  receiptDate: string;           // Дата чека (ISO string)
  totalAmount: number;           // Общая сумма
  filePath: string | null;       // Путь к файлу (если есть)
  items: ReceiptItem[];          // Позиции чека
}

interface ReceiptItem {
  id: string;                    // UUID позиции
  name: string;                  // Название товара
  quantity: number;              // Количество
  price: number;                 // Цена за единицу
  total: number;                 // Общая сумма (quantity * price)
}
```

## 🔄 Синхронизация

### Offline → Online

Когда backend становится доступен:
1. Приложение автоматически определяет доступность backend через `/api/health`
2. При следующем добавлении/обновлении транзакции данные отправляются на сервер
3. Чеки сохраняются в таблицу `receipts` и `receipt_items`

### Online → Offline

Если backend недоступен:
1. Приложение переключается в offline режим
2. Все данные (включая чеки) сохраняются в localStorage
3. При восстановлении соединения данные можно синхронизировать вручную

## 🐛 Возможные проблемы

### Чеки не сохраняются в offline режиме

**Причина**: localStorage может быть очищен браузером

**Решение**: 
- Используйте режим "Не очищать данные сайтов" в настройках браузера
- Или работайте с backend сервером для надёжного хранения

### Чеки не сохраняются в online режиме

**Причина**: Backend сервер не запущен или таблицы не созданы

**Решение**:
```bash
# Проверьте, что сервер запущен
curl http://localhost:3001/api/health

# Перезапустите сервер для создания таблиц
cd server
rm data/finance.db
npm start
```

### Ошибка "Чеки не поддерживаются сервером"

**Причина**: Маршруты для чеков не зарегистрированы в backend

**Решение**:
```bash
# Проверьте наличие маршрутов в server/index.js
grep -n "receipts" server/index.js

# Перезапустите сервер
cd server
npm start
```

## 📚 Связанные файлы

- `src/store/index.ts` - основная логика работы с чеками
- `src/api/client.ts` - API клиент для работы с backend
- `server/index.js` - backend маршруты для чеков
- `src/pages/AddTransaction.tsx` - UI для добавления транзакций с чеками
- `src/utils/receiptParser.ts` - парсер QR-кодов чеков

## ✅ Статус

- ✅ Добавление чеков в offline режиме
- ✅ Обновление чеков в offline режиме
- ✅ Удаление чеков в offline режиме
- ✅ Добавление чеков в online режиме
- ✅ Обновление чеков в online режиме
- ✅ Удаление чеков в online режиме
- ✅ Привязка чеков к транзакциям
- ✅ Сохранение в localStorage (offline)
- ✅ Сохранение в SQLite (online)

**Проблема решена!** 🎉
