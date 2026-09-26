import { v4 as uuidv4 } from 'uuid';
import {
  Account, AccountType, Category, Currency, PaymentMethod, Transaction, TransactionType,
  Budget, BudgetPeriod, BudgetType, BudgetScope,
  RecurringRule, RecurFreq, RecurMode,
  ExchangeRate, FamilyMember,
} from '../types';
import { UserRole } from '../types/auth';

export const OWNER_ID = 'user-owner-001';
export const MEMBER_IDS = ['user-owner-001', 'user-wife-002', 'user-kid-003'];

export const defaultFamilyMembers: FamilyMember[] = [
  { id: uuidv4(), userId: OWNER_ID, name: 'Иван Петров', email: 'ivan@mail.ru', role: UserRole.FAMILY_ADMIN, avatar: '👨', color: '#3b82f6', joinedAt: new Date().toISOString() },
  { id: uuidv4(), userId: 'user-wife-002', name: 'Мария Петрова', email: 'maria@mail.ru', role: UserRole.FAMILY_ADMIN, avatar: '👩', color: '#ec4899', joinedAt: new Date().toISOString() },
  { id: uuidv4(), userId: 'user-kid-003', name: 'Алексей Петров', email: 'alex@mail.ru', role: UserRole.USER, avatar: '👦', color: '#22c55e', joinedAt: new Date().toISOString() },
];

export const defaultCategories: Category[] = [
  { id: uuidv4(), familyId: 'family-001', name: 'Продукты', type: TransactionType.EXPENSE, parentId: null, icon: '🛒', color: '#22c55e' },
  { id: uuidv4(), familyId: 'family-001', name: 'Транспорт', type: TransactionType.EXPENSE, parentId: null, icon: '🚗', color: '#3b82f6' },
  { id: uuidv4(), familyId: 'family-001', name: 'ЖКХ', type: TransactionType.EXPENSE, parentId: null, icon: '🏠', color: '#f59e0b' },
  { id: uuidv4(), familyId: 'family-001', name: 'Здоровье', type: TransactionType.EXPENSE, parentId: null, icon: '💊', color: '#ef4444' },
  { id: uuidv4(), familyId: 'family-001', name: 'Образование', type: TransactionType.EXPENSE, parentId: null, icon: '📚', color: '#8b5cf6' },
  { id: uuidv4(), familyId: 'family-001', name: 'Развлечения', type: TransactionType.EXPENSE, parentId: null, icon: '🎮', color: '#ec4899' },
  { id: uuidv4(), familyId: 'family-001', name: 'Одежда', type: TransactionType.EXPENSE, parentId: null, icon: '👕', color: '#06b6d4' },
  { id: uuidv4(), familyId: 'family-001', name: 'Связь', type: TransactionType.EXPENSE, parentId: null, icon: '📱', color: '#84cc16' },
  { id: uuidv4(), familyId: 'family-001', name: 'Прочее', type: TransactionType.EXPENSE, parentId: null, icon: '📦', color: '#6b7280' },
  { id: uuidv4(), familyId: 'family-001', name: 'Зарплата', type: TransactionType.INCOME, parentId: null, icon: '💰', color: '#22c55e' },
  { id: uuidv4(), familyId: 'family-001', name: 'Фриланс', type: TransactionType.INCOME, parentId: null, icon: '💻', color: '#3b82f6' },
  { id: uuidv4(), familyId: 'family-001', name: 'Подарки', type: TransactionType.INCOME, parentId: null, icon: '🎁', color: '#ec4899' },
  { id: uuidv4(), familyId: 'family-001', name: 'Инвестиции', type: TransactionType.INCOME, parentId: null, icon: '📈', color: '#f59e0b' },
  { id: uuidv4(), familyId: 'family-001', name: 'Прочие доходы', type: TransactionType.INCOME, parentId: null, icon: '💵', color: '#6b7280' },
];

