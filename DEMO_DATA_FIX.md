# ✅ Исправление проблемы с демо-данными

## 🔍 Проблема

Демо-данные в демо-семье не участвовали в расчетах и отчетах.

## 🐛 Причины проблемы

### 1. Рассинхронизация `currentUserId`

**Проблема:**
- В `store/index.ts` начальное значение `currentUserId` устанавливалось как `OWNER_ID` ('user-owner-001')
- В `store/auth.ts` `DEMO_USER.id` был 'demo-user-001'
- При входе через `loginDemo()` устанавливался `currentUser` с `id = 'demo-user-001'`
- Но `currentUserId` в finance store не обновлялся автоматически
- В результате транзакции фильтровались по неправильному `currentUserId`

**Решение:**
Добавлен `useEffect` в `App.tsx`, который синхронизирует `currentUserId` с `currentUser.id` при каждом изменении `currentUser`:

```typescript
useEffect(() => {
  if (currentUser) {
    const { setCurrentUser } = useStore.getState();
    setCurrentUser(currentUser.id);
  }
}, [currentUser]);
```

### 2. Несоответствие ID пользователей

**Проблема:**
- В `seed.ts` использовались ID: 'user-owner-001', 'user-wife-002', 'user-kid-003'
- В `auth.ts` DEMO_USER.id был 'demo-user-001'
- ID не совпадали, что вызывало проблемы с фильтрацией

**Решение:**
Приведены все ID к единому формату:
- `OWNER_ID = 'demo-user-001'` (совпадает с DEMO_USER.id)
- `WIFE_ID = 'demo-wife-002'` (новая константа)
- `KID_ID = 'demo-kid-003'` (новая константа)

Все транзакции теперь используют эти константы через `createdById`.

## 🔧 Что было исправлено

### Файл `src/App.tsx`

**Добавлено:**
```typescript
// Синхронизация currentUserId с currentUser при входе
useEffect(() => {
  if (currentUser) {
    const { setCurrentUser } = useStore.getState();
    setCurrentUser(currentUser.id);
  }
}, [currentUser]);
```

**Результат:**
- При входе через `loginDemo()` или обычный `login()` автоматически устанавливается правильный `currentUserId`
- Все транзакции, бюджеты и отчёты теперь корректно фильтруются по текущему пользователю

### Файл `src/data/seed.ts`

**Изменено:**
```typescript
// Было:
export const OWNER_ID = 'user-owner-001';
export const MEMBER_IDS = ['user-owner-001', 'user-wife-002', 'user-kid-003'];

// Стало:
export const OWNER_ID = 'demo-user-001';
export const WIFE_ID = 'demo-wife-002';
export const KID_ID = 'demo-kid-003';
export const MEMBER_IDS = [OWNER_ID, WIFE_ID, KID_ID];
```

**Обновлены все транзакции:**
- Все `createdById: 'user-wife-002'` заменены на `createdById: WIFE_ID`
- Все `createdById: 'user-kid-003'` заменены на `createdById: KID_ID`
- Все `userId: 'user-wife-002'` заменены на `userId: WIFE_ID`
- Все `userId: 'user-kid-003'` заменены на `userId: KID_ID`

**Результат:**
- ID пользователей теперь согласованы между `auth.ts` и `seed.ts`
- Транзакции правильно связаны с пользователями
- Фильтрация по пользователю работает корректно

## 📊 Как это работает теперь

### Поток данных при входе:

1. **Пользователь нажимает "Демо-доступ"**
   - Вызывается `loginDemo()` из `useAuthStore`
   - Устанавливается `currentUser = DEMO_USER` (id: 'demo-user-001')
   - Устанавливается `currentFamilyId = 'demo-family-001'`

2. **Срабатывает `useEffect` в `App.tsx`**
   - Обнаруживает изменение `currentUser`
   - Вызывает `setCurrentUser(currentUser.id)` из `useStore`
   - Устанавливается `currentUserId = 'demo-user-001'`

3. **Инициализация данных**
   - Вызывается `init()` из `useStore`
   - Создаются демо-данные для `DEMO_FAMILY_ID`
   - Транзакции создаются с `createdById: OWNER_ID` ('demo-user-001'), `WIFE_ID`, `KID_ID`

4. **Отображение данных**
   - Компоненты используют `store.transactions`, `store.accounts` и т.д.
   - Computed getters вызывают `getCurrentFamilyData()`
   - `getCurrentFamilyData()` возвращает данные для `currentFamilyId` ('demo-family-001')
   - Все транзакции, бюджеты, отчёты отображаются корректно