export const defaultAccounts: Account[] = [
  { id: uuidv4(), familyId: 'family-001', name: 'Наличные', type: AccountType.CASH, currency: Currency.RUB, balance: 15000, isShared: true, createdAt: new Date().toISOString() },
  { id: uuidv4(), familyId: 'family-001', name: 'Карта Сбербанк', type: AccountType.CARD, currency: Currency.RUB, balance: 85000, isShared: true, createdAt: new Date().toISOString() },
  { id: uuidv4(), familyId: 'family-001', name: 'Вклад', type: AccountType.SAVINGS, currency: Currency.RUB, balance: 200000, isShared: true, createdAt: new Date().toISOString() },
  { id: uuidv4(), familyId: 'family-001', name: 'Карта USD', type: AccountType.CARD, currency: Currency.USD, balance: 500, isShared: false, createdAt: new Date().toISOString() },
  { id: uuidv4(), familyId: 'family-001', name: 'Наличные EUR', type: AccountType.CASH, currency: Currency.EUR, balance: 200, isShared: false, createdAt: new Date().toISOString() },
];

export const defaultExchangeRates: ExchangeRate[] = [
  { id: uuidv4(), baseCode: 'USD', quoteCode: 'RUB', rate: 92.50, date: new Date().toISOString(), source: 'CBR' },
  { id: uuidv4(), baseCode: 'EUR', quoteCode: 'RUB', rate: 100.30, date: new Date().toISOString(), source: 'CBR' },
  { id: uuidv4(), baseCode: 'KZT', quoteCode: 'RUB', rate: 0.19, date: new Date().toISOString(), source: 'CBR' },
  { id: uuidv4(), baseCode: 'CNY', quoteCode: 'RUB', rate: 12.80, date: new Date().toISOString(), source: 'CBR' },
  { id: uuidv4(), baseCode: 'EUR', quoteCode: 'USD', rate: 1.08, date: new Date().toISOString(), source: 'CBR' },
];

export function generateSeedTransactions(accounts: Account[], categories: Category[]): Transaction[] {
  const expenseCats = categories.filter(c => c.type === TransactionType.EXPENSE);
  const incomeCats = categories.filter(c => c.type === TransactionType.INCOME);
  const cashAccount = accounts.find(a => a.type === AccountType.CASH && a.currency === Currency.RUB)!;
  const cardAccount = accounts.find(a => a.type === AccountType.CARD && a.currency === Currency.RUB)!;
  const usdAccount = accounts.find(a => a.currency === Currency.USD)!;
  const eurAccount = accounts.find(a => a.currency === Currency.EUR)!;

  const now = new Date();
  const transactions: Transaction[] = [
    {
      id: uuidv4(), familyId: 'family-001', type: TransactionType.INCOME, amount: 95000, currency: Currency.RUB,
      date: new Date(now.getFullYear(), now.getMonth(), 5).toISOString(),
      accountId: cardAccount.id, toAccountId: null, categoryId: incomeCats[0].id,
      paymentMethod: PaymentMethod.CASHLESS, description: 'Зарплата за месяц',
      counterparty: 'ООО Компания', hasReceipt: false, receipt: null, tags: ['зарплата'],
      isPrivate: false, createdById: OWNER_ID, recurringRuleId: null,
      createdAt: new Date(now.getFullYear(), now.getMonth(), 5).toISOString(),
    },
    {
      id: uuidv4(), type: TransactionType.INCOME, amount: 65000, currency: Currency.RUB,
      date: new Date(now.getFullYear(), now.getMonth(), 5).toISOString(),
      accountId: cardAccount.id, toAccountId: null, categoryId: incomeCats[0].id,
      paymentMethod: PaymentMethod.CASHLESS, description: 'Зарплата Марии',
      counterparty: 'ООО Техно', hasReceipt: false, receipt: null, tags: ['зарплата'],
      isPrivate: false, createdById: 'user-wife-002', recurringRuleId: null,
      createdAt: new Date(now.getFullYear(), now.getMonth(), 5).toISOString(),
    },
    {
      id: uuidv4(), type: TransactionType.EXPENSE, amount: 4500, currency: Currency.RUB,
      date: new Date(now.getFullYear(), now.getMonth(), 7).toISOString(),
      accountId: cashAccount.id, toAccountId: null, categoryId: expenseCats[0].id,
      paymentMethod: PaymentMethod.CASH, description: 'Продукты на неделю',
      counterparty: 'Пятёрочка', hasReceipt: true,
      receipt: {
        id: uuidv4(), transactionId: '', receiptNumber: '001-2024-001',
        storeName: 'Пятёрочка', receiptDate: new Date(now.getFullYear(), now.getMonth(), 7).toISOString(),
        totalAmount: 4500, filePath: null,
        items: [
          { id: uuidv4(), name: 'Молоко 3.2%', quantity: 2, price: 89, total: 178 },
          { id: uuidv4(), name: 'Хлеб белый', quantity: 1, price: 45, total: 45 },
          { id: uuidv4(), name: 'Сыр Российский', quantity: 1, price: 320, total: 320 },
          { id: uuidv4(), name: 'Курица филе', quantity: 1, price: 450, total: 450 },
        ],
      },
      tags: ['продукты'], isPrivate: false, createdById: 'user-wife-002', recurringRuleId: null,
      createdAt: new Date(now.getFullYear(), now.getMonth(), 7).toISOString(),
    },
    {
      id: uuidv4(), type: TransactionType.EXPENSE, amount: 2100, currency: Currency.RUB,
      date: new Date(now.getFullYear(), now.getMonth(), 8).toISOString(),
      accountId: cardAccount.id, toAccountId: null, categoryId: expenseCats[1].id,
      paymentMethod: PaymentMethod.CASHLESS, description: 'Бензин',
      counterparty: 'Лукойл', hasReceipt: true,
      receipt: {
        id: uuidv4(), transactionId: '', receiptNumber: 'АЗС-2024-155',
        storeName: 'Лукойл АЗС', receiptDate: new Date(now.getFullYear(), now.getMonth(), 8).toISOString(),
        totalAmount: 2100, filePath: null,
        items: [{ id: uuidv4(), name: 'АИ-95', quantity: 40, price: 52.5, total: 2100 }],
      },
      tags: ['транспорт'], isPrivate: false, createdById: OWNER_ID, recurringRuleId: null,
      createdAt: new Date(now.getFullYear(), now.getMonth(), 8).toISOString(),
    },
    {
      id: uuidv4(), type: TransactionType.EXPENSE, amount: 8500, currency: Currency.RUB,
      date: new Date(now.getFullYear(), now.getMonth(), 10).toISOString(),
      accountId: cardAccount.id, toAccountId: null, categoryId: expenseCats[2].id,
      paymentMethod: PaymentMethod.CASHLESS, description: 'Коммунальные услуги',
      counterparty: 'УК Дом', hasReceipt: false, receipt: null, tags: ['жкх'],
      isPrivate: false, createdById: OWNER_ID, recurringRuleId: null,
      createdAt: new Date(now.getFullYear(), now.getMonth(), 10).toISOString(),
    },
    {
      id: uuidv4(), type: TransactionType.EXPENSE, amount: 1200, currency: Currency.RUB,
      date: new Date(now.getFullYear(), now.getMonth(), 12).toISOString(),
      accountId: cashAccount.id, toAccountId: null, categoryId: expenseCats[3].id,
      paymentMethod: PaymentMethod.CASH, description: 'Лекарства',
      counterparty: 'Аптека 36.6', hasReceipt: false, receipt: null, tags: ['здоровье'],
      isPrivate: false, createdById: 'user-wife-002', recurringRuleId: null,
      createdAt: new Date(now.getFullYear(), now.getMonth(), 12).toISOString(),
    },
    {
      id: uuidv4(), type: TransactionType.EXPENSE, amount: 3500, currency: Currency.RUB,
      date: new Date(now.getFullYear(), now.getMonth(), 14).toISOString(),
      accountId: cardAccount.id, toAccountId: null, categoryId: expenseCats[5].id,
      paymentMethod: PaymentMethod.CASHLESS, description: 'Кино и ужин',
      counterparty: 'Карофильм', hasReceipt: false, receipt: null, tags: ['развлечения'],
      isPrivate: false, createdById: OWNER_ID, recurringRuleId: null,
      createdAt: new Date(now.getFullYear(), now.getMonth(), 14).toISOString(),
    },
    {
      id: uuidv4(), type: TransactionType.INCOME, amount: 25000, currency: Currency.RUB,
      date: new Date(now.getFullYear(), now.getMonth(), 15).toISOString(),
      accountId: cardAccount.id, toAccountId: null, categoryId: incomeCats[1].id,
      paymentMethod: PaymentMethod.CASHLESS, description: 'Проект - разработка сайта',
      counterparty: 'ИП Клиент', hasReceipt: false, receipt: null, tags: ['фриланс'],
      isPrivate: false, createdById: OWNER_ID, recurringRuleId: null,
      createdAt: new Date(now.getFullYear(), now.getMonth(), 15).toISOString(),
    },
    {
      id: uuidv4(), type: TransactionType.EXPENSE, amount: 750, currency: Currency.RUB,
      date: new Date(now.getFullYear(), now.getMonth(), 16).toISOString(),
      accountId: cardAccount.id, toAccountId: null, categoryId: expenseCats[7].id,
      paymentMethod: PaymentMethod.CASHLESS, description: 'Мобильная связь',
      counterparty: 'МТС', hasReceipt: false, receipt: null, tags: ['связь'],
      isPrivate: false, createdById: OWNER_ID, recurringRuleId: null,
      createdAt: new Date(now.getFullYear(), now.getMonth(), 16).toISOString(),
    },
    {
      id: uuidv4(), type: TransactionType.TRANSFER, amount: 10000, currency: Currency.RUB,
      date: new Date(now.getFullYear(), now.getMonth(), 18).toISOString(),
      accountId: cardAccount.id, toAccountId: cashAccount.id, categoryId: null,
      paymentMethod: PaymentMethod.CASHLESS, description: 'Снятие наличных',
      counterparty: '', hasReceipt: false, receipt: null, tags: [],
      isPrivate: false, createdById: OWNER_ID, recurringRuleId: null,
      createdAt: new Date(now.getFullYear(), now.getMonth(), 18).toISOString(),
    },
    {
      id: uuidv4(), type: TransactionType.EXPENSE, amount: 5600, currency: Currency.RUB,
      date: new Date(now.getFullYear(), now.getMonth(), 20).toISOString(),
      accountId: cardAccount.id, toAccountId: null, categoryId: expenseCats[6].id,
      paymentMethod: PaymentMethod.CASHLESS, description: 'Зимняя куртка',
      counterparty: 'Zara', hasReceipt: true,
      receipt: {
        id: uuidv4(), transactionId: '', receiptNumber: 'ZARA-2024-889',
        storeName: 'Zara ТЦ Мега', receiptDate: new Date(now.getFullYear(), now.getMonth(), 20).toISOString(),
        totalAmount: 5600, filePath: null,
        items: [{ id: uuidv4(), name: 'Куртка зимняя', quantity: 1, price: 5600, total: 5600 }],
      },
      tags: ['одежда'], isPrivate: false, createdById: 'user-wife-002', recurringRuleId: null,
      createdAt: new Date(now.getFullYear(), now.getMonth(), 20).toISOString(),
    },
    {
      id: uuidv4(), type: TransactionType.EXPENSE, amount: 120, currency: Currency.USD,
      date: new Date(now.getFullYear(), now.getMonth(), 11).toISOString(),
      accountId: usdAccount.id, toAccountId: null, categoryId: expenseCats[5].id,
      paymentMethod: PaymentMethod.CASHLESS, description: 'Netflix подписка',
      counterparty: 'Netflix', hasReceipt: false, receipt: null, tags: ['подписка'],
      isPrivate: false, createdById: OWNER_ID, recurringRuleId: null,
      createdAt: new Date(now.getFullYear(), now.getMonth(), 11).toISOString(),
    },
    {
      id: uuidv4(), type: TransactionType.EXPENSE, amount: 85, currency: Currency.EUR,
      date: new Date(now.getFullYear(), now.getMonth(), 9).toISOString(),
      accountId: eurAccount.id, toAccountId: null, categoryId: expenseCats[0].id,
      paymentMethod: PaymentMethod.CASH, description: 'Продукты в поездке',
      counterparty: 'Carrefour', hasReceipt: false, receipt: null, tags: ['продукты'],
      isPrivate: false, createdById: OWNER_ID, recurringRuleId: null,
      createdAt: new Date(now.getFullYear(), now.getMonth(), 9).toISOString(),
    },
    {
      id: uuidv4(), type: TransactionType.EXPENSE, amount: 2000, currency: Currency.RUB,
      date: new Date(now.getFullYear(), now.getMonth(), 13).toISOString(),
      accountId: cashAccount.id, toAccountId: null, categoryId: expenseCats[4].id,
      paymentMethod: PaymentMethod.CASH, description: 'Курсы английского',
      counterparty: 'Skyeng', hasReceipt: false, receipt: null, tags: ['образование'],
      isPrivate: false, createdById: 'user-kid-003', recurringRuleId: null,
      createdAt: new Date(now.getFullYear(), now.getMonth(), 13).toISOString(),
    },
    {
      id: uuidv4(), type: TransactionType.EXPENSE, amount: 3200, currency: Currency.RUB,
      date: new Date(now.getFullYear(), now.getMonth(), 17).toISOString(),
      accountId: cardAccount.id, toAccountId: null, categoryId: expenseCats[0].id,
      paymentMethod: PaymentMethod.CASHLESS, description: 'Продукты Перекрёсток',
      counterparty: 'Перекрёсток', hasReceipt: true,
      receipt: {
        id: uuidv4(), transactionId: '', receiptNumber: 'PRK-2024-445',
        storeName: 'Перекрёсток', receiptDate: new Date(now.getFullYear(), now.getMonth(), 17).toISOString(),
        totalAmount: 3200, filePath: null,
        items: [
          { id: uuidv4(), name: 'Овощи микс', quantity: 2, price: 180, total: 360 },
          { id: uuidv4(), name: 'Рыба сёмга', quantity: 1, price: 1200, total: 1200 },
          { id: uuidv4(), name: 'Йогурты', quantity: 4, price: 65, total: 260 },
        ],
      },
      tags: ['продукты'], isPrivate: false, createdById: 'user-wife-002', recurringRuleId: null,
      createdAt: new Date(now.getFullYear(), now.getMonth(), 17).toISOString(),
    },
  ];

  transactions.forEach(t => {
    if (t.receipt) t.receipt.transactionId = t.id;
  });

  return transactions;
}