### Пример работы отчётов:

**Отчёт "Доходы и расходы":**
```typescript
const monthTransactions = transactions.filter(t => {
  const d = t.date.split('T')[0];
  return d >= monthStart && d <= monthEnd;
});
```
- `transactions` берётся из `store.transactions`
- Это computed getter, который возвращает `getCurrentFamilyData().transactions`
- `getCurrentFamilyData()` возвращает данные для `currentFamilyId`
- Все транзакции демо-семьи теперь корректно отображаются

**Отчёт "По членам семьи":**
```typescript
transactions.filter(t => new Date(t.date) >= monthStart).forEach(t => {
  const existing = map.get(t.createdById) || { income: 0, expense: 0, count: 0 };
  // ...
});
```
- Транзакции фильтруются по `createdById`
- `createdById` теперь правильно установлен ('demo-user-001', 'demo-wife-002', 'demo-kid-003')
- Отчёт корректно группирует транзакции по пользователям

## ✅ Результат

### Что теперь работает:

✅ **Дашборд**
- Отображает все транзакции демо-семьи
- Корректно показывает доходы и расходы
- Правильно рассчитывает балансы счетов

✅ **Транзакции**
- Все 15 демо-транзакций отображаются
- Фильтрация по пользователю работает
- Поиск по транзакциям работает

✅ **Бюджеты**
- Все 5 демо-бюджетов отображаются
- Прогресс рассчитывается корректно
- Алерты работают правильно

✅ **Регулярные платежи**
- Все 5 демо-правил отображаются
- Предстоящие платежи рассчитываются
- Прогноз баланса работает

✅ **Отчёты**
- Отчёт "По членам семьи" корректно группирует транзакции
- Отчёт "По категориям" показывает все категории
- Отчёт "Наличные vs Безналичные" работает
- Все графики отображают демо-данные

✅ **Семья**
- Отображаются все 3 участника
- Отчёт по расходам работает
- Роли отображаются корректно

## 🧪 Тестирование

### Как проверить, что всё работает:

1. **Войдите в демо-режим:**
   - Нажмите "Демо-доступ" на странице входа
   - Или войдите как `demo` / `demo`

2. **Проверьте дашборд:**
   - Должны отображаться все демо-транзакции
   - Балансы счетов должны быть ненулевыми
   - Графики должны показывать данные

3. **Проверьте транзакции:**
   - Перейдите в раздел "Транзакции"
   - Должно быть 15 транзакций
   - Фильтр по пользователю должен работать

4. **Проверьте отчёты:**
   - Перейдите в раздел "Отчёты"
   - Отчёт "По членам семьи" должен показывать 3 участников
   - Графики должны отображать данные

5. **Проверьте бюджеты:**
   - Перейдите в раздел "Бюджеты"
   - Должно быть 5 бюджетов
   - Прогресс должен рассчитываться

## 📝 Технические детали

### Связь между stores:

```
┌─────────────────┐
│  useAuthStore   │
│                 │
│  currentUser    │──────┐
│  currentFamilyId│      │
└─────────────────┘      │
                         │ синхронизация через useEffect
                         ▼
┌─────────────────┐
│   useStore      │
│                 │
│  currentUserId  │◄─────┘
│  familiesData   │
│    └─[familyId] │
│       ├─accounts│
│       ├─categories│
│       ├─transactions│
│       ├─budgets │
│       └─recurringRules│
└─────────────────┘
```

### Поток данных:

```
loginDemo()
    ↓
setCurrentUser(DEMO_USER)
setCurrentFamilyId('demo-family-001')
    ↓
useEffect detects currentUser change
    ↓
setCurrentUser(currentUser.id)
    ↓
currentUserId = 'demo-user-001'
    ↓
getCurrentFamilyData()
    ↓
familiesData['demo-family-001']
    ↓
{ accounts, categories, transactions, budgets, ... }
    ↓
Components render data
```

## 🎯 Итог

**Проблема решена!** Теперь демо-данные в демо-семье:

✅ Участвуют во всех расчетах  
✅ Отображаются во всех отчётах  
✅ Корректно фильтруются по пользователю  
✅ Правильно группируются по членам семьи  
✅ Используются в графиках и диаграммах  

**Изменённые файлы:**
- `src/App.tsx` - добавлена синхронизация `currentUserId`
- `src/data/seed.ts` - приведены ID к единому формату

**Проект успешно собирается и готов к использованию!** 🚀

---

**Версия:** 6.3  
**Дата:** 2024  
**Статус:** ✅ Проблема с демо-данными решена