export function generateSeedBudgets(categories: Category[]): Budget[] {
  const expenseCats = categories.filter(c => c.type === TransactionType.EXPENSE);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  return [
    {
      id: uuidv4(), name: 'Продукты на месяц', categoryId: expenseCats[0].id,
      amount: 25000, currency: Currency.RUB, period: BudgetPeriod.MONTH,
      startDate: monthStart, type: BudgetType.HARD, scope: BudgetScope.FAMILY,
      userId: null, alertAt80: true, alertAt100: true, isActive: true, createdAt: monthStart,
    },
    {
      id: uuidv4(), name: 'Транспорт', categoryId: expenseCats[1].id,
      amount: 8000, currency: Currency.RUB, period: BudgetPeriod.MONTH,
      startDate: monthStart, type: BudgetType.SOFT, scope: BudgetScope.FAMILY,
      userId: null, alertAt80: true, alertAt100: false, isActive: true, createdAt: monthStart,
    },
    {
      id: uuidv4(), name: 'Развлечения', categoryId: expenseCats[5].id,
      amount: 5000, currency: Currency.RUB, period: BudgetPeriod.MONTH,
      startDate: monthStart, type: BudgetType.SOFT, scope: BudgetScope.PERSONAL,
      userId: OWNER_ID, alertAt80: true, alertAt100: true, isActive: true, createdAt: monthStart,
    },
    {
      id: uuidv4(), name: 'ЖКХ', categoryId: expenseCats[2].id,
      amount: 12000, currency: Currency.RUB, period: BudgetPeriod.MONTH,
      startDate: monthStart, type: BudgetType.HARD, scope: BudgetScope.FAMILY,
      userId: null, alertAt80: true, alertAt100: true, isActive: true, createdAt: monthStart,
    },
    {
      id: uuidv4(), name: 'Связь', categoryId: expenseCats[7].id,
      amount: 2000, currency: Currency.RUB, period: BudgetPeriod.MONTH,
      startDate: monthStart, type: BudgetType.SOFT, scope: BudgetScope.FAMILY,
      userId: null, alertAt80: false, alertAt100: true, isActive: true, createdAt: monthStart,
    },
  ];
}

export function generateSeedRecurring(accounts: Account[], categories: Category[]): RecurringRule[] {
  const expenseCats = categories.filter(c => c.type === TransactionType.EXPENSE);
  const incomeCats = categories.filter(c => c.type === TransactionType.INCOME);
  const cardAccount = accounts.find(a => a.type === AccountType.CARD && a.currency === Currency.RUB)!;
  const cashAccount = accounts.find(a => a.type === AccountType.CASH && a.currency === Currency.RUB)!;
  const usdAccount = accounts.find(a => a.currency === Currency.USD)!;

  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return [
    {
      id: uuidv4(), name: 'Зарплата', type: TransactionType.INCOME, amount: 95000,
      currency: Currency.RUB, accountId: cardAccount.id, toAccountId: null,
      categoryId: incomeCats[0].id, paymentMethod: PaymentMethod.CASHLESS,
      counterparty: 'ООО Компания', description: 'Ежемесячная зарплата',
      expectsReceipt: false, freq: RecurFreq.MONTHLY, interval: 1, byMonthDay: 5,
      startDate: new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString(),
      endDate: null, count: null, nextRunAt: new Date(now.getFullYear(), now.getMonth() + 1, 5).toISOString(),
      mode: RecurMode.AUTO, notifyDaysBefore: 1, isActive: true, userId: OWNER_ID,
      skippedDates: [], createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(), name: 'Аренда квартиры', type: TransactionType.EXPENSE, amount: 35000,
      currency: Currency.RUB, accountId: cardAccount.id, toAccountId: null,
      categoryId: expenseCats[2].id, paymentMethod: PaymentMethod.CASHLESS,
      counterparty: 'Арендодатель', description: 'Ежемесячная аренда',
      expectsReceipt: true, freq: RecurFreq.MONTHLY, interval: 1, byMonthDay: 1,
      startDate: new Date(now.getFullYear(), now.getMonth() - 12, 1).toISOString(),
      endDate: null, count: null, nextRunAt: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
      mode: RecurMode.MANUAL, notifyDaysBefore: 3, isActive: true, userId: OWNER_ID,
      skippedDates: [], createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(), name: 'Интернет + ТВ', type: TransactionType.EXPENSE, amount: 800,
      currency: Currency.RUB, accountId: cardAccount.id, toAccountId: null,
      categoryId: expenseCats[7].id, paymentMethod: PaymentMethod.CASHLESS,
      counterparty: 'Ростелеком', description: 'Домашний интернет',
      expectsReceipt: false, freq: RecurFreq.MONTHLY, interval: 1, byMonthDay: 15,
      startDate: new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString(),
      endDate: null, count: null, nextRunAt: new Date(now.getFullYear(), now.getMonth() + 1, 15).toISOString(),
      mode: RecurMode.AUTO, notifyDaysBefore: 1, isActive: true, userId: OWNER_ID,
      skippedDates: [], createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(), name: 'Netflix', type: TransactionType.EXPENSE, amount: 120,
      currency: Currency.USD, accountId: usdAccount.id, toAccountId: null,
      categoryId: expenseCats[5].id, paymentMethod: PaymentMethod.CASHLESS,
      counterparty: 'Netflix', description: 'Подписка Netflix',
      expectsReceipt: false, freq: RecurFreq.MONTHLY, interval: 1, byMonthDay: 11,
      startDate: new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString(),
      endDate: null, count: null, nextRunAt: new Date(now.getFullYear(), now.getMonth() + 1, 11).toISOString(),
      mode: RecurMode.AUTO, notifyDaysBefore: 1, isActive: true, userId: OWNER_ID,
      skippedDates: [], createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(), name: 'Карманные деньги', type: TransactionType.EXPENSE, amount: 3000,
      currency: Currency.RUB, accountId: cashAccount.id, toAccountId: null,
      categoryId: expenseCats[8].id, paymentMethod: PaymentMethod.CASH,
      counterparty: 'Сын', description: 'Еженедельные карманные деньги',
      expectsReceipt: false, freq: RecurFreq.WEEKLY, interval: 1, byMonthDay: null,
      startDate: new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString(),
      endDate: null, count: null, nextRunAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      mode: RecurMode.MANUAL, notifyDaysBefore: 0, isActive: true, userId: OWNER_ID,
      skippedDates: [], createdAt: new Date().toISOString(),
    },
  ];
}
